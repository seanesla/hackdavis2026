"use client";
import { create } from "zustand";

type DebugState = {
  enabled: boolean;
  toggle: () => void;
  set: (v: boolean) => void;
};

// Tiny shared store for the planner's debug overlay. Both the on-screen
// button and the Shift+D keyboard shortcut flip the same boolean here.
export const useDebugStore = create<DebugState>((set) => ({
  enabled: false,
  toggle: () => set((s) => ({ enabled: !s.enabled })),
  set: (v) => set({ enabled: v }),
}));
