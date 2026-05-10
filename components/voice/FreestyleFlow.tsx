"use client";
import { useEffect, useRef, useState } from "react";
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
import ConversationScreen from "@/components/voice/ConversationScreen";

const FINALIZE_RE = /\b(build it|build the|let'?s go|finalize|that'?s it|go ahead|make it|that's enough|do it|run it)\b/i;
const MAX_EXCHANGES = 30;
const LISTEN_TIMEOUT_MS = 10000;
const POLL_MS = 150;

export default function FreestyleFlow() {
  const transcript = useStore((s) => s.transcript);
  const pushTranscript = useStore((s) => s.pushTranscript);
  const resetVoice = useStore((s) => s.resetVoice);
  const runFromPrompt = useStore((s) => s.runFromPrompt);
  const muted = useStore((s) => s.muted);

  const recognizer = useRecognizer();
  const [phase, setPhase] = useState<"greeting" | "listening" | "thinking" | "speaking" | "done">(
    "greeting"
  );
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const finalizedRef = useRef(false);

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
      runFromPrompt(joined || "freestyle conversation");
      setPhase("done");
    };

    const run = async () => {
      await preloadVoices();
      if (cancelled) return;
      const greeting =
        "Hi! Tell me about the building you want to design — height, use, anything goes. Say 'build it' when you're ready.";
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
          const closing = "Got it. Building your plan now.";
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

  const lastAiText =
    [...transcript].reverse().find((e) => e.who === "ai")?.text ?? "starting…";

  const liveText =
    phase === "listening" && muted
      ? "mic muted — click the mic icon below to talk"
      : phase === "listening" && !muted
      ? recognizer.interim || (recognizer.listening ? "listening…" : "starting mic…")
      : phase === "thinking"
      ? "thinking…"
      : phase === "speaking" || phase === "greeting"
      ? "ai is speaking…"
      : phase === "done"
      ? "building your plan…"
      : "…";

  const liveTone: "user" | "ai" | "muted" =
    phase === "listening" && !muted && recognizer.listening
      ? "user"
      : aiSpeaking || phase === "speaking" || phase === "thinking"
      ? "ai"
      : "muted";

  return (
    <ConversationScreen
      hidden={phase === "done"}
      status={phaseLabel[phase]}
      statusActive={phase === "listening" && !muted && recognizer.listening}
      meta={<>freestyle</>}
      highlight={lastAiText}
      transcript={transcript}
      liveText={liveText}
      liveTone={liveTone}
      controls={
        <>
          <MuteToggle />
          <button
            onClick={() => {
              stopSpeaking();
              recognizer.stop();
              history.back();
            }}
            className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-paper hover:text-accent transition-colors px-4 py-2 rounded-md border border-rule hover:border-accent bg-ink/60 backdrop-blur-md"
          >
            end ✕
          </button>
        </>
      }
      hint={<>say &quot;build it&quot; when you&apos;re ready</>}
    />
  );
}
