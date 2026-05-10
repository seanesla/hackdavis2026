"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useStore } from "@/lib/store";
import { chatTurn } from "@/lib/agent";
import {
  preloadVoices,
  speak,
  stopSpeaking,
  isSpeaking,
  useRecognizer,
} from "@/lib/speech";
import MuteToggle from "@/components/voice/MuteToggle";

const FINALIZE_RE = /\b(build it|build the|let'?s go|finalize|that'?s it|go ahead|make it|that's enough|do it|run it)\b/i;
const MAX_EXCHANGES = 30;
const LISTEN_TIMEOUT_MS = 10000;
const POLL_MS = 150;

type Props = {
  // "create" (default) is the original landing-page flow that builds the
  // first plan from the conversation. "modify" is the in-panel variant that
  // keeps the current plan and merges the conversation into the existing
  // brief on finalize.
  mode?: "create" | "modify";
  // When provided, the "end" button calls this instead of history.back().
  // Required for the "modify" overlay so closing it doesn't navigate away.
  onClose?: () => void;
};

export default function FreestyleFlow({ mode = "create", onClose }: Props) {
  const transcript = useStore((s) => s.transcript);
  const pushTranscript = useStore((s) => s.pushTranscript);
  const resetVoice = useStore((s) => s.resetVoice);
  const resetTranscript = useStore((s) => s.resetTranscript);
  const runFromPrompt = useStore((s) => s.runFromPrompt);
  const muted = useStore((s) => s.muted);

  const recognizer = useRecognizer();
  const [phase, setPhase] = useState<"greeting" | "listening" | "thinking" | "speaking" | "done">(
    "greeting"
  );
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const finalizedRef = useRef(false);

  useEffect(() => {
    // Modify mode must NOT call resetVoice — that wipes plan/steps. Use the
    // lighter resetTranscript so the user keeps the build they're modifying.
    if (mode === "modify") {
      resetTranscript();
    } else {
      resetVoice();
    }
    return () => {
      if (mode === "modify") {
        resetTranscript();
      } else {
        resetVoice();
      }
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    const id = setInterval(() => setAiSpeaking(isSpeaking()), 200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let activePoll: ReturnType<typeof setInterval> | null = null;
    let activeTimeout: ReturnType<typeof setTimeout> | null = null;
    let muteUnsub: (() => void) | null = null;

    const sayAndWait = (text: string): Promise<void> =>
      new Promise((resolve) => {
        if (cancelled) return resolve();
        speak(text, { onEnd: () => resolve() });
      });

    // Listen for one user utterance. If the mic is muted now, wait for unmute
    // before starting. If the user mutes mid-listen, stop and wait for unmute,
    // then restart the recognizer cleanly.
    const listenOnce = (): Promise<string> =>
      new Promise((resolve) => {
        if (cancelled) return resolve("");
        let resolved = false;
        let everListened = false;

        const cleanupTimers = () => {
          if (activePoll) {
            clearInterval(activePoll);
            activePoll = null;
          }
          if (activeTimeout) {
            clearTimeout(activeTimeout);
            activeTimeout = null;
          }
        };

        const finish = (text: string) => {
          if (resolved) return;
          resolved = true;
          cleanupTimers();
          if (muteUnsub) {
            muteUnsub();
            muteUnsub = null;
          }
          recognizer.stop();
          resolve(text);
        };

        const startRecognition = () => {
          if (cancelled || resolved) return;
          everListened = false;
          recognizer.reset();
          recognizer.start();

          activePoll = setInterval(() => {
            if (cancelled || resolved) return;
            if (useStore.getState().muted) {
              // User muted mid-listen — stop and wait for unmute.
              cleanupTimers();
              recognizer.stop();
              waitForUnmuteThenStart();
              return;
            }
            if (recognizer.listeningRef.current) {
              everListened = true;
              return;
            }
            if (everListened) finish(recognizer.finalRef.current);
          }, POLL_MS);

          activeTimeout = setTimeout(() => {
            if (resolved) return;
            recognizer.stop();
            setTimeout(() => finish(recognizer.finalRef.current), 250);
          }, LISTEN_TIMEOUT_MS);
        };

        const waitForUnmuteThenStart = () => {
          if (cancelled || resolved) return;
          if (muteUnsub) {
            muteUnsub();
            muteUnsub = null;
          }
          muteUnsub = useStore.subscribe((state, prev) => {
            if (!state.muted && prev.muted) {
              if (muteUnsub) {
                muteUnsub();
                muteUnsub = null;
              }
              startRecognition();
            }
          });
        };

        if (useStore.getState().muted) {
          waitForUnmuteThenStart();
        } else {
          startRecognition();
        }
      });

    const finalize = () => {
      if (finalizedRef.current || cancelled) return;
      finalizedRef.current = true;
      const joined = useStore
        .getState()
        .transcript.filter((e) => e.who === "user")
        .map((e) => e.text)
        .join(" ");
      if (mode === "modify") {
        const currentPrompt = useStore.getState().prompt.trim();
        const tweaks = joined.trim();
        // If the user opened modify-voice but didn't actually say anything,
        // bail out without rebuilding so we don't drop their plan.
        if (!tweaks) {
          setPhase("done");
          onClose?.();
          return;
        }
        const merged = currentPrompt
          ? `${currentPrompt.replace(/[.!?]\s*$/, "")}. Also: ${tweaks}.`
          : tweaks;
        runFromPrompt(merged);
        setPhase("done");
        onClose?.();
        return;
      }
      runFromPrompt(joined || "freestyle conversation");
      setPhase("done");
    };

    const run = async () => {
      await preloadVoices();
      if (cancelled) return;
      const greeting =
        mode === "modify"
          ? "What would you like to change about the current plan? Say 'build it' when you're ready."
          : "Hi! Tell me about the building you want to design — height, use, anything goes. Say 'build it' when you're ready.";
      pushTranscript({ who: "ai", text: greeting });
      setPhase("speaking");
      await sayAndWait(greeting);

      let exchanges = 0;
      while (!cancelled && exchanges < MAX_EXCHANGES) {
        setPhase("listening");
        const userText = (await listenOnce()).trim();
        if (cancelled) return;

        if (!userText) {
          setPhase("speaking");
          await sayAndWait("I didn't catch that — could you say a bit more?");
          continue;
        }
        pushTranscript({ who: "user", text: userText });

        if (FINALIZE_RE.test(userText)) {
          const closing =
            mode === "modify"
              ? "Got it. Updating the plan now."
              : "Got it. Building your plan now.";
          pushTranscript({ who: "ai", text: closing });
          setPhase("speaking");
          await sayAndWait(closing);
          if (!cancelled) finalize();
          return;
        }

        setPhase("thinking");
        const history = useStore.getState().transcript;
        const reply = await chatTurn(history);
        if (cancelled) return;
        pushTranscript({ who: "ai", text: reply });
        setPhase("speaking");
        await sayAndWait(reply);
        exchanges++;
      }

      if (!cancelled && !finalizedRef.current) {
        const closing =
          "Got it — let me lay out a starting point you can iterate on.";
        pushTranscript({ who: "ai", text: closing });
        setPhase("speaking");
        await sayAndWait(closing);
        if (!cancelled) finalize();
      }
    };

    run();

    return () => {
      cancelled = true;
      if (activePoll) clearInterval(activePoll);
      if (activeTimeout) clearTimeout(activeTimeout);
      if (muteUnsub) muteUnsub();
      stopSpeaking();
      recognizer.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const phaseLabel: Record<typeof phase, string> = {
    greeting: "starting…",
    listening: muted ? "mic muted" : "listening",
    thinking: "thinking…",
    speaking: "ai speaking…",
    done: "building",
  };

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
          {mode === "modify" ? "modify" : "freestyle"} · {phaseLabel[phase]}
        </span>
      </div>

      <div className="w-full max-w-3xl flex flex-col items-center gap-5 pointer-events-auto">
        <div className="text-center font-mono text-base sm:text-lg text-paper px-5 py-4 rounded-md bg-ink/60 backdrop-blur-md border border-rule min-h-[3.5rem] min-w-[60%] flex items-center justify-center">
          {phase === "listening" && muted && "mic muted — click the mic icon to talk"}
          {phase === "listening" && !muted && (recognizer.interim || "listening…")}
          {phase === "thinking" && "…"}
          {(phase === "speaking" || phase === "greeting") &&
            (transcript[transcript.length - 1]?.who === "ai"
              ? transcript[transcript.length - 1]?.text
              : "starting…")}
          {phase === "done" && "building your plan…"}
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${
              aiSpeaking
                ? "bg-accent"
                : recognizer.listening
                ? "bg-accent animate-pulse"
                : "bg-rule"
            }`}
          />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-mute/60">
            {aiSpeaking ? "ai" : recognizer.listening ? "you" : "idle"}
          </span>
        </div>

        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-mute/60 mt-1">
          say &quot;build it&quot; when you&apos;re ready
        </span>
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
              if (mode === "modify") {
                onClose?.();
              } else {
                history.back();
              }
            }}
            className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-paper hover:text-accent transition-colors px-4 py-2 rounded-md border border-rule hover:border-accent bg-ink/60 backdrop-blur-md"
          >
            end ✕
          </button>
        </div>
      </div>
    </motion.div>
  );
}
