"use client";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { Step as StepT } from "@/lib/types";

export default function Step({ step, index }: { step: StepT; index: number }) {
  const [typed, setTyped] = useState("");

  useEffect(() => {
    let i = 0;
    setTyped("");
    const id = setInterval(() => {
      i++;
      setTyped(step.tool.slice(0, i));
      if (i >= step.tool.length) {
        setTyped(step.tool);
        clearInterval(id);
      }
    }, 22);
    return () => clearInterval(id);
  }, [step.tool]);

  return (
    <motion.li
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="relative pl-5 py-3 border-b border-rule/60 last:border-b-0"
    >
      <motion.span
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 240, damping: 16, delay: 0.1 }}
        className="absolute left-0 top-[18px] w-2 h-2 rounded-full bg-accent"
      />
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[11px] uppercase tracking-wider text-mute">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="font-mono text-xs text-paper/90">{typed}</span>
      </div>
      <motion.div
        className="hairline mt-2 mb-2"
        initial={{ width: 0 }}
        animate={{ width: "100%" }}
        transition={{ duration: 0.5, delay: 0.15 }}
      />
      <p className="font-display text-[15px] leading-snug text-paper/85">
        {step.note}
      </p>
    </motion.li>
  );
}
