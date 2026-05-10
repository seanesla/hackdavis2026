"use client";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useStore,
  type InterviewAnswers,
  type InterviewKey,
  type BuildingLayout,
  type VoiceMaterial,
  type VoiceUseType,
} from "@/lib/store";
import {
  preloadVoices,
  speak,
  stopSpeaking,
  isSpeaking,
  useRecognizer,
} from "@/lib/speech";
import MuteToggle from "@/components/voice/MuteToggle";

type AnswerValue = number | BuildingLayout | VoiceMaterial | VoiceUseType;

type Question = {
  id: InterviewKey;
  text: string;
  retry: string;
  label: string;
  parse: (raw: string) => AnswerValue | null;
  default: AnswerValue;
  describe: (v: AnswerValue) => string;
  confirm: (v: AnswerValue, usedDefault: boolean) => string;
};

const WORD_NUM: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

const INTERVIEW_Q: Question[] = [
  {
    id: "floorAreaSqft",
    label: "floor area",
    text: "What is the total floor area you are planning?",
    retry:
      "Sorry, I didn't catch a number. About how many square feet — something like 2400, or 15000?",
    parse: (raw) => {
      // Strip commas first — Chrome transcribes "fifteen thousand" as "15,000"
      // and the digit regex would otherwise stop at the comma.
      const cleaned = raw.toLowerCase().replace(/,/g, "");
      const match = cleaned.match(/(\d{1,7})/);
      if (!match) return null;
      let n = parseInt(match[1], 10);
      if (/thousand|k\b/.test(cleaned) && n < 1000) n *= 1000;
      return n;
    },
    default: 2400,
    describe: (v) => `${v} square feet`,
    confirm: (v, used) =>
      used
        ? `No worries — defaulting to ${v} square feet.`
        : `Got it. ${v} square feet.`,
  },
  {
    id: "stories",
    label: "floors",
    text: "How many floors will the building have?",
    retry:
      "Quick clarification — how many floors specifically? One, two, three?",
    parse: (raw) => {
      const cleaned = raw.toLowerCase();
      const digit = cleaned.match(/\b(\d{1,2})\b/);
      if (digit) return parseInt(digit[1], 10);
      for (const word of Object.keys(WORD_NUM)) {
        if (new RegExp(`\\b${word}\\b`).test(cleaned)) return WORD_NUM[word];
      }
      return null;
    },
    default: 2,
    describe: (v) => `${v} floor${v === 1 ? "" : "s"}`,
    confirm: (v, used) =>
      used
        ? `No problem — going with ${v} floors.`
        : `Okay, ${v} floors.`,
  },
  {
    id: "layout",
    label: "layout",
    text: "What is the basic layout — open plan or divided units?",
    retry: "Just to be clear — open plan, or divided into separate units?",
    parse: (raw) => {
      const cleaned = raw.toLowerCase();
      if (/divid|unit|apartment|room|partition/.test(cleaned)) return "divided";
      if (/open/.test(cleaned)) return "open";
      return null;
    },
    default: "open",
    describe: (v) => `${v} layout`,
    confirm: (v, used) =>
      used ? `Defaulting to an ${v} layout.` : `Got it, ${v} layout.`,
  },
  {
    id: "material",
    label: "material",
    text: "What structural material do you prefer — concrete, steel, wood, brick, stucco, or glass?",
    retry: "Was that concrete, steel, wood, brick, stucco, or glass?",
    parse: (raw) => {
      const cleaned = raw.toLowerCase();
      if (/concrete/.test(cleaned)) return "concrete";
      if (/steel|metal/.test(cleaned)) return "steel";
      if (/wood|timber/.test(cleaned)) return "wood";
      if (/brick/.test(cleaned)) return "brick";
      if (/stucco/.test(cleaned)) return "stucco";
      if (/glass|curtain wall/.test(cleaned)) return "glass";
      if (/other|something else/.test(cleaned)) return "other";
      return null;
    },
    default: "concrete",
    describe: (v) => `${v} construction`,
    confirm: (v, used) =>
      used
        ? `No problem — defaulting to ${v}.`
        : `Nice, ${v} it is.`,
  },
  {
    id: "useType",
    label: "use",
    text: "What load capacity is needed — residential, commercial, or other?",
    retry: "Is this for residential, commercial, or another use?",
    parse: (raw) => {
      const cleaned = raw.toLowerCase();
      if (/residen|home|apartment|hous|live|living/.test(cleaned)) return "residential";
      if (/commerc|office|retail|shop|store/.test(cleaned)) return "commercial";
      if (/other|mixed/.test(cleaned)) return "other";
      return null;
    },
    default: "residential",
    describe: (v) => `${v} use`,
    confirm: (v, used) =>
      used ? `Defaulting to ${v} use.` : `Perfect, ${v} use.`,
  },
];

