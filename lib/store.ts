"use client";
import { create } from "zustand";
import type {
  SitePlan,
  SitePlanMeta,
  Step,
  BuildingLayout,
  BuildingMaterial,
  BuildingUseType,
} from "./types";
import { mockPlan, mockSteps } from "./mockPlan";

export type TranscriptEntry = { who: "ai" | "user"; text: string };

export type InterviewAnswers = {
  floorAreaSqft?: number;
  stories?: number;
  layout?: BuildingLayout;
  material?: BuildingMaterial;
  useType?: BuildingUseType;
};

export type InterviewKey = keyof InterviewAnswers;

type State = {
  plan: SitePlan | null;
  steps: Step[];
  running: boolean;
  prompt: string;

  voiceMode: "idle" | "interview" | "freestyle";
  transcript: TranscriptEntry[];
  interviewIndex: number;
  interviewAnswers: InterviewAnswers;
  voiceSupported: boolean;
  muted: boolean;

  setPrompt: (s: string) => void;
  runFromPrompt: (p: string) => void;
  runFromInterview: (answers: InterviewAnswers) => void;
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
  parts.push(a.useType ? `${a.useType} building` : "building");
  if (a.stories) parts.push(`${a.stories} stories`);
  if (a.floorAreaSqft) parts.push(`${a.floorAreaSqft} sqft`);
  if (a.layout) parts.push(`${a.layout} layout`);
  if (a.material) parts.push(`${a.material} construction`);
  return parts.join(", ");
}

export const useStore = create<State>((set, get) => ({
  plan: null,
  steps: [],
  running: false,
  prompt: "",

  voiceMode: "idle",
  transcript: [],
  interviewIndex: 0,
  interviewAnswers: {},
  voiceSupported: false,
  muted: false,

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

  runFromInterview: (answers) => {
    if (get().running) return;
    const meta: SitePlanMeta = {
      floorAreaSqft: answers.floorAreaSqft,
      layout: answers.layout,
      material: answers.material,
      useType: answers.useType,
    };
    set({
      running: true,
      steps: [],
      plan: null,
      prompt: synthesizePrompt(answers),
    });

    const baseBuilding = mockPlan.building!;
    const stages: Array<{ step: Step; apply: (p: SitePlan | null) => SitePlan }> = [
      {
        step: mockSteps[0],
        apply: () => ({
          lot: mockPlan.lot,
          setbacks: mockPlan.setbacks,
          meta,
        }),
      },
      {
        step: mockSteps[1],
        apply: (p) => ({
          ...(p as SitePlan),
          building: {
            ...baseBuilding,
            stories: answers.stories ?? baseBuilding.stories,
          },
        }),
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
    }),
  setVoiceSupported: (b) => set({ voiceSupported: b }),
  setMuted: (m) => set({ muted: m }),
}));
