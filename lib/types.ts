export type SitePlan = {
  lot: { width: number; depth: number };
  setbacks: { front: number; back: number; side: number };
  building?: { x: number; z: number; w: number; d: number; stories: number };
  parking?: { x: number; z: number }[];
};

export type Step = { tool: string; note: string; ok: boolean };
