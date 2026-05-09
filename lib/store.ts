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

const STEP_INTERVAL_MS = 800;

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

    const stages: Array<{ step: Step; apply: (p: SitePlan | null) => SitePlan }> = [
      {
        step: mockSteps[0],
        apply: () => ({
          lot: mockPlan.lot,
          setbacks: mockPlan.setbacks,
        }),
      },
      {
        step: mockSteps[1],
        apply: (p) => ({ ...(p as SitePlan), building: mockPlan.building }),
      },
      {
        step: mockSteps[2],
        apply: (p) => p as SitePlan,
      },
      {
        step: mockSteps[3],
        apply: (p) => ({ ...(p as SitePlan), parking: mockPlan.parking }),
      },
      {
        step: mockSteps[4],
        apply: (p) => p as SitePlan,
      },
    ];

    stages.forEach((stage, i) => {
      setTimeout(() => {
        set((s) => ({
          steps: [...s.steps, stage.step],
          plan: stage.apply(s.plan),
        }));
        if (i === stages.length - 1) set({ running: false });
      }, STEP_INTERVAL_MS * (i + 1));
    });
  },
}));
