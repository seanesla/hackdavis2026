import type { SitePlan, Step } from "./types";

export const mockSteps: Step[] = [
  { tool: "set_lot", note: "Set 0.5 acre lot (147 x 147 ft)", ok: true },
  { tool: "place_building", note: "Placed 60x40 ft, 3-story building centered", ok: true },
  { tool: "check_setbacks", note: "Front 25 / sides 10 / back 20 — OK", ok: true },
  { tool: "place_parking", note: "Fit 12 stalls along the east edge", ok: true },
  { tool: "finalize", note: "Plan validated", ok: true },
];

const stalls: { x: number; z: number }[] = [];
for (let i = 0; i < 12; i++) {
  stalls.push({ x: 55, z: -55 + i * 10 });
}

export const mockPlan: SitePlan = {
  lot: { width: 147, depth: 147 },
  setbacks: { front: 25, back: 20, side: 10 },
  building: { x: 0, z: 0, w: 60, d: 40, stories: 3 },
  parking: stalls,
};
