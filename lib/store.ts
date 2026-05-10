"use client";
import { create } from "zustand";
import type {
  Building,
  BuildingMaterial,
  SitePlan,
  Step,
  StructureType,
} from "./types";
import { floorPlanCacheKey } from "./floorPlanPrompt";
import {
  type FurnitureItem,
  type Room,
  interiorCacheKey,
} from "./furniture";
import { getPlans, savePlan } from "./pastPlansDb";

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

export type TranscriptEntry = { who: "ai" | "user"; text: string };

// Voice-flow-only types. Loose strings so the speech parser can capture more
// than the strict canonical types in `types.ts`; we synthesize natural-language
// from these into a prompt that the Gemini agent then interprets.
export type VoiceMaterial =
  | "wood"
  | "brick"
  | "stucco"
  | "concrete"
  | "steel"
  | "glass"
  | "other";
export type VoiceUseType = "residential" | "commercial" | "other";
export type BuildingLayout = "open" | "divided";

export type InterviewAnswers = {
  floorAreaSqft?: number;
  stories?: number;
  layout?: BuildingLayout;
  material?: VoiceMaterial;
  useType?: VoiceUseType;
};

export type InterviewKey = keyof InterviewAnswers;

type State = {
  plan: SitePlan | null;
  steps: Step[];
  running: boolean;
  loading: boolean;
  error: string | null;
  prompt: string;
  selectedFloor: FloorSelection | null;
  floorPlans: Record<string, FloorPlanRecord>;
  interiors: Record<string, InteriorRecord>;

  voiceMode: "idle" | "interview" | "freestyle";
  transcript: TranscriptEntry[];
  interviewIndex: number;
  interviewAnswers: InterviewAnswers;
  voiceSupported: boolean;
  muted: boolean;

  setPrompt: (s: string) => void;
  setLoading: (b: boolean) => void;
  runFromPrompt: (p: string) => Promise<void>;
  runFromInterview: (answers: InterviewAnswers) => Promise<void>;
  loadImportedPlan: (data: { plan: SitePlan; steps?: Step[]; prompt?: string }) => void;
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

  setVoiceMode: (m: State["voiceMode"]) => void;
  pushTranscript: (entry: TranscriptEntry) => void;
  nextQuestion: () => void;
  setAnswer: <K extends InterviewKey>(key: K, val: InterviewAnswers[K]) => void;
  resetVoice: () => void;
  setVoiceSupported: (b: boolean) => void;
  setMuted: (m: boolean) => void;
};

const STEP_INTERVAL_MS = 800;

// Local fallback used by interview mode when the real /api/plan route fails
// (e.g. no GEMINI_API_KEY). Builds a single building from the user's answers
// so the demo always renders something.
function buildFallbackPlan(a: InterviewAnswers): { plan: SitePlan; steps: Step[] } {
  const stories = a.stories ?? 2;
  const totalSqft = a.floorAreaSqft ?? 2400;
  const perFloor = Math.max(400, totalSqft / Math.max(1, stories));
  const side = Math.max(20, Math.round(Math.sqrt(perFloor)));
  const w = side;
  const d = side;

  const lot = { width: 147, depth: 147 };
  const setbacks = { front: 25, back: 20, side: 10 };
  const x = Math.round((lot.width - w) / 2);
  const z = Math.round((lot.depth - d) / 2);

  const m = a.material;
  const material: BuildingMaterial | undefined =
    m && m !== "other" ? m : undefined;

  let structure_type: StructureType | undefined;
  if (a.useType === "residential") structure_type = stories >= 3 ? "apartment" : "house";
  else if (a.useType === "commercial") structure_type = "office";

  const building: Building = { x, z, w, d, stories, material, structure_type };
  const plan: SitePlan = { lot, setbacks, buildings: [building] };

  const steps: Step[] = [
    { tool: "set_lot", note: `${lot.width} by ${lot.depth} feet`, ok: true },
    {
      tool: "place_building",
      note: `${w} by ${d}, ${stories} stor${stories === 1 ? "y" : "ies"}${
        material ? `, ${material}` : ""
      }`,
      ok: true,
    },
    {
      tool: "finalize",
      note: "(local fallback — add GEMINI_API_KEY for the real AI)",
      ok: true,
    },
  ];

  return { plan, steps };
}

