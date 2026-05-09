import type { SitePlan, Step } from "./types";

export const mockSteps: Step[] = [
  { tool: "set_lot", note: "lot squared. 147 by 147 feet.", ok: true },
  {
    tool: "place_building",
    note: "60 by 40, three stories, tucked inside the setbacks.",
    ok: true,
  },
  {
    tool: "check_setbacks",
    note: "front 25, sides 10, back 20. lines hold.",
    ok: true,
  },
  {
    tool: "place_parking",
    note: "twelve stalls along the east hedge.",
    ok: true,
  },
  { tool: "finalize", note: "checked twice. ready.", ok: true },
];

// Coordinates: origin = front-left corner of lot; +x = right, +z = back. Feet.
const LOT = { width: 147, depth: 147 };
const SETBACKS = { front: 25, back: 20, side: 10 };
const BUILDING = { x: 43, z: 30, w: 60, d: 40, stories: 3 };

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
