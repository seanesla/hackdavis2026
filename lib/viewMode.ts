"use client";
import { create } from "zustand";

export type ViewMode = "perspective" | "plan" | "elevation";

type State = {
  mode: ViewMode;
  setMode: (m: ViewMode) => void;
};

export const useViewMode = create<State>((set) => ({
  mode: "perspective",
  setMode: (mode) => set({ mode }),
}));
