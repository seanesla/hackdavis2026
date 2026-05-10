"use client";
import { useViewerStore } from "@/lib/viewerStore";

// Drag-to-sweep sun control. Maps slider 0..1 to a labeled time of day
// (~6am to ~7pm). Updates the directional light position live in Scene.tsx,
// so shadows sweep in real time as the user drags.
export default function SunSlider() {
  const sunTime = useViewerStore((s) => s.sunTime);
  const setSunTime = useViewerStore((s) => s.setSunTime);

  return (
    <div
      className={[
        "absolute bottom-6 left-1/2 -translate-x-1/2 z-30",
        "select-none rounded-md border border-rule bg-paper/85",
        "px-3 py-2 shadow-md backdrop-blur",
        "flex items-center gap-3",
      ].join(" ")}
    >
      <span aria-hidden className="text-base leading-none">
        ☀
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={sunTime}
        onChange={(e) => setSunTime(parseFloat(e.target.value))}
        aria-label="Time of day"
        className="w-48 accent-accent"
      />
      <span className="font-mono text-[10px] uppercase tracking-wider text-ink min-w-[68px] text-right">
        {timeLabel(sunTime)}
      </span>
    </div>
  );
}

function timeLabel(t: number): string {
  const hour = 6 + t * 13; // 6am .. 7pm
  const h = Math.floor(hour);
  const m = Math.floor((hour - h) * 60);
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = ((h - 1) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}