function synthesizePrompt(a: InterviewAnswers): string {
  const parts: string[] = [];
  if (a.useType === "residential") parts.push("Design a residential building");
  else if (a.useType === "commercial") parts.push("Design a commercial building");
  else parts.push("Design a building");

  if (a.stories) parts.push(`with ${a.stories} ${a.stories === 1 ? "story" : "stories"}`);
  if (a.floorAreaSqft) parts.push(`totaling about ${a.floorAreaSqft} square feet`);
  if (a.layout === "open") parts.push("with an open plan");
  else if (a.layout === "divided") parts.push("with divided units");
  if (a.material && a.material !== "other") parts.push(`using ${a.material} construction`);
  return parts.join(" ") + ".";
}

export const useStore = create<State>((set, get) => {
  // Used to drop stale interval ticks if a new run starts (or reset is called)
  // before the previous run's stages finish replaying.
  let runId = 0;

  const runFromPrompt = async (p: string): Promise<void> => {
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
      const history = (await getPlans()).map((s) => ({
        prompt: s.prompt,
        sitePlan: s.sitePlan,
      }));
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: p, history }),
      });
      data = await res.json();
    } catch (err) {
      if (myRunId !== runId) return;
      set({
        running: false,
        loading: false,
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
        loading: false,
        error: message,
        steps: [{ tool: "error", note: message, ok: false }],
      });
      return;
    }

    const stages = data.stages ?? [];
    if (stages.length === 0) {
      set({
        running: false,
        loading: false,
        plan: data.plan ?? null,
        error: "Agent returned no steps.",
      });
      return;
    }

    const finalPlan = stages[stages.length - 1]?.plan ?? data.plan ?? null;
    if (finalPlan) {
      void savePlan(p, finalPlan);
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
          set({ running: false, loading: false });
        }
      }, STEP_INTERVAL_MS * (i + 1));
    });
  };

  return {
    plan: null,
    steps: [],
    running: false,
    loading: false,
    error: null,
    prompt: "",
    selectedFloor: null,
    floorPlans: {},
    interiors: {},

    voiceMode: "idle",
    transcript: [],
    interviewIndex: 0,
    interviewAnswers: {},
    voiceSupported: false,
    muted: false,

    setPrompt: (s) => set({ prompt: s }),
    setLoading: (b) => set({ loading: b }),

    reset: () => {
      runId++;
      set({
        plan: null,
        steps: [],
        running: false,
        loading: false,
        error: null,
        selectedFloor: null,
        floorPlans: {},
        interiors: {},
      });
    },

    runFromPrompt,

    loadImportedPlan: (data) => {
      // Invalidate any in-flight stage replays so they don't overwrite the
      // imported plan after it lands.
      runId++;
      set({
        plan: data.plan,
        steps: data.steps ?? [],
        prompt: data.prompt ?? "",
        running: false,
        loading: false,
        error: null,
        selectedFloor: null,
        floorPlans: {},
        interiors: {},
      });
    },

    runFromInterview: async (answers) => {
      const prompt = synthesizePrompt(answers);
      await runFromPrompt(prompt);
      // If the real API failed (no key, rate limit, etc.) build a local plan
      // from the answers so the demo still renders something.
      if (get().error) {
        const { plan, steps } = buildFallbackPlan(answers);
        set({
          plan,
          steps,
          running: false,
          loading: false,
          error: null,
        });
      }
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

    setVoiceMode: (m) => set({ voiceMode: m }),
    pushTranscript: (entry) =>
      set((s) => ({ transcript: [...s.transcript, entry] })),
    nextQuestion: () =>
      set((s) => ({ interviewIndex: s.interviewIndex + 1 })),
    setAnswer: (key, val) =>
      set((s) => ({ interviewAnswers: { ...s.interviewAnswers, [key]: val } })),
    resetVoice: () =>
      set({
        voiceMode: "idle",
        transcript: [],
        interviewIndex: 0,
        interviewAnswers: {},
        plan: null,
        steps: [],
        running: false,
        loading: false,
        error: null,
      }),
    setVoiceSupported: (b) => set({ voiceSupported: b }),
    setMuted: (m) => set({ muted: m }),
  };
});
