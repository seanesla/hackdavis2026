import type { SitePlan, Step } from "./types";

export const mockSteps: Step[] = [
  { tool: "set_lot", note: "Set 0.5 acre lot (147 x 147 ft)", ok: true },
  { tool: "place_building", note: "Placed 50x30 ft, 3-story building", ok: true },
  { tool: "check_setbacks", note: "Front 25 / sides 10 / back 20 — OK", ok: true },
  { tool: "place_parking", note: "Fit 12 stalls along the back edge", ok: true },
  { tool: "finalize", note: "Plan validated", ok: true },
];

// Coordinates: origin = front-left corner of lot; +x = right, +z = back. Feet.
const LOT = { width: 147, depth: 147 };
const SETBACKS = { front: 25, back: 20, side: 10 };
const BUILDING = { x: 48, z: 30, w: 50, d: 30, stories: 3 };

const STALL_W = 9;
const STALL_D = 18;
const stalls: { x: number; z: number }[] = [];
const startX = SETBACKS.side + 4;
const stallZ = LOT.depth - SETBACKS.back - STALL_D;
for (let i = 0; i < 12; i++) {
  stalls.push({ x: startX + i * STALL_W, z: stallZ });
}

export const mockPlan: SitePlan = {
  lot: LOT,
  setbacks: SETBACKS,
  building: BUILDING,
  parking: stalls,
};
