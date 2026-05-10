"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Hero from "@/components/landing/Hero";
import PromptBar from "@/components/landing/PromptBar";
import ExamplePills from "@/components/landing/ExamplePills";
import AccentPicker from "@/components/AccentPicker";
import { isSpeechSupported, primeMicPermission } from "@/lib/speech";
import { useStore } from "@/lib/store";

const AccentGrainient = dynamic(
  () => import("@/components/bg/AccentGrainient"),
  { ssr: false }
);

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const setLoading = useStore((s) => s.setLoading);
  const loading = useStore((s) => s.loading);
  const voiceSupported = useStore((s) => s.voiceSupported);
  const setVoiceSupported = useStore((s) => s.setVoiceSupported);
  const router = useRouter();
  const promptInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Returning to the landing page should never show stale "drafting…" state.
    if (!useStore.getState().loading) {
      useStore.getState().reset();
    }
  }, []);

  useEffect(() => {
    setVoiceSupported(isSpeechSupported());
  }, [setVoiceSupported]);

  const goToMode = (mode: "interview" | "freestyle") => {
    if (!voiceSupported) return;
    primeMicPermission();
    setLoading(true);
    setTimeout(() => {
      router.push(`/plan?mode=${mode}`);
    }, 650);
  };

  // Click anywhere on the page → focus the prompt input, unless the click
  // landed on something that handles its own click (button/link/input/etc).
  // Document-level + capture so it catches clicks regardless of React event
  // bubbling through canvases, framer-motion wrappers, or stopPropagation.
  useEffect(() => {
    // Use mousedown (not click) so we can read document.activeElement BEFORE
    // the browser changes focus. By click time the input has already blurred,
    // and we'd refocus it — which re-opens the past-plans dropdown forever.
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // If the input is currently focused, the user is blurring on purpose.
      if (document.activeElement === promptInputRef.current) return;
      if (
        target.closest(
          "button, a, input, textarea, select, label, [role='radio'], [role='button']",
        )
      ) {
        return;
      }
      // Defer focus so we don't fight the browser's own focus handling for
      // the click target.
      requestAnimationFrame(() => promptInputRef.current?.focus());
    };
    document.addEventListener("mousedown", onMouseDown, true);
    return () => document.removeEventListener("mousedown", onMouseDown, true);
  }, []);

  return (
    <main
      className="relative flex flex-col items-center px-6 py-12 h-screen overflow-y-auto"
    >
      <AccentGrainient />

      <motion.header
        className="fixed top-0 left-0 right-0 flex items-center justify-end px-6 py-5 z-40 pointer-events-none"
        animate={{ opacity: loading ? 0 : 1 }}
        transition={{ duration: 0.35 }}
      >
        <div className="flex items-center gap-5 pointer-events-auto">
          <AccentPicker />
          <a
            href="https://github.com/seanesla/hackdavis2026"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-mute hover:text-paper transition-colors cursor-pointer"
          >
            github ↗
          </a>
        </div>
      </motion.header>

      <motion.div
        className="flex-1 flex flex-col items-center justify-center gap-12 w-full"
        animate={{ opacity: loading ? 0 : 1, y: loading ? -20 : 0 }}
        transition={{ duration: 0.45, ease: [0.4, 0, 0.6, 1] }}
      >
        <Hero />
        <PromptBar
          value={prompt}
          onValueChange={setPrompt}
          onSubmit={() => setLoading(true)}
          inputRef={promptInputRef}
        />
        <ModeButtons supported={voiceSupported} onPick={goToMode} />
        <ExamplePills
          onPick={(ex) => {
            setPrompt(ex);
            requestAnimationFrame(() => promptInputRef.current?.focus());
          }}
        />
      </motion.div>

      <motion.footer
        className="pt-4 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-mute/60 pointer-events-none"
        animate={{ opacity: loading ? 0 : 1 }}
        transition={{ duration: 0.35 }}
      >
        stage 0 of construction
      </motion.footer>
    </main>
  );
}

function ModeButtons({
  supported,
  onPick,
}: {
  supported: boolean;
  onPick: (m: "interview" | "freestyle") => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1.5, duration: 0.6 }}
      className="flex flex-col items-center gap-2"
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-mute/60">
        or try voice
      </span>
      <div className="flex items-center gap-3">
        <ModeButton
          label="interview"
          hint="ai asks you 5 questions"
          disabled={!supported}
          onClick={() => onPick("interview")}
        />
        <span className="font-mono text-xs text-mute/40 select-none">·</span>
        <ModeButton
          label="freestyle"
          hint="open conversation"
          disabled={!supported}
          onClick={() => onPick("freestyle")}
        />
      </div>
      {!supported && (
        <span className="font-mono text-[10px] text-mute/60 mt-1">
          voice not supported — use chrome or the text box
        </span>
      )}
    </motion.div>
  );
}

function ModeButton({
  label,
  hint,
  disabled,
  onClick,
}: {
  label: string;
  hint: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled ? "voice not supported in this browser" : hint}
      className={`group flex flex-col items-center gap-0.5 px-4 py-2 rounded-md border transition-colors ${
        disabled
          ? "border-rule/40 cursor-not-allowed opacity-50"
          : "border-rule hover:border-accent bg-ink/40 backdrop-blur-md cursor-pointer"
      }`}
    >
      <span
        className={`font-mono text-sm ${
          disabled ? "text-mute" : "text-paper group-hover:text-accent"
        } transition-colors`}
      >
        {label}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-mute/60">
        {hint}
      </span>
    </button>
  );
}
