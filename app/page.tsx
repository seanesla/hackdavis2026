"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import Hero from "@/components/landing/Hero";
import PromptBar from "@/components/landing/PromptBar";
import ExamplePills from "@/components/landing/ExamplePills";
import TransitionWipe from "@/components/TransitionWipe";
import AccentPicker from "@/components/AccentPicker";

const ContourBackground = dynamic(
  () => import("@/components/bg/ContourBackground"),
  { ssr: false }
);

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [transitioning, setTransitioning] = useState(false);

  return (
    <main className="relative flex-1 flex flex-col items-center justify-center px-6 py-12 overflow-hidden">
      <ContourBackground />

      <header className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-5">
        <span className="font-mono text-xs tracking-[0.2em] text-mute uppercase">
          parcel
        </span>
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
      </header>

      <div className="flex flex-col items-center gap-12 w-full">
        <Hero />
        <PromptBar
          value={prompt}
          onValueChange={setPrompt}
          onSubmit={() => setTransitioning(true)}
        />
        <ExamplePills onPick={setPrompt} />
      </div>

      <footer className="absolute bottom-5 left-0 right-0 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-mute/60">
        stage 0 of construction
      </footer>

      <TransitionWipe active={transitioning} />
    </main>
  );
}
