"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Hero from "@/components/landing/Hero";
import PromptBar from "@/components/landing/PromptBar";
import ExamplePills from "@/components/landing/ExamplePills";
import LogoLoop from "@/components/landing/LogoLoop";
import {
  SiNextdotjs,
  SiReact,
  SiThreedotjs,
  SiFramer,
  SiTailwindcss,
  SiGoogle,
  SiSolana,
  SiTypescript,
  SiVercel,
  SiGithub,
} from "react-icons/si";
import AccentPicker from "@/components/AccentPicker";
import { isSpeechSupported, primeMicPermission } from "@/lib/speech";
import { useStore } from "@/lib/store";
import { perfLog } from "@/lib/perfLog";

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
  const replayMockPlan = useStore((s) => s.replayMockPlan);
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

  // Debug-only: dump landing-page perf metrics once after the load event.
  // Silent unless Shift+D toggles the debug overlay on /plan first.
  useEffect(() => {
    const dump = () => {
      const nav = performance.getEntriesByType("navigation")[0] as
        | PerformanceNavigationTiming
        | undefined;
      const fcp = performance
        .getEntriesByType("paint")
        .find((p) => p.name === "first-contentful-paint")?.startTime;
      const resources = performance.getEntriesByType("resource");
      let bytes = 0;
      for (const r of resources) bytes += (r as PerformanceResourceTiming).transferSize || 0;
      perfLog("landing:nav", undefined, {
        dcl: nav ? Math.round(nav.domContentLoadedEventEnd - nav.startTime) : null,
        load: nav ? Math.round(nav.loadEventEnd - nav.startTime) : null,
        fcp: fcp ? Math.round(fcp) : null,
        transferKB: Math.round(bytes / 1024),
        resources: resources.length,
      });
    };
    if (document.readyState === "complete") dump();
    else window.addEventListener("load", dump, { once: true });
  }, []);

  const goToMode = (mode: "interview" | "freestyle") => {
    if (!voiceSupported) return;
    primeMicPermission();
    // Voice flows render their own conversation UI on /plan — explicitly
    // no LoadingCurtain hammer in this lane. Navigate directly without
    // setLoading/setTimeout so the hammer never appears during the
    // click → /plan transition (and there's no delay-with-no-feedback
    // either).
    router.push(`/plan?mode=${mode}`);
  };

  // Plays the build animation with a hard-coded mock plan — no API call.
  // Lets you trigger the hammer chop + buildings dropping in for testing.
  const playDemo = () => {
    setLoading(true);
    setTimeout(() => {
      replayMockPlan();
      router.push("/plan");
    }, 650);
  };

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
        <button
          type="button"
          onClick={playDemo}
          className="font-mono text-[11px] uppercase tracking-[0.25em] text-mute hover:text-accent transition-colors"
        >
          ▶ play demo build
        </button>

        <div className="w-full max-w-2xl mt-4">
          <div className="flex items-center justify-center gap-3 mb-5">
            <span className="h-px w-12 bg-rule/60" />
            <span className="font-mono text-[11px] uppercase tracking-[0.4em] text-mute">
              built with
            </span>
            <span className="h-px w-12 bg-rule/60" />
          </div>
          <div
            className="relative h-16 text-paper [filter:drop-shadow(0_0_12px_rgba(255,255,255,0.18))]"
            style={{
              WebkitMaskImage:
                "linear-gradient(to right, transparent 0, #000 14%, #000 86%, transparent 100%)",
              maskImage:
                "linear-gradient(to right, transparent 0, #000 14%, #000 86%, transparent 100%)",
            }}
          >
            <LogoLoop
              logos={[
                { node: <SiNextdotjs />, title: "Next.js", href: "https://nextjs.org" },
                { node: <SiReact />, title: "React", href: "https://react.dev" },
                { node: <SiTypescript />, title: "TypeScript", href: "https://www.typescriptlang.org" },
                { node: <SiThreedotjs />, title: "Three.js", href: "https://threejs.org" },
                { node: <SiFramer />, title: "Framer Motion", href: "https://www.framer.com/motion" },
                { node: <SiTailwindcss />, title: "Tailwind CSS", href: "https://tailwindcss.com" },
                { node: <SiGoogle />, title: "Google Gemini", href: "https://ai.google.dev" },
                { node: <SiSolana />, title: "Solana", href: "https://solana.com" },
                { node: <SiVercel />, title: "Vercel", href: "https://vercel.com" },
                { node: <SiGithub />, title: "GitHub", href: "https://github.com" },
              ]}
              speed={45}
              direction="left"
              logoHeight={44}
              gap={72}
              ariaLabel="Built with"
              scaleOnHover
              hoverSpeed={15}
            />
          </div>
        </div>
      </motion.div>

      <motion.footer
        className="pt-4 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-mute/60 pointer-events-none"
        animate={{ opacity: loading ? 0 : 1 }}
        transition={{ duration: 0.35 }}
      >
        built for hackdavis · v1 alpha
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