const LISTEN_TIMEOUT_MS = 8000;
const POLL_MS = 150;

type Phase = "asking" | "listening" | "retrying" | "confirming" | "done";

export default function InterviewFlow() {
  const interviewIndex = useStore((s) => s.interviewIndex);
  const interviewAnswers = useStore((s) => s.interviewAnswers);
  const transcript = useStore((s) => s.transcript);
  const setAnswer = useStore((s) => s.setAnswer);
  const pushTranscript = useStore((s) => s.pushTranscript);
  const nextQuestion = useStore((s) => s.nextQuestion);
  const resetVoice = useStore((s) => s.resetVoice);
  const runFromInterview = useStore((s) => s.runFromInterview);
  const muted = useStore((s) => s.muted);

  const recognizer = useRecognizer();
  const [phase, setPhase] = useState<Phase>("asking");
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const finalizedRef = useRef(false);
  const attemptRef = useRef(0);
  const confirmTextRef = useRef("");
  const skipRef = useRef<null | (() => void)>(null);

  useEffect(() => {
    resetVoice();
    return () => {
      resetVoice();
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = setInterval(() => setAiSpeaking(isSpeaking()), 200);
    return () => clearInterval(id);
  }, []);

  // Per-question: speak the question then transition to listening.
  useEffect(() => {
    let cancelled = false;

    if (interviewIndex >= INTERVIEW_Q.length) {
      if (finalizedRef.current) return;
      finalizedRef.current = true;

      // Kick off plan generation immediately and fade the overlay right away.
      // The closing audio plays in the background while the scene reveals.
      // We don't gate UI on speech callbacks — they can fail to fire under
      // certain browser conditions and that would hang the demo.
      runFromInterview(interviewAnswers);

      const closing = "Got it. Building your plan now.";
      pushTranscript({ who: "ai", text: closing });
      speak(closing);

      setPhase("done");

      return () => {
        cancelled = true;
        stopSpeaking();
      };
    }

    attemptRef.current = 0;
    const q = INTERVIEW_Q[interviewIndex];
    setPhase("asking");
    pushTranscript({ who: "ai", text: q.text });
    speak(q.text, {
      onEnd: () => {
        if (cancelled) return;
        setPhase("listening");
      },
    });

    return () => {
      cancelled = true;
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviewIndex]);

  // Speak retry prompt when we transition into "retrying".
  useEffect(() => {
    if (phase !== "retrying") return;
    let cancelled = false;
    const q = INTERVIEW_Q[interviewIndex];
    speak(q.retry, {
      onEnd: () => {
        if (cancelled) return;
        setPhase("listening");
      },
    });
    return () => {
      cancelled = true;
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, interviewIndex]);

  // Speak confirmation when we transition into "confirming".
  useEffect(() => {
    if (phase !== "confirming") return;
    let cancelled = false;
    const text = confirmTextRef.current;
    speak(text, {
      onEnd: () => {
        if (cancelled) return;
        nextQuestion();
      },
    });
    return () => {
      cancelled = true;
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Listen when phase is "listening" AND mic is not muted.
  // When muted toggles, this effect tears down (unmute → restarts listen).
  useEffect(() => {
    if (phase !== "listening") return;
    if (muted) {
      // Make sure no recognizer is running while muted.
      recognizer.stop();
      return;
    }

    let cancelled = false;
    let pollId: ReturnType<typeof setInterval> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let startDelay: ReturnType<typeof setTimeout> | null = null;
    let everListened = false;
    let resolved = false;

    const cleanup = () => {
      if (pollId) clearInterval(pollId);
      if (timeoutId) clearTimeout(timeoutId);
      if (startDelay) clearTimeout(startDelay);
    };

    const handleResult = (text: string) => {
      if (cancelled || resolved) return;
      resolved = true;
      cleanup();
      recognizer.stop();
      const q = INTERVIEW_Q[interviewIndex];
      const trimmed = text.trim();
      const parsed = trimmed ? q.parse(trimmed) : null;

      if (parsed !== null || attemptRef.current >= 1) {
        // Finalize this question.
        const usedDefault = parsed === null;
        const value = (parsed ?? q.default) as AnswerValue;
        setAnswer(q.id, value as InterviewAnswers[InterviewKey]);
        pushTranscript({
          who: "user",
          text: trimmed
            ? trimmed
            : `(no answer — defaulting to ${q.describe(value)})`,
        });
        const confirmText = q.confirm(value, usedDefault);
        confirmTextRef.current = confirmText;
        pushTranscript({ who: "ai", text: confirmText });
        setPhase("confirming");
      } else {
        // Retry once.
        attemptRef.current = 1;
        pushTranscript({
          who: "user",
          text: trimmed || "(no answer)",
        });
        pushTranscript({ who: "ai", text: q.retry });
        setPhase("retrying");
      }
    };

    // Make sure no audio is still playing (Chrome can lock the mic during
    // playback for echo cancellation), then start the recognizer.
    stopSpeaking();
    recognizer.reset();
    startDelay = setTimeout(() => {
      if (cancelled) return;
      recognizer.start();

      pollId = setInterval(() => {
        if (cancelled) return;
        if (recognizer.listeningRef.current) {
          everListened = true;
          return;
        }
        if (everListened) handleResult(recognizer.finalRef.current);
      }, POLL_MS);

      timeoutId = setTimeout(() => {
        if (cancelled) return;
        recognizer.stop();
        setTimeout(() => {
          if (!cancelled && !resolved) handleResult(recognizer.finalRef.current);
        }, 250);
      }, LISTEN_TIMEOUT_MS);
    }, 250);

    return () => {
      cancelled = true;
      cleanup();
      recognizer.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, muted, interviewIndex]);

  // Skip button — finalize immediately with default for the current question.
  skipRef.current = () => {
    if (interviewIndex >= INTERVIEW_Q.length) return;
    const q = INTERVIEW_Q[interviewIndex];
    const value = q.default;
    setAnswer(q.id, value as InterviewAnswers[InterviewKey]);
    pushTranscript({
      who: "user",
      text: `(skipped — defaulting to ${q.describe(value)})`,
    });
    const confirmText = q.confirm(value, true);
    confirmTextRef.current = confirmText;
    pushTranscript({ who: "ai", text: confirmText });
    setPhase("confirming");
  };

  const currentQ =
    interviewIndex < INTERVIEW_Q.length ? INTERVIEW_Q[interviewIndex] : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: phase === "done" ? 0 : 1 }}
      transition={{ duration: phase === "done" ? 1.2 : 0.4 }}
      className={`absolute inset-0 z-30 flex flex-col items-center justify-between px-6 py-10 ${
        phase === "done" ? "pointer-events-none" : ""
      }`}
    >
      <div className="w-full max-w-3xl flex items-start justify-between pointer-events-auto">
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-mute">
          interview · question {Math.min(interviewIndex + 1, INTERVIEW_Q.length)} of{" "}
          {INTERVIEW_Q.length}
        </span>
      </div>

      <div className="w-full max-w-3xl flex flex-col items-center gap-6 pointer-events-auto">
        <AnimatePresence mode="wait">
          {currentQ ? (
            <motion.h2
              key={currentQ.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35 }}
              className="text-center font-mono text-2xl sm:text-3xl text-paper leading-snug px-4 py-6 rounded-md bg-ink/60 backdrop-blur-md border border-rule"
            >
              {currentQ.text}
            </motion.h2>
          ) : (
            <motion.h2
              key="closing"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center font-mono text-2xl sm:text-3xl text-paper leading-snug px-4 py-6 rounded-md bg-ink/60 backdrop-blur-md border border-rule"
            >
              building your plan…
            </motion.h2>
          )}
        </AnimatePresence>

        <div className="min-h-[2rem] w-full flex flex-col items-center gap-2">
          <div className="text-center font-mono text-base text-mute italic">
            {phase === "listening" && muted && "mic muted — click the mic icon to answer"}
            {phase === "listening" && !muted && (
              recognizer.interim ||
              (recognizer.listening
                ? "listening…"
                : "starting mic…")
            )}
            {phase === "asking" && aiSpeaking && "ai speaking…"}
            {phase === "retrying" && aiSpeaking && "ai asking again…"}
            {phase === "confirming" && aiSpeaking && "ai confirming…"}
          </div>
          {phase === "listening" && !muted && (
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span
                  className={`h-2 w-2 rounded-full ${
                    recognizer.listening
                      ? "bg-accent animate-pulse"
                      : "bg-rule"
                  }`}
                />
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-mute/70">
                  {recognizer.listening ? "mic live" : "mic idle"}
                </span>
              </span>
              <button
                onClick={() => {
                  stopSpeaking();
                  setTimeout(() => recognizer.start(), 150);
                }}
                className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent hover:text-paper transition-colors px-2 py-1 rounded border border-accent/40 hover:border-accent"
              >
                tap to talk
              </button>
            </div>
          )}
          {recognizer.error && phase === "listening" && (
            <div className="font-mono text-[10px] text-red-400 text-center">
              mic issue: {recognizer.error} — try clicking &quot;tap to talk&quot;
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {INTERVIEW_Q.map((q, i) => (
            <div
              key={q.id}
              className={`h-1.5 w-8 rounded-full transition-colors ${
                interviewIndex > i
                  ? "bg-accent"
                  : interviewIndex === i
                  ? "bg-accent/60"
                  : "bg-rule"
              }`}
            />
          ))}
        </div>

        {currentQ && (
          <button
            onClick={() => skipRef.current?.()}
            disabled={(phase !== "listening" && phase !== "retrying") || aiSpeaking}
            className="font-mono text-xs text-mute hover:text-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            skip →
          </button>
        )}
      </div>

      <div className="w-full max-w-3xl flex flex-col items-center gap-5 pointer-events-auto">
        <div className="w-full rounded-md border border-rule bg-ink/40 backdrop-blur-md max-h-40 overflow-y-auto p-3 flex flex-col gap-1.5">
          {transcript.length === 0 ? (
            <span className="font-mono text-[11px] text-mute/60">
              transcript will appear here…
            </span>
          ) : (
            transcript.slice(-12).map((entry, i) => (
              <div key={i} className="font-mono text-[11px] flex gap-2">
                <span
                  className={
                    entry.who === "ai" ? "text-accent" : "text-mute"
                  }
                >
                  {entry.who === "ai" ? "ai ›" : "you ›"}
                </span>
                <span className="text-paper/80">{entry.text}</span>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-8">
          <MuteToggle />
          <button
            onClick={() => {
              stopSpeaking();
              recognizer.stop();
              history.back();
            }}
            className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-paper hover:text-accent transition-colors px-4 py-2 rounded-md border border-rule hover:border-accent bg-ink/60 backdrop-blur-md"
          >
            end interview ✕
          </button>
        </div>
      </div>
    </motion.div>
  );
}
