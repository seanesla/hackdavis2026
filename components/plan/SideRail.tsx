"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { useStore } from "@/lib/store";
import Step from "./Step";
import AccentPicker from "@/components/AccentPicker";
import CompartmentFire from "./CompartmentFire";
import MintNftButton from "./MintNftButton";
import { downloadPlan } from "@/lib/exportPlan";
import { STORY_HEIGHT_FT } from "@/lib/types";
import { useViewMode, type ViewMode } from "@/lib/viewMode";
import { useDimensions } from "@/lib/dimensions";

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

const VIEW_MODES: { key: ViewMode; label: string }[] = [
  { key: "perspective", label: "3D" },
  { key: "plan", label: "plan" },
  { key: "elevation", label: "elev" },
];

// Tiny pill that flips green / red based on a boolean — used for compliance
// callouts (setback ok? parking sufficient?).
function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`font-mono text-[8px] uppercase tracking-[0.15em] px-1 rounded ${
        ok
          ? "text-emerald-300/90 bg-emerald-500/10"
          : "text-rose-300/90 bg-rose-500/15"
      }`}
    >
      {ok ? "✓" : "✗"} {label}
    </span>
  );
}

export default function SideRail() {
  const { prompt, steps, running } = useStore();
  const plan = useStore((s) => s.plan);
  const canExport = !!plan && !running;
  const viewMode = useViewMode((s) => s.mode);
  const setViewMode = useViewMode((s) => s.setMode);
  const showDimensions = useDimensions((s) => s.show);
  const toggleDimensions = useDimensions((s) => s.toggle);

  // Live site stats — derived from the plan, no schema or API change.
  const stats = (() => {
    if (!plan) return null;
    const lotArea = plan.lot.width * plan.lot.depth;
    if (lotArea <= 0) return null;
    const buildings = (plan.buildings ?? []).filter(
      (b) => b.w > 0 && b.d > 0 && b.stories > 0
    );
    const gfa = buildings.reduce((s, b) => s + b.w * b.d * b.stories, 0);
    const footprint = buildings.reduce((s, b) => s + b.w * b.d, 0);
    const coverage = (footprint / lotArea) * 100;
    const far = gfa / lotArea;
    const maxStories = buildings.reduce((m, b) => Math.max(m, b.stories), 0);
    const maxHeight = maxStories * STORY_HEIGHT_FT;
    const parkingCount = plan.parking?.length ?? 0;
    // 1 stall per 300 sf is a typical commercial baseline. The badge is
    // informational — it doesn't gate the design, just flags the deficit.
    const parkingRequired = Math.max(0, Math.ceil(gfa / 300));
    // Inline setback check (avoids importing from the giant SitePlanMesh).
    const setbacksOk = buildings.every(
      (b) =>
        b.x >= plan.setbacks.side &&
        b.x + b.w <= plan.lot.width - plan.setbacks.side &&
        b.z >= plan.setbacks.front &&
        b.z + b.d <= plan.lot.depth - plan.setbacks.back
    );
    return {
      lotArea,
      gfa,
      coverage,
      far,
      maxHeight,
      parkingCount,
      parkingRequired,
      setbacksOk,
    };
  })();

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

      <div
        id="hammer-slot"
        className="relative h-[400px] border-b border-rule/60"
      >
        <CompartmentFire />
      </div>

      <div className="px-6 py-4 border-b border-rule/60">
        <div className="text-[10px] uppercase tracking-[0.2em] text-mute font-mono">
          brief
        </div>
        <p className="mt-2 font-mono text-[13px] text-paper/80 leading-relaxed">
          {prompt || "—"}
        </p>
      </div>

      {stats && (
        <div className="px-6 py-2 border-b border-rule/60">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[10px] leading-tight">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-mute uppercase tracking-[0.12em] text-[8px]">lot</dt>
              <dd className="text-paper/85">{fmt(stats.lotArea)} ft²</dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-mute uppercase tracking-[0.12em] text-[8px]">gfa</dt>
              <dd className="text-paper/85">{fmt(stats.gfa)} ft²</dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-mute uppercase tracking-[0.12em] text-[8px]">cov</dt>
              <dd className="text-paper/85">{stats.coverage.toFixed(1)}%</dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-mute uppercase tracking-[0.12em] text-[8px]">far</dt>
              <dd className="text-paper/85">{stats.far.toFixed(2)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-mute uppercase tracking-[0.12em] text-[8px]">h</dt>
              <dd className="text-paper/85">{fmt(stats.maxHeight)} ft</dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-mute uppercase tracking-[0.12em] text-[8px]">park</dt>
              <dd className="text-paper/85">
                {stats.parkingCount}/{stats.parkingRequired}
              </dd>
            </div>
          </dl>
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            <Badge ok={stats.setbacksOk} label="setbacks" />
            <Badge
              ok={stats.parkingCount >= stats.parkingRequired}
              label="parking"
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 px-6 py-3 border-b border-rule/60">
        <div className="flex items-center gap-2">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              running ? "bg-accent animate-pulse" : "bg-paper/40"
            }`}
          />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-mute">
            {running ? "planning" : steps.length ? "complete" : "idle"}
          </span>
        </div>
        <div className="flex items-center gap-0 rounded-md border border-rule overflow-hidden">
          {VIEW_MODES.map((m) => {
            const active = viewMode === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setViewMode(m.key)}
                className={`font-mono text-[9px] uppercase tracking-[0.18em] px-2 py-1 transition-colors ${
                  active
                    ? "bg-accent/15 text-accent"
                    : "text-mute hover:text-paper"
                }`}
                aria-pressed={active}
                title={`Switch to ${m.key} view`}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      <ol className="flex-1 overflow-y-auto px-6 py-2">
        {steps.map((s, i) => (
          <Step key={i} step={s} index={i} />
        ))}
      </ol>

      <div className="px-6 py-4 border-t border-rule/60 space-y-3">
        <MintNftButton />
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                canExport && plan && downloadPlan({ prompt, plan, steps })
              }
              disabled={!canExport}
              title={
                canExport
                  ? "download this plan as a JSON file"
                  : "no plan to export yet"
              }
              className="font-mono text-[10px] uppercase tracking-[0.2em] text-mute hover:text-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              export ↓
            </button>
            <button
              type="button"
              onClick={toggleDimensions}
              aria-pressed={showDimensions}
              title="toggle lot + building dimension callouts"
              className={`font-mono text-[10px] uppercase tracking-[0.2em] transition-colors ${
                showDimensions ? "text-accent" : "text-mute hover:text-paper"
              }`}
            >
              dims {showDimensions ? "✓" : "+"}
            </button>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-mute/70">
            stage 0 of construction
          </span>
        </div>
      </div>
    </motion.aside>
  );
}
