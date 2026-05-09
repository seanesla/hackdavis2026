"use client";
import { create } from "zustand";
import type { SitePlan, Step } from "./types";

type Stage = { step: Step; plan: SitePlan | null };

type State = {
  plan: SitePlan | null;
  steps: Step[];
  running: boolean;
  error: string | null;
  prompt: string;
  setPrompt: (s: string) => void;
  runFromPrompt: (p: string) => Promise<void>;
  reset: () => void;
};

const STEP_INTERVAL_MS = 800;

export const useStore = create<State>((set, get) => {
  // Used to drop stale interval ticks if a new run starts (or reset is called)
  // before the previous run's stages finish replaying.
  let runId = 0;

  return {
    plan: null,
    steps: [],
    running: false,
    error: null,
    prompt: "",

    setPrompt: (s) => set({ prompt: s }),

    reset: () => {
      runId++;
      set({ plan: null, steps: [], running: false, error: null });
    },

    runFromPrompt: async (p) => {
      if (get().running) return;
      const myRunId = ++runId;

      set({
        running: true,
        steps: [],
        plan: null,
        error: null,
        prompt: p,
      });

      let data: {
        ok: boolean;
        stages?: Stage[];
        plan?: SitePlan | null;
        error?: string;
        retryAfterSeconds?: number | null;
      };

      try {
        const res = await fetch("/api/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: p }),
        });
        data = await res.json();
      } catch (err) {
        if (myRunId !== runId) return;
        set({
          running: false,
          error: err instanceof Error ? err.message : "Network error",
        });
        return;
      }

      if (myRunId !== runId) return;

      if (!data.ok) {
        const message = data.retryAfterSeconds
          ? `${data.error} Retry in ~${data.retryAfterSeconds}s.`
          : data.error ?? "Planning failed.";
        set({
          running: false,
          error: message,
          steps: [{ tool: "error", note: message, ok: false }],
        });
        return;
      }

      const stages = data.stages ?? [];
      if (stages.length === 0) {
        set({
          running: false,
          plan: data.plan ?? null,
          error: "Agent returned no steps.",
        });
        return;
      }

      // Replay stages with intervals so per-step drop animations land cleanly.
      stages.forEach((stage, i) => {
        setTimeout(() => {
          if (myRunId !== runId) return;
          set((s) => ({
            steps: [...s.steps, stage.step],
            plan: stage.plan,
          }));
          if (i === stages.length - 1) {
            set({ running: false });
          }
        }, STEP_INTERVAL_MS * (i + 1));
      });
    },
  };
});
