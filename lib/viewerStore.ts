"use client";
import { create } from "zustand";

type ViewerState = {
  topDown: boolean;
  /** Sun position 0..1 — 0 = morning (east, low), 0.5 = noon (overhead),
   *  1 = evening (west, low). Drives the directional light position. */
  sunTime: number;
  toggleTopDown: () => void;
  setSunTime: (v: number) => void;
};

// Shared store for in-canvas viewer controls (top-down toggle, sun slider).
// Same pattern as debugStore — buttons + the Scene both subscribe.
export const useViewerStore = create<ViewerState>((set) => ({
  topDown: false,
  sunTime: 0.5,
  toggleTopDown: () => set((s) => ({ topDown: !s.topDown })),
  setSunTime: (v) => set({ sunTime: Math.max(0, Math.min(1, v)) }),
}));
