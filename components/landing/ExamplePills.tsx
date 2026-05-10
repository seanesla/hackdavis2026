"use client";
import { motion } from "framer-motion";

const examples = [
  "0.5 acre lot, 25 ft front setback, 10 ft sides, fit a 3-story building with 12 parking spots.",
  "quarter-acre infill lot, single-family home, 2 stories, 4 parking stalls.",
  "1 acre lot, mixed-use 4-story building, 30 parking spaces.",
  "0.3 acre corner lot, duplex with shared driveway, 6 stalls.",
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
