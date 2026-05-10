"use client";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useCameraView } from "@/lib/cameraView";
import { chooseScaleFt } from "./ScaleBar";

// Fake-but-stable sheet number so the title block doesn't change every render.
function makeSheetNumber(prompt: string) {
  if (!prompt) return "SP-1";
  let h = 0;
  for (let i = 0; i < prompt.length; i++) h = (h * 31 + prompt.charCodeAt(i)) | 0;
  const n = (Math.abs(h) % 99) + 1;
  return `SP-${String(n).padStart(2, "0")}`;
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

// Engineering-drawing title block — the small information rectangle in the
// corner of every CE deliverable. Project / Drawn / Date / Scale / Sheet,
// followed by a compact "site data" row (lot area, GFA, FAR, setbacks ok)
// — the zoning summary a planner actually scans. Used to live in a separate
// stats panel inside the SideRail, but the steps list needs that vertical
// space, and the title block is the conventional spot for it on a real CE
// drawing anyway. Anchored at bottom-right, paired with the ScaleBar
// directly above it so the visual scale bar and the textual scale read as
// a single legend block.
export default function TitleBlock() {
  const prompt = useStore((s) => s.prompt);
  const plan = useStore((s) => s.plan);
  const distance = useCameraView((s) => s.distance);
  const fov = useCameraView((s) => s.fov);
  const canvasHeight = useCameraView((s) => s.canvasHeight);

  // Date is computed in a useEffect so the initial server render and the
  // initial client hydration render both produce an empty string — using
  // `new Date()` directly during render captures server time on SSR and
  // client time on hydration, which can disagree across timezones / cache
  // staleness and trip a hydration mismatch.
  const [dateStr, setDateStr] = useState("");
  useEffect(() => {
    setDateStr(
      new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
    );
  }, []);

  const project = (prompt?.trim() || "untitled site").slice(0, 60);
  const sheet = useMemo(() => makeSheetNumber(prompt ?? ""), [prompt]);
  const { feet } = chooseScaleFt(distance, fov, canvasHeight);
  const scaleStr = `1” = ${feet} ft`;

  // Zoning summary derived from the plan. Mirrors the old SideRail stats
  // block but trimmed to the essentials a real CE title block would carry:
  // lot area, gross floor area, FAR, and a setbacks compliance flag.
  const zoning = useMemo(() => {
    if (!plan) return null;
    const lotArea = plan.lot.width * plan.lot.depth;
    if (lotArea <= 0) return null;
    const buildings = (plan.buildings ?? []).filter(
      (b) => b.w > 0 && b.d > 0 && b.stories > 0,
    );
    const gfa = buildings.reduce((s, b) => s + b.w * b.d * b.stories, 0);
    const far = gfa / lotArea;
    const setbacksOk = buildings.every(
      (b) =>
        b.x >= plan.setbacks.side &&
        b.x + b.w <= plan.lot.width - plan.setbacks.side &&
        b.z >= plan.setbacks.front &&
        b.z + b.d <= plan.lot.depth - plan.setbacks.back,
    );
    return { lotArea, gfa, far, setbacksOk };
  }, [plan]);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute bottom-6 right-6 z-20 select-none"
    >
      <div className="bg-ink/55 backdrop-blur-md border border-paper/15 rounded-md px-3 py-2 shadow-[0_4px_18px_-4px_rgba(0,0,0,0.4)] min-w-[260px]">
        <div className="font-mono text-[8px] uppercase tracking-[0.25em] text-paper/45 mb-1.5">
          parcel · site plan
        </div>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 font-mono text-[10px] leading-tight">
          <dt className="text-mute uppercase tracking-[0.15em] text-[8px]">project</dt>
          <dd className="text-paper/90 truncate">{project}</dd>
          <dt className="text-mute uppercase tracking-[0.15em] text-[8px]">drawn</dt>
          <dd className="text-paper/90">parcel · ai</dd>
          <dt className="text-mute uppercase tracking-[0.15em] text-[8px]">date</dt>
          <dd className="text-paper/90">{dateStr}</dd>
          <dt className="text-mute uppercase tracking-[0.15em] text-[8px]">scale</dt>
          <dd className="text-paper/90">{scaleStr}</dd>
          <dt className="text-mute uppercase tracking-[0.15em] text-[8px]">sheet</dt>
          <dd className="text-paper/90">{sheet}</dd>
        </dl>
        {zoning && (
          <>
            <div className="my-1.5 border-t border-rule/40" />
            <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 font-mono text-[10px] leading-tight">
              <dt className="text-mute uppercase tracking-[0.15em] text-[8px]">lot</dt>
              <dd className="text-paper/90">{fmt(zoning.lotArea)} ft²</dd>
              <dt className="text-mute uppercase tracking-[0.15em] text-[8px]">gfa</dt>
              <dd className="text-paper/90">{fmt(zoning.gfa)} ft²</dd>
              <dt className="text-mute uppercase tracking-[0.15em] text-[8px]">far</dt>
              <dd className="text-paper/90">{zoning.far.toFixed(2)}</dd>
              <dt className="text-mute uppercase tracking-[0.15em] text-[8px]">
                setbacks
              </dt>
              <dd
                className={
                  zoning.setbacksOk
                    ? "text-emerald-300/90"
                    : "text-rose-300/90"
                }
              >
                {zoning.setbacksOk ? "✓ ok" : "✗ violation"}
              </dd>
            </dl>
          </>
        )}
      </div>
    </div>
  );
}
