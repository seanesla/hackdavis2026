"use client";
import { create } from "zustand";
import type { SitePlan, Step } from "./types";
import { mockPlan, mockSteps } from "./mockPlan";

type State = {
  plan: SitePlan | null;
  steps: Step[];
  running: boolean;
  prompt: string;
  setPrompt: (s: string) => void;
  runFromPrompt: (p: string) => void;
  reset: () => void;
};

export const useStore = create<State>((set, get) => ({
  plan: null,
  steps: [],
  running: false,
  prompt: "",
  setPrompt: (s) => set({ prompt: s }),
  reset: () => set({ plan: null, steps: [], running: false }),
  runFromPrompt: (p) => {
    if (get().running) return;
    set({ running: true, steps: [], plan: null, prompt: p });
    mockSteps.forEach((step, i) => {
      setTimeout(() => {
        set((s) => ({ steps: [...s.steps, step] }));
        if (i === mockSteps.length - 1) {
          set({ plan: mockPlan, running: false });
        }
      }, 700 * (i + 1));
    });
  },
}));
