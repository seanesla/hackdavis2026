"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { useStore } from "@/lib/store";
import Step from "./Step";
import AccentPicker from "@/components/AccentPicker";

export default function SideRail() {
  const { prompt, steps, running } = useStore();

  return (
    <motion.aside
      initial={{ x: -40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="glass absolute top-4 left-4 bottom-4 w-[400px] rounded-2xl flex flex-col overflow-hidden z-10"
    >
      <div className="px-6 pt-6 pb-4 border-b border-rule/60">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            aria-label="back to parcel"
            className="font-mono text-[10px] uppercase tracking-[0.25em] text-mute hover:text-accent transition-colors"
          >
            ← back
          </Link>
          <AccentPicker />
        </div>
      </div>

      <div className="h-[400px] border-b border-rule/60" />

      <div className="px-6 py-4 border-b border-rule/60">
        <div className="text-[10px] uppercase tracking-[0.2em] text-mute font-mono">
          brief
        </div>
        <p className="mt-2 font-mono text-[13px] text-paper/80 leading-relaxed">
          {prompt || "—"}
        </p>
      </div>

      <div className="flex items-center gap-2 px-6 py-3 border-b border-rule/60">
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            running ? "bg-accent animate-pulse" : "bg-paper/40"
          }`}
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-mute">
          {running ? "planning" : steps.length ? "complete" : "idle"}
        </span>
      </div>

      <ol className="flex-1 overflow-y-auto px-6 py-2">
        {steps.map((s, i) => (
          <Step key={i} step={s} index={i} />
        ))}
      </ol>

      <div className="px-6 py-4 border-t border-rule/60 font-mono text-[10px] uppercase tracking-[0.25em] text-mute/70">
        stage 0 of construction
      </div>
    </motion.aside>
  );
}
