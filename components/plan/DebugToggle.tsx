"use client";
import { useDebugStore } from "@/lib/debugStore";

// Floating button overlaid on the planner imaging area. Toggles the same
// debug overlay that Shift+D controls. Position is top-right of the parent,
// so place this inside a `relative` container (the planner main area).
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
        "absolute top-4 right-4 z-30",
        "select-none rounded-md border border-rule",
        "px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider",
        "shadow-md backdrop-blur transition-colors",
        enabled
          ? "bg-fuchsia-600/90 text-white border-fuchsia-300"
          : "bg-paper/85 text-ink hover:bg-paper",
      ].join(" ")}
    >
      <span className="inline-flex items-center gap-1.5">
        <span
          className={[
            "h-1.5 w-1.5 rounded-full",
            enabled ? "bg-white shadow-[0_0_6px_white]" : "bg-mute",
          ].join(" ")}
        />
        Debug
      </span>
    </button>
  );
}
