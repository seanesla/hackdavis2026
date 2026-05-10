"use client";
import { create } from "zustand";
import type { SitePlan, Step } from "./types";

type Stage = { step: Step; plan: SitePlan | null };

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
  reset: () => void;

  setVoiceMode: (m: State["voiceMode"]) => void;
  pushTranscript: (entry: TranscriptEntry) => void;
  nextQuestion: () => void;
  setAnswer: <K extends InterviewKey>(key: K, val: InterviewAnswers[K]) => void;
  resetVoice: () => void;
  setVoiceSupported: (b: boolean) => void;
  setMuted: (m: boolean) => void;
};

const STEP_INTERVAL_MS = 800;

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
      });
    },

    runFromPrompt,

    runFromInterview: async (answers) => {
      // Voice answers feed into a natural-language prompt; the real Gemini
      // agent over /api/plan does the actual planning and tool calls.
      const prompt = synthesizePrompt(answers);
      return runFromPrompt(prompt);
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
