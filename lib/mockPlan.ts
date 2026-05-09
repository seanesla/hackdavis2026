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
