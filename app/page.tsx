"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import Hero from "@/components/landing/Hero";
import PromptBar from "@/components/landing/PromptBar";
import ExamplePills from "@/components/landing/ExamplePills";
import PastPlans from "@/components/PastPlans";
import AccentPicker from "@/components/AccentPicker";
import { useStore } from "@/lib/store";

const AccentGrainient = dynamic(
  () => import("@/components/bg/AccentGrainient"),
  { ssr: false }
);

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const setLoading = useStore((s) => s.setLoading);
  const loading = useStore((s) => s.loading);

  useEffect(() => {
    // Returning to the landing page should never show stale "drafting…" state.
    if (!useStore.getState().loading) {
      useStore.getState().reset();
    }
  }, []);

  return (
    <main className="relative flex-1 flex flex-col items-center justify-center px-6 py-12 overflow-hidden">
      <AccentGrainient />

      <motion.header
        className="absolute top-0 left-0 right-0 flex items-center justify-end px-6 py-5"
        animate={{ opacity: loading ? 0 : 1 }}
        transition={{ duration: 0.35 }}
      >
        <div className="flex items-center gap-5">
          <AccentPicker />
          <a
            href="https://github.com/seanesla/hackdavis2026"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-mute hover:text-paper transition-colors"
          >
            github ↗
          </a>
        </div>
      </motion.header>

      <motion.div
        className="flex flex-col items-center gap-12 w-full"
        animate={{ opacity: loading ? 0 : 1, y: loading ? -20 : 0 }}
        transition={{ duration: 0.45, ease: [0.4, 0, 0.6, 1] }}
      >
        <Hero />
        <PromptBar
          value={prompt}
          onValueChange={setPrompt}
          onSubmit={() => setLoading(true)}
        />
        <ExamplePills onPick={setPrompt} />
        <PastPlans onLoad={setPrompt} />
      </motion.div>

      <motion.footer
        className="absolute bottom-5 left-0 right-0 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-mute/60"
        animate={{ opacity: loading ? 0 : 1 }}
        transition={{ duration: 0.35 }}
      >
        stage 0 of construction
      </motion.footer>
    </main>
  );
}
