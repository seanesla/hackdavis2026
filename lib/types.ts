// SitePlan coordinates: origin = front-left corner of lot.
// +x = right (lot width direction), +z = back (lot depth direction).
// All values in feet. building.{x,z} = front-left corner of footprint.
export const STORY_HEIGHT_FT = 10;

export type BuildingMaterial = "concrete" | "steel" | "wood" | "other";
export type BuildingUseType = "residential" | "commercial" | "other";
export type BuildingLayout = "open" | "divided";

export type SitePlanMeta = {
  material?: BuildingMaterial;
  useType?: BuildingUseType;
  layout?: BuildingLayout;
  floorAreaSqft?: number;
};

export type SitePlan = {
  lot: { width: number; depth: number };
  setbacks: { front: number; back: number; side: number };
  building?: { x: number; z: number; w: number; d: number; stories: number };
  parking?: { x: number; z: number }[];
  meta?: SitePlanMeta;
};

export type Step = { tool: string; note: string; ok: boolean };
