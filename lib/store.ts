"use client";
import { create } from "zustand";
import type { SitePlan, Step } from "./types";

type State = {
  plan: SitePlan | null;
  steps: Step[];
  running: boolean;
  prompt: string;
  setPrompt: (s: string) => void;
  runFromPrompt: (p: string) => Promise<void>;
  reset: () => void;
};

const STEP_INTERVAL_MS = 800;

function applyStep(prev: SitePlan | null, step: Step, finalPlan: SitePlan): SitePlan {
  switch (step.tool) {
    case "set_lot":
      return { lot: finalPlan.lot, setbacks: finalPlan.setbacks };
    case "place_building":
      return { ...(prev ?? finalPlan), building: finalPlan.building };
    case "place_parking":
      return { ...(prev ?? finalPlan), parking: finalPlan.parking };
    default:
      return prev ?? finalPlan;
  }
}

export const useStore = create<State>((set, get) => ({
  plan: null,
  steps: [],
  running: false,
  prompt: "",
  setPrompt: (s) => set({ prompt: s }),
  reset: () => set({ plan: null, steps: [], running: false }),
  runFromPrompt: async (p) => {
    if (get().running) return;
    set({ running: true, steps: [], plan: null, prompt: p });

    let plan: SitePlan;
    let steps: Step[];
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: p }),
      });
      const data = (await res.json()) as { plan: SitePlan; steps: Step[] };
      plan = data.plan;
      steps = data.steps ?? [];
    } catch {
      set({ running: false });
      return;
    }

    if (steps.length === 0) {
      set({ plan, running: false });
      return;
    }

    steps.forEach((step, i) => {
      setTimeout(() => {
        set((s) => ({
          steps: [...s.steps, step],
          plan: applyStep(s.plan, step, plan),
        }));
        if (i === steps.length - 1) set({ plan, running: false });
      }, STEP_INTERVAL_MS * (i + 1));
    });
  },
}));
