"use client";
import { useDebugStore } from "@/lib/debugStore";

// Floating button overlaid on the planner imaging area. Toggles the same
// debug overlay that Shift+D controls. Position is bottom-right of the
// parent (place this inside a `relative` container — the planner main area),
// stacked ABOVE the ScaleBar (which lives at bottom-6 right-6 and is ~30px
// tall) so the two don't fight for the same corner. bottom-16 = 64px clears
// the bar with breathing room.
export default function DebugToggle() {
  const enabled = useDebugStore((s) => s.enabled);
  const toggle = useDebugStore((s) => s.toggle);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={enabled}
      title="Toggle debug overlay (shift+D)"
      className={[
        "absolute bottom-16 right-4 z-30",
        "select-none rounded-md border border-rule",
        "px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider",
        "shadow-md backdrop-blur transition-colors",
        enabled
          ? "bg-fuchsia-600/90 text-white border-fuchsia-300"
          : "bg-paper/85 text-ink hover:bg-paper",
      ].join(" ")}
    >
      Debug
    </button>
  );
}
