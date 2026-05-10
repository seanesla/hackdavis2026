"use client";
import { create } from "zustand";

// Shared bridge between the in-Canvas scene (which owns the camera + controls)
// and the out-of-Canvas toolbar UI. The Scene registers callbacks on mount;
// the toolbar invokes them. Toggle flags (autoRotate, grid) are read by the
// Scene to drive its props directly.

type ViewState = {
  autoRotate: boolean;
  grid: boolean;
  setAutoRotate: (v: boolean) => void;
  toggleAutoRotate: () => void;
  toggleGrid: () => void;

  // Registered by Scene via `registerActions`.
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
  topDown: () => void;
  isometric: () => void;
  screenshot: () => void;

  registerActions: (a: Partial<{
    zoomIn: () => void;
    zoomOut: () => void;
    reset: () => void;
    topDown: () => void;
    isometric: () => void;
    screenshot: () => void;
  }>) => void;
};

const noop = () => {};

export const useViewControls = create<ViewState>((set) => ({
  autoRotate: true,
  grid: true,
  setAutoRotate: (v) => set({ autoRotate: v }),
  toggleAutoRotate: () => set((s) => ({ autoRotate: !s.autoRotate })),
  toggleGrid: () => set((s) => ({ grid: !s.grid })),

  zoomIn: noop,
  zoomOut: noop,
  reset: noop,
  topDown: noop,
  isometric: noop,
  screenshot: noop,

  registerActions: (a) => set((s) => ({ ...s, ...a })),
}));
