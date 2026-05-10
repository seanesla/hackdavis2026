"use client";
import { useStore } from "@/lib/store";

// Floating site-metrics chip. Computes coverage / open space / counts
// directly from the live plan, so numbers update as the AI streams in
// new buildings/parking/trees.
export default function MetricsCard() {
  const plan = useStore((s) => s.plan);
  if (!plan || plan.lot.width <= 0 || plan.lot.depth <= 0) return null;

  const lotSqFt = plan.lot.width * plan.lot.depth;
  const totalFootprint = (plan.buildings ?? []).reduce(
    (s, b) => s + b.w * b.d,
    0
  );
  const parkingSqFt = (plan.parking?.length ?? 0) * 9 * 18;

  const coveragePct = (totalFootprint / lotSqFt) * 100;
  const pavedPct = (parkingSqFt / lotSqFt) * 100;
  const openPct = Math.max(0, 100 - coveragePct - pavedPct);

  const buildings = plan.buildings?.length ?? 0;
  const parking = plan.parking?.length ?? 0;
  const trees = plan.trees?.length ?? 0;

  const rows: Array<{ label: string; value: string; tone?: "warn" }> = [
    { label: "Coverage", value: `${coveragePct.toFixed(0)}%` },
    { label: "Paved", value: `${pavedPct.toFixed(0)}%` },
    { label: "Open", value: `${openPct.toFixed(0)}%` },
    { label: "Buildings", value: String(buildings) },
    { label: "Parking", value: String(parking) },
    { label: "Trees", value: String(trees) },
  ];

  return (
    <div
      className={[
        "absolute bottom-6 right-4 z-30",
        "select-none rounded-md border border-rule bg-paper/85",
        "px-3 py-2 shadow-md backdrop-blur",
        "min-w-[140px]",
      ].join(" ")}
    >
      <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-mute mb-1">
        Site
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 font-mono text-[11px] text-ink">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <span className="text-mute">{r.label}</span>
            <span className="text-right tabular-nums">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
