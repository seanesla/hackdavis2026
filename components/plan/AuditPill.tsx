"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "@/lib/store";
import { auditPlan, type AuditCheck, type CheckStatus } from "@/lib/audit";

// Compact site-audit chip. Anchored to the right edge of the SideRail
// (bottom-left of the scene area) so it never competes with SceneTools
// (right edge) or the FloorPanel (slides in from right). Closed state is
// a tiny pill; open state is intentionally narrow (280px) and short
// (40vh max) so it leaves the 3D renderer the maximum amount of room.
export default function AuditPill() {
  const plan = useStore((s) => s.plan);
  const running = useStore((s) => s.running);
  const modifyFromPrompt = useStore((s) => s.modifyFromPrompt);
  const [open, setOpen] = useState(false);
  const result = auditPlan(plan);

  if (!result || running) return null;

  const handleFix = (fixPrompt?: string) => {
    if (!fixPrompt || running) return;
    setOpen(false);
    void modifyFromPrompt(fixPrompt);
  };

  const total = result.passCount + result.warnCount + result.failCount;
  const dotColor =
    result.failCount > 0
      ? "bg-rose-400"
      : result.warnCount > 0
      ? "bg-accent"
      : "bg-emerald-400/80";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
      // Anchored to the right edge of the SideRail (16+400+16 = 432px from
      // the viewport's left edge). When the FloorPanel opens on the right
      // it doesn't reach this far, so the pill stays visible in both states.
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
            className="glass rounded-xl mb-2 w-[280px] overflow-hidden"
          >
            <div className="px-4 pt-3 pb-2 border-b border-rule/30">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-paper">
                site audit
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-mute/70 leading-relaxed">
                Quick checks a planner might flag.
                <br />
                <span className="text-mute/50">
                  Tap <span className="text-accent/90">fix</span> to apply
                  the change.
                </span>
              </div>
            </div>

            <div className="px-4 py-3 space-y-2.5 max-h-[40vh] overflow-y-auto">
              {result.checks.map((c) => (
                <CheckRow
                  key={c.id}
                  c={c}
                  onFix={handleFix}
                  running={running}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="site audit — zoning, walkability, climate"
        className="glass rounded-full pl-2.5 pr-3 py-1.5 flex items-center gap-2 cursor-pointer hover:brightness-110 transition-all"
      >
        <span className="relative flex h-1.5 w-1.5">
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${dotColor}`}
          />
          <span
            className={`relative inline-flex rounded-full h-1.5 w-1.5 ${dotColor}`}
          />
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-mute">
          audit
        </span>
        <span className="font-mono text-[10px] tracking-[0.05em] text-paper/80">
          {total === 0
            ? "—"
            : `${result.passCount}·${result.warnCount}·${result.failCount}`}
        </span>
        <span className="font-mono text-[10px] text-mute/40 ml-0.5">
          {open ? "−" : "+"}
        </span>
      </button>
    </motion.div>
  );
}

const STATUS_ICON: Record<CheckStatus, string> = {
  pass: "✓",
  warn: "⚠",
  fail: "✕",
  info: "·",
};

const STATUS_COLOR: Record<CheckStatus, string> = {
  pass: "text-emerald-400/90",
  warn: "text-accent",
  fail: "text-rose-400/90",
  info: "text-mute/60",
};

function CheckRow({
  c,
  onFix,
  running,
}: {
  c: AuditCheck;
  onFix: (fixPrompt?: string) => void;
  running: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <span
        className={`${STATUS_COLOR[c.status]} font-mono text-[12px] leading-none w-3 text-center shrink-0 mt-0.5`}
        aria-hidden
      >
        {STATUS_ICON[c.status]}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <div className="font-mono text-[11px] text-paper leading-snug">
            {c.label}
          </div>
          {c.fixPrompt && (
            <button
              type="button"
              onClick={() => onFix(c.fixPrompt)}
              disabled={running}
              className="shrink-0 font-mono text-[9px] tracking-[0.05em] text-accent/90 hover:text-accent uppercase border border-rule/40 hover:border-accent/60 rounded px-1.5 py-0.5 transition-colors disabled:opacity-40"
            >
              fix →
            </button>
          )}
        </div>
        <div className="font-mono text-[10px] text-mute/65 leading-relaxed mt-0.5">
          {c.detail}
        </div>
      </div>
    </div>
  );
}
