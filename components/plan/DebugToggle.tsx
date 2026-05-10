"use client";
import { useDebugStore } from "@/lib/debugStore";

// Floating button overlaid on the planner imaging area. Toggles the same
// debug overlay that Shift+D controls. Anchored to the top-left of the
// scene area (just past the SideRail at 16+400+16=432px), keeping it
// clear of every other overlay:
//   - NorthArrow      → top-right
//   - SceneTools      → centered on the right edge (mid-height strip)
//   - ScaleBar+Title  → bottom-right legend group
//   - TransparencyPill → bottom-left (past SideRail)
// On shorter viewports the right-edge SceneTools strip extended down into
// the legend group, so anchoring debug there caused collisions.
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
        "absolute top-4 left-[432px] z-30",
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
