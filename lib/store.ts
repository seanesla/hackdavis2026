"use client";
import { create } from "zustand";
import type { SitePlan, Step } from "./types";
import { floorPlanCacheKey } from "./floorPlanPrompt";
import {
  type FurnitureItem,
  type Room,
  interiorCacheKey,
} from "./furniture";

type Stage = { step: Step; plan: SitePlan | null };

export type FloorSelection = {
  buildingIndex: number;
  storyIndex: number;
};

export type FloorPlanRecord = {
  status: "loading" | "ready" | "error";
  dataUrl?: string;
  prompt?: string;
  error?: string;
  retryAfterSeconds?: number | null;
};

export type InteriorRecord = {
  status: "loading" | "ready" | "error";
  rooms?: Room[];
  furniture?: FurnitureItem[];
  error?: string;
  retryAfterSeconds?: number | null;
};

type State = {
  plan: SitePlan | null;
  steps: Step[];
  running: boolean;
  error: string | null;
  prompt: string;
  selectedFloor: FloorSelection | null;
  floorPlans: Record<string, FloorPlanRecord>;
  interiors: Record<string, InteriorRecord>;
  setPrompt: (s: string) => void;
  runFromPrompt: (p: string) => Promise<void>;
  reset: () => void;
  selectFloor: (sel: FloorSelection | null) => void;
  fetchFloorPlan: (force?: boolean) => Promise<void>;
  fetchFloorPlanFor: (
    buildingIndex: number,
    storyIndex: number,
    force?: boolean
  ) => Promise<void>;
  prefetchAllFloorPlans: () => Promise<void>;
  fetchInteriorFor: (
    buildingIndex: number,
    storyIndex: number,
    force?: boolean
  ) => Promise<void>;
  prefetchAllInteriors: () => Promise<void>;
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
    selectedFloor: null,
    floorPlans: {},
    interiors: {},

    setPrompt: (s) => set({ prompt: s }),

    reset: () => {
      runId++;
      set({
        plan: null,
        steps: [],
        running: false,
        error: null,
        selectedFloor: null,
        floorPlans: {},
        interiors: {},
      });
    },

    selectFloor: (sel) => set({ selectedFloor: sel }),

    fetchFloorPlan: async (force = false) => {
      const { selectedFloor } = get();
      if (!selectedFloor) return;
      await get().fetchFloorPlanFor(
        selectedFloor.buildingIndex,
        selectedFloor.storyIndex,
        force
      );
    },

    fetchFloorPlanFor: async (buildingIndex, storyIndex, force = false) => {
      const { plan, floorPlans } = get();
      if (!plan?.buildings) return;
      const b = plan.buildings[buildingIndex];
      if (!b) return;
      const key = floorPlanCacheKey(b, storyIndex);

      const existing = floorPlans[key];
      if (!force && existing?.status === "ready") return;
      if (existing?.status === "loading") return;

      set((s) => ({
        floorPlans: { ...s.floorPlans, [key]: { status: "loading" } },
      }));

      try {
        const res = await fetch("/api/floorplan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            buildingIndex,
            storyIndex,
            plan,
            forceRegenerate: force,
          }),
        });
        const data = await res.json();

        if (!data.ok) {
          set((s) => ({
            floorPlans: {
              ...s.floorPlans,
              [key]: {
                status: "error",
                error: data.error ?? "Image generation failed.",
                retryAfterSeconds: data.retryAfterSeconds ?? null,
              },
            },
          }));
          return;
        }
        set((s) => ({
          floorPlans: {
            ...s.floorPlans,
            [key]: {
              status: "ready",
              dataUrl: data.image.dataUrl,
              prompt: data.prompt,
            },
          },
        }));
      } catch (err) {
        set((s) => ({
          floorPlans: {
            ...s.floorPlans,
            [key]: {
              status: "error",
              error: err instanceof Error ? err.message : "Network error",
            },
          },
        }));
      }
    },

    // Kick off floor-plan generation for every unique (footprint × story)
    // combination as soon as the plan settles, so clicking a floor reveals
    // the plate instantly. Cache key dedupes identical floors across
    // siblings; throttled to 2 concurrent so we don't trip image rate limits.
    prefetchAllFloorPlans: async () => {
      const { plan, floorPlans } = get();
      if (!plan?.buildings) return;

      const tasks: Array<{ bi: number; si: number; key: string }> = [];
      const seen = new Set<string>();
      plan.buildings.forEach((b, bi) => {
        if (b.w <= 0 || b.d <= 0 || b.stories <= 0) return;
        for (let si = 0; si < b.stories; si++) {
          const key = floorPlanCacheKey(b, si);
          if (seen.has(key)) continue;
          seen.add(key);
          const existing = floorPlans[key];
          if (existing?.status === "ready" || existing?.status === "loading")
            continue;
          tasks.push({ bi, si, key });
        }
      });

      const CONCURRENCY = 2;
      const queue = [...tasks];
      const workers = Array.from({ length: CONCURRENCY }, async () => {
        while (queue.length > 0) {
          const t = queue.shift();
          if (!t) break;
          await get().fetchFloorPlanFor(t.bi, t.si);
        }
      });
      await Promise.all(workers);
    },

    fetchInteriorFor: async (buildingIndex, storyIndex, force = false) => {
      const { plan, interiors } = get();
      if (!plan?.buildings) return;
      const b = plan.buildings[buildingIndex];
      if (!b) return;
      const key = interiorCacheKey({
        w: Math.round(b.w),
        d: Math.round(b.d),
        stories: b.stories,
        storyIndex,
        structureType: b.structure_type ?? "office",
        material: b.material ?? "concrete",
      });

      const existing = interiors[key];
      if (!force && existing?.status === "ready") return;
      if (existing?.status === "loading") return;

      set((s) => ({
        interiors: { ...s.interiors, [key]: { status: "loading" } },
      }));

      try {
        const res = await fetch("/api/interior", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            buildingIndex,
            storyIndex,
            plan,
            forceRegenerate: force,
          }),
        });
        const data = await res.json();
        if (!data.ok) {
          set((s) => ({
            interiors: {
              ...s.interiors,
              [key]: {
                status: "error",
                error: data.error ?? "Interior generation failed.",
                retryAfterSeconds: data.retryAfterSeconds ?? null,
              },
            },
          }));
          return;
        }
        set((s) => ({
          interiors: {
            ...s.interiors,
            [key]: {
              status: "ready",
              rooms: data.rooms ?? [],
              furniture: data.furniture ?? [],
            },
          },
        }));
      } catch (err) {
        set((s) => ({
          interiors: {
            ...s.interiors,
            [key]: {
              status: "error",
              error: err instanceof Error ? err.message : "Network error",
            },
          },
        }));
      }
    },

    // Mirrors prefetchAllFloorPlans — kicks off interior layouts for every
    // unique floor as soon as the plan settles, so the user gets instant
    // furniture on click. Independent throttle from the floor-plan prefetch
    // since this is a text endpoint and much cheaper.
    prefetchAllInteriors: async () => {
      const { plan, interiors } = get();
      if (!plan?.buildings) return;

      const tasks: Array<{ bi: number; si: number; key: string }> = [];
      const seen = new Set<string>();
      plan.buildings.forEach((b, bi) => {
        if (b.w <= 0 || b.d <= 0 || b.stories <= 0) return;
        for (let si = 0; si < b.stories; si++) {
          const key = interiorCacheKey({
            w: Math.round(b.w),
            d: Math.round(b.d),
            stories: b.stories,
            storyIndex: si,
            structureType: b.structure_type ?? "office",
            material: b.material ?? "concrete",
          });
          if (seen.has(key)) continue;
          seen.add(key);
          const existing = interiors[key];
          if (existing?.status === "ready" || existing?.status === "loading")
            continue;
          tasks.push({ bi, si, key });
        }
      });

      const CONCURRENCY = 3;
      const queue = [...tasks];
      const workers = Array.from({ length: CONCURRENCY }, async () => {
        while (queue.length > 0) {
          const t = queue.shift();
          if (!t) break;
          await get().fetchInteriorFor(t.bi, t.si);
        }
      });
      await Promise.all(workers);
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
        selectedFloor: null,
        floorPlans: {},
        interiors: {},
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
