"use client";
import { useEffect } from "react";
import { useViewControls } from "@/lib/viewControls";

// Floating toolbar, bottom-right of the planner viewport. Mirrors common 3D
// viewer affordances (zoom, reset, presets, toggles, screenshot) so users
// don't have to discover orbit/pan/scroll gestures to get a usable view.
export default function ViewControls() {
  const zoomIn = useViewControls((s) => s.zoomIn);
  const zoomOut = useViewControls((s) => s.zoomOut);
  const reset = useViewControls((s) => s.reset);
  const topDown = useViewControls((s) => s.topDown);
  const isometric = useViewControls((s) => s.isometric);
  const screenshot = useViewControls((s) => s.screenshot);
  const autoRotate = useViewControls((s) => s.autoRotate);
  const grid = useViewControls((s) => s.grid);
  const toggleAutoRotate = useViewControls((s) => s.toggleAutoRotate);
  const toggleGrid = useViewControls((s) => s.toggleGrid);

  // Keyboard shortcuts: +/− zoom, R reset, T top-down, I iso, G grid,
  // Space toggles auto-rotate. Skip when typing in inputs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable))
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case "+":
        case "=":
          zoomIn();
          break;
        case "-":
        case "_":
          zoomOut();
          break;
        case "r":
        case "R":
          reset();
          break;
        case "t":
        case "T":
          topDown();
          break;
        case "i":
        case "I":
          isometric();
          break;
        case "g":
        case "G":
          toggleGrid();
          break;
        case " ":
          e.preventDefault();
          toggleAutoRotate();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomIn, zoomOut, reset, topDown, isometric, toggleGrid, toggleAutoRotate]);

  return (
    <div className="absolute bottom-4 right-4 z-30 flex flex-col items-end gap-2">
      {/* Zoom cluster — tall, paired buttons. */}
      <div className="glass rounded-xl border border-rule overflow-hidden flex flex-col">
        <ToolBtn label="Zoom in (+)" onClick={zoomIn}>
          <PlusIcon />
        </ToolBtn>
        <div className="h-px bg-rule/60" />
        <ToolBtn label="Zoom out (−)" onClick={zoomOut}>
          <MinusIcon />
        </ToolBtn>
      </div>

      {/* View presets. */}
      <div className="glass rounded-xl border border-rule overflow-hidden flex flex-col">
        <ToolBtn label="Reset view (R)" onClick={reset}>
          <HomeIcon />
        </ToolBtn>
        <div className="h-px bg-rule/60" />
        <ToolBtn label="Top-down (T)" onClick={topDown}>
          <TopDownIcon />
        </ToolBtn>
        <div className="h-px bg-rule/60" />
        <ToolBtn label="Isometric (I)" onClick={isometric}>
          <IsoIcon />
        </ToolBtn>
      </div>

      {/* Toggles. */}
      <div className="glass rounded-xl border border-rule overflow-hidden flex flex-col">
        <ToolBtn
          label="Auto-rotate (Space)"
          active={autoRotate}
          onClick={toggleAutoRotate}
        >
          <RotateIcon />
        </ToolBtn>
        <div className="h-px bg-rule/60" />
        <ToolBtn label="Grid (G)" active={grid} onClick={toggleGrid}>
          <GridIcon />
        </ToolBtn>
      </div>

      {/* Capture. */}
      <div className="glass rounded-xl border border-rule overflow-hidden">
        <ToolBtn label="Screenshot" onClick={screenshot}>
          <CameraIcon />
        </ToolBtn>
      </div>
    </div>
  );
}

function ToolBtn({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={[
        "w-9 h-9 flex items-center justify-center transition-colors",
        active
          ? "bg-accent/20 text-accent"
          : "text-paper/80 hover:text-accent hover:bg-paper/5",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function MinusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
      <path d="M5 12h14" />
    </svg>
  );
}
function HomeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
      <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
    </svg>
  );
}
function TopDownIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
      <rect x="4" y="4" width="16" height="16" rx="1" />
      <path d="M4 12h16M12 4v16" />
    </svg>
  );
}
function IsoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
      <path d="M12 3l9 5v8l-9 5-9-5V8z" />
      <path d="M3 8l9 5 9-5M12 13v10" />
    </svg>
  );
}
function RotateIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
      <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
      <path d="M21 4v4h-4" />
      <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
      <path d="M3 20v-4h4" />
    </svg>
  );
}
function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}
function CameraIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
      <path d="M4 7h3l2-2h6l2 2h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
