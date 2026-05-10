"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useStore } from "@/lib/store";
import {
  isSceneReady,
  subscribeReady,
  takeScreenshot,
  zoomIn,
  zoomOut,
} from "@/lib/sceneControls";

// Floating right-edge toolbar for camera/scene controls. Mirrors the
// SideRail's `glass` aesthetic so it reads as part of the same UI surface.
export default function SceneTools() {
  const autoRotate = useStore((s) => s.autoRotate);
  const setAutoRotate = useStore((s) => s.setAutoRotate);
  const bumpResetTick = useStore((s) => s.bumpResetTick);
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);
  const gridVisible = useStore((s) => s.gridVisible);
  const setGridVisible = useStore((s) => s.setGridVisible);

  // Subscribe to the singleton so buttons disable until OrbitControls
  // actually mounts inside the canvas.
  const [ready, setReady] = useState<boolean>(() => isSceneReady());
  useEffect(() => subscribeReady(() => setReady(isSceneReady())), []);

  // Track fullscreen via the native event so the button reflects reality
  // (user can press Esc to exit, which we'd otherwise miss).
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = (): void => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen().catch(() => {
        // Most common cause: blocked by a permissions policy in an iframe.
        // Silent — the button will simply not change state.
      });
    }
  };

  const recenter = (): void => {
    if (viewMode !== "perspective") setViewMode("perspective");
    bumpResetTick();
  };

  const handleScreenshot = (): void => {
    if (!ready) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    takeScreenshot(`siteplan-${stamp}.png`);
  };

  return (
    <motion.div
      initial={{ x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
      className="glass absolute top-1/2 right-4 -translate-y-1/2 rounded-2xl flex flex-col p-1.5 gap-1 z-10"
      role="toolbar"
      aria-label="scene controls"
    >
      <ToolButton
        label="zoom in"
        onClick={zoomIn}
        disabled={!ready}
        icon={
          <>
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="11" y1="8" x2="11" y2="14" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </>
        }
      />
      <ToolButton
        label="zoom out"
        onClick={zoomOut}
        disabled={!ready}
        icon={
          <>
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </>
        }
      />
      <Divider />
      <ToolButton
        label="recenter view"
        onClick={recenter}
        icon={
          <>
            <path d="M12 3v3" />
            <path d="M12 18v3" />
            <path d="M3 12h3" />
            <path d="M18 12h3" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
          </>
        }
      />
      <ToolButton
        label={viewMode === "top" ? "exit top-down" : "top-down view"}
        onClick={() =>
          setViewMode(viewMode === "top" ? "perspective" : "top")
        }
        active={viewMode === "top"}
        icon={
          <>
            <rect x="4" y="4" width="16" height="16" rx="1.5" />
            <line x1="4" y1="9" x2="20" y2="9" />
            <line x1="4" y1="15" x2="20" y2="15" />
            <line x1="9" y1="4" x2="9" y2="20" />
            <line x1="15" y1="4" x2="15" y2="20" />
          </>
        }
      />
      <Divider />
      <ToolButton
        label={autoRotate ? "stop auto-rotate" : "start auto-rotate"}
        onClick={() => setAutoRotate(!autoRotate)}
        active={autoRotate}
        icon={
          <>
            <path d="M21 12a9 9 0 1 1-3-6.7" />
            <polyline points="21 4 21 10 15 10" />
          </>
        }
      />
      <ToolButton
        label={gridVisible ? "hide grid" : "show grid"}
        onClick={() => setGridVisible(!gridVisible)}
        active={gridVisible}
        icon={
          <>
            <rect x="3" y="3" width="18" height="18" rx="0.5" />
            <line x1="9" y1="3" x2="9" y2="21" />
            <line x1="15" y1="3" x2="15" y2="21" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="3" y1="15" x2="21" y2="15" />
          </>
        }
      />
      <Divider />
      <ToolButton
        label="screenshot"
        onClick={handleScreenshot}
        disabled={!ready}
        icon={
          <>
            <path d="M3 7h3l2-2h8l2 2h3v12H3z" />
            <circle cx="12" cy="13" r="4" />
          </>
        }
      />
      <ToolButton
        label={isFullscreen ? "exit fullscreen" : "enter fullscreen"}
        onClick={toggleFullscreen}
        active={isFullscreen}
        icon={
          isFullscreen ? (
            <>
              <polyline points="9 4 4 4 4 9" />
              <polyline points="15 4 20 4 20 9" />
              <polyline points="9 20 4 20 4 15" />
              <polyline points="15 20 20 20 20 15" />
            </>
          ) : (
            <>
              <polyline points="4 9 4 4 9 4" />
              <polyline points="20 9 20 4 15 4" />
              <polyline points="4 15 4 20 9 20" />
              <polyline points="20 15 20 20 15 20" />
            </>
          )
        }
      />
    </motion.div>
  );
}

function Divider() {
  return <div className="h-px mx-1.5 my-0.5 bg-rule/60" />;
}

function ToolButton({
  label,
  onClick,
  icon,
  disabled,
  active,
}: {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`flex items-center justify-center w-9 h-9 rounded-md transition-colors cursor-pointer ${
        active
          ? "bg-accent/15 text-accent"
          : "text-mute hover:text-accent hover:bg-paper/5"
      } disabled:opacity-30 disabled:cursor-not-allowed`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-4 h-4"
        aria-hidden="true"
      >
        {icon}
      </svg>
    </button>
  );
}
