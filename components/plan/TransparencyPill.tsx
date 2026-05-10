"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "@/lib/store";
import { buildReceipt, type ReceiptEntry } from "@/lib/transparency";

// Compact transparency receipt. Replaces the audit pill — instead of
// grading AI-invented details against pro standards (which feels unfair
// when the AI made up most of those details), this shows the user the
// raw split: what they said, what the AI filled in. No verdicts.
//
// Anchored to the right edge of the SideRail (16+400+16 = 432px from the
// viewport's left edge), same position as the old audit chip so it
// doesn't compete with SceneTools (right edge) or the FloorPanel.
export default function TransparencyPill() {
  const plan = useStore((s) => s.plan);
  const prompt = useStore((s) => s.prompt);
  const running = useStore((s) => s.running);
  const [open, setOpen] = useState(false);

  if (!plan || running) return null;
  const receipt = buildReceipt(plan, prompt ?? "");
  if (!receipt) return null;

  const userCount = receipt.user.length;
  const aiCount = receipt.ai.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
      className="absolute bottom-4 left-[432px] z-10 flex flex-col items-start"
    >
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ opacity: 0, y: 12, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: 12, height: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="glass rounded-xl mb-2 w-[300px] overflow-hidden"
          >
            <div className="px-4 pt-3 pb-2 border-b border-rule/30">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-paper">
                receipt
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-mute/70 leading-relaxed">
                What you said vs. what the AI made up.
                <br />
                <span className="text-mute/50">
                  Edit your brief on the left to change anything.
                </span>
              </div>
            </div>

            <div className="px-4 py-3 space-y-3.5 max-h-[42vh] overflow-y-auto">
              {receipt.user.length > 0 && (
                <Section
                  title="you asked for"
                  entries={receipt.user}
                  tint="text-emerald-400/80"
                />
              )}
              {receipt.ai.length > 0 && (
                <Section
                  title="ai filled in"
                  entries={receipt.ai}
                  tint="text-accent/80"
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="receipt — what you said vs. what the AI made up"
        className="glass rounded-full pl-2.5 pr-3 py-1.5 flex items-center gap-2 cursor-pointer hover:brightness-110 transition-all"
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-mute">
          receipt
        </span>
        <span className="font-mono text-[10px] tracking-[0.05em] text-emerald-400/80">
          {userCount}
        </span>
        <span className="font-mono text-[10px] text-mute/40">·</span>
        <span className="font-mono text-[10px] tracking-[0.05em] text-accent/80">
          {aiCount} added
        </span>
        <span className="font-mono text-[10px] text-mute/40 ml-0.5">
          {open ? "−" : "+"}
        </span>
      </button>
    </motion.div>
  );
}

function Section({
  title,
  entries,
  tint,
}: {
  title: string;
  entries: ReceiptEntry[];
  tint: string;
}) {
  return (
    <div>
      <div
        className={`font-mono text-[9px] uppercase tracking-[0.18em] ${tint} mb-1.5`}
      >
        {title}
      </div>
      <div className="space-y-2">
        {entries.map((e, i) => (
          <div key={`${e.label}-${i}`} className="flex flex-col gap-0.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-[10px] text-mute/80 uppercase tracking-[0.05em]">
                {e.label}
              </span>
              <span className="font-mono text-[11px] text-paper text-right">
                {e.value}
              </span>
            </div>
            {e.note && (
              <span className="font-mono text-[10px] text-mute/55 leading-snug">
                {e.note}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
