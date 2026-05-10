"use client";
import { useDebugStore } from "@/lib/debugStore";

// Floating button overlaid on the planner imaging area. Toggles the same
// debug overlay that Shift+D controls. Position is bottom-right of the
// parent, so place this inside a `relative` container (the planner main area).
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
        "absolute bottom-4 right-4 z-30",
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
