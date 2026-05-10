"use client";
import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "@/lib/store";
import { floorPlanCacheKey } from "@/lib/floorPlanPrompt";

export default function FloorPanel() {
  const sel = useStore((s) => s.selectedFloor);
  const plan = useStore((s) => s.plan);
  const floorPlans = useStore((s) => s.floorPlans);
  const fetchFloorPlan = useStore((s) => s.fetchFloorPlan);
  const selectFloor = useStore((s) => s.selectFloor);

  const building =
    sel && plan?.buildings ? plan.buildings[sel.buildingIndex] : undefined;
  const key = sel && building ? floorPlanCacheKey(building, sel.storyIndex) : null;
  const record = key ? floorPlans[key] : undefined;

  useEffect(() => {
    if (!sel) return;
    // fetchFloorPlan is internally idempotent — it short-circuits when the
    // record is already ready or in flight, so calling it on every selection
    // change is safe and gets us a fetch on first open without an extra
    // re-render dance.
    fetchFloorPlan();
  }, [key, fetchFloorPlan, sel]);

  const structureLabel = building?.structure_type
    ? building.structure_type.replace("_", " ")
    : "building";
  const dimsLabel = building
    ? `${Math.round(building.w)}×${Math.round(building.d)} ft`
    : "";
  const isLoading = !record || record.status === "loading";
  const isReady = record?.status === "ready";

  return (
    <AnimatePresence>
      {sel && building && (
        <motion.aside
          key="floor-panel"
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 40, opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="glass absolute top-0 right-0 w-[420px] h-screen flex flex-col z-30"
        >
          <header className="px-6 py-5 border-b border-rule/60 flex items-start justify-between">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-mute">
                floor plan
              </div>
              <div className="mt-1 text-paper text-sm font-medium">
                Floor {sel.storyIndex + 1} of {building.stories} —{" "}
                <span className="capitalize">{structureLabel}</span>, {dimsLabel}
              </div>
              {building.material && (
                <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-mute/70">
                  {building.material}
                </div>
              )}
            </div>
            <button
              onClick={() => selectFloor(null)}
              aria-label="Close floor plan"
              className="text-mute hover:text-accent text-base font-mono leading-none px-2"
            >
              ✕
            </button>
          </header>

          <div className="flex-1 p-6 overflow-y-auto">
            {isLoading && (
              <div className="aspect-square w-full rounded border border-rule/40 bg-rule/10 flex items-center justify-center">
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-mute animate-pulse">
                  generating floor plan…
                </div>
              </div>
            )}
            {!isLoading && record?.status === "error" && (
              <div className="rounded border border-rose-500/40 bg-rose-500/5 p-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-rose-300">
                  generation failed
                </div>
                <div className="mt-1 text-rose-200/90 text-xs leading-relaxed">
                  {record.error}
                  {record.retryAfterSeconds
                    ? ` Retry in ~${record.retryAfterSeconds}s.`
                    : ""}
                </div>
                <button
                  type="button"
                  onClick={() => fetchFloorPlan(true)}
                  className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] px-3 py-1.5 rounded border border-rose-500/40 text-rose-200 hover:text-paper hover:border-accent/60 transition-colors"
                >
                  retry ↻
                </button>
              </div>
            )}
            {isReady && record?.dataUrl && (
              <img
                src={record.dataUrl}
                alt={`Floor ${sel.storyIndex + 1} plan`}
                className="w-full rounded border border-rule/40 bg-white"
              />
            )}
          </div>

          <footer className="px-6 py-4 border-t border-rule/60 flex gap-2">
            <button
              onClick={() => fetchFloorPlan(true)}
              disabled={isLoading}
              className="flex-1 font-mono text-[10px] uppercase tracking-[0.2em] px-3 py-2 rounded border border-rule/60 text-mute hover:text-accent hover:border-accent/40 disabled:opacity-30 disabled:hover:text-mute disabled:hover:border-rule/60 transition-colors"
            >
              regenerate
            </button>
            <a
              href={isReady ? record!.dataUrl : undefined}
              download={`floor-${sel.buildingIndex + 1}-${sel.storyIndex + 1}.png`}
              aria-disabled={!isReady}
              className={`flex-1 text-center font-mono text-[10px] uppercase tracking-[0.2em] px-3 py-2 rounded border border-rule/60 text-mute hover:text-accent hover:border-accent/40 transition-colors ${
                !isReady ? "pointer-events-none opacity-30" : ""
              }`}
            >
              download
            </a>
          </footer>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
