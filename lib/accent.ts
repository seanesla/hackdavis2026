"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Accent = {
  name: string;
  hex: string;
  rgb: [number, number, number];
  soft: string;
};

export const ACCENTS: Accent[] = [
  { name: "amber",     hex: "#e8b86d", rgb: [0.91, 0.72, 0.43], soft: "rgba(232,184,109,0.12)" },
  { name: "blueprint", hex: "#7dd3fc", rgb: [0.49, 0.83, 0.99], soft: "rgba(125,211,252,0.12)" },
  { name: "moss",      hex: "#a3b18a", rgb: [0.64, 0.69, 0.54], soft: "rgba(163,177,138,0.14)" },
  { name: "brick",     hex: "#e07856", rgb: [0.88, 0.47, 0.34], soft: "rgba(224,120,86,0.12)" },
  { name: "iris",      hex: "#a78bfa", rgb: [0.65, 0.55, 0.98], soft: "rgba(167,139,250,0.14)" },
  { name: "rose",      hex: "#f472b6", rgb: [0.96, 0.45, 0.71], soft: "rgba(244,114,182,0.12)" },
];

type State = { accent: Accent; setAccent: (a: Accent) => void };

export const useAccent = create<State>()(
  persist(
    (set) => ({
      accent: ACCENTS[0],
      setAccent: (a) => {
        set({ accent: a });
        if (typeof document !== "undefined") {
          document.documentElement.style.setProperty("--color-accent", a.hex);
          document.documentElement.style.setProperty("--color-accent-soft", a.soft);
        }
      },
    }),
    {
      name: "parcel-accent",
      onRehydrateStorage: () => (s) => {
        if (s && typeof document !== "undefined") {
          document.documentElement.style.setProperty("--color-accent", s.accent.hex);
          document.documentElement.style.setProperty("--color-accent-soft", s.accent.soft);
        }
      },
    }
  )
);
