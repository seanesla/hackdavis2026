"use client";
import { motion } from "framer-motion";

// Examples are tuned to read as community-scale projects — the kind of
// thing a neighborhood group, family, or small nonprofit would actually
// sketch before talking to an architect or city planner. Each is short
// enough to render without truncation (~58 char display cap) while still
// giving the AI enough cues to produce a meaningful layout.
const examples = [
  "0.4 ac community garden with a small pavilion",
  "0.2 ac lot, ADU for elder family, ~600 sqft",
  "1 ac corner lot, small neighborhood library",
  "1 ac small church with a community room",
];

type Props = { onPick: (s: string) => void };

export default function ExamplePills({ onPick }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 1.6, duration: 0.6 }}
      className="w-full max-w-3xl"
    >
      <div className="text-[10px] uppercase tracking-[0.2em] text-mute/70 mb-3 text-center font-mono">
        try
      </div>
      <div className="flex flex-wrap gap-2 justify-center">
        {examples.map((ex, i) => (
          <button
            key={i}
            onClick={() => onPick(ex)}
            className="group relative font-mono text-xs sm:text-[13px] text-mute hover:text-paper px-3 py-2 rounded border border-rule/60 hover:border-accent/40 transition-colors cursor-pointer"
          >
            {ex.length > 60 ? ex.slice(0, 58) + "…" : ex}
            <span className="absolute left-3 right-3 -bottom-px h-[1px] bg-accent scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-300" />
          </button>
        ))}
      </div>
    </motion.div>
  );
}
