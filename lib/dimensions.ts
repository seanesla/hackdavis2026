"use client";
import { create } from "zustand";

type State = {
  show: boolean;
  toggle: () => void;
  setShow: (v: boolean) => void;
};

export const useDimensions = create<State>((set, get) => ({
  show: false,
  toggle: () => set({ show: !get().show }),
  setShow: (show) => set({ show }),
}));
