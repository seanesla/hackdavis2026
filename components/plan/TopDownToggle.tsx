"use client";
import { useEffect } from "react";
import { useViewerStore } from "@/lib/viewerStore";

// Floating button next to DebugToggle. Switches the camera between perspective
// and a top-down "plan view." Also responds to the `T` keyboard shortcut.
export default function TopDownToggle() {
  const topDown = useViewerStore((s) => s.topDown);
  const toggle = useViewerStore((s) => s.toggleTopDown);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "t" || e.key === "T") {
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === "INPUT" || target.tagName === "TEXTAREA")
        )
          return;
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={topDown}
      title="Top-down plan view (T)"
      className={[
        "absolute top-14 right-4 z-30",
        "select-none rounded-md border border-rule",
        "px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider",
        "shadow-md backdrop-blur transition-colors",
        topDown
          ? "bg-accent/90 text-ink border-accent"
          : "bg-paper/85 text-ink hover:bg-paper",
      ].join(" ")}
    >
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ink/60" />
        {topDown ? "Perspective" : "Top-down"}
      </span>
    </button>
  );
}
