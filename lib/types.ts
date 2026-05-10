// SitePlan coordinates: origin = front-left corner of lot.
// +x = right (lot width direction), +z = back (lot depth direction).
// All values in feet. building.{x,z} = front-left corner of footprint.
export const STORY_HEIGHT_FT = 10;

export const BUILDING_MATERIALS = [
  "wood",
  "brick",
  "stucco",
  "concrete",
  "steel",
  "glass",
] as const;
export type BuildingMaterial = (typeof BUILDING_MATERIALS)[number];

export const STRUCTURE_TYPES = [
  "house",
  "apartment",
  "office",
  "warehouse",
  "parking_garage",
  "garage",
  "greenhouse",
  "pavilion",
] as const;
export type StructureType = (typeof STRUCTURE_TYPES)[number];

export type Building = {
  x: number;
  z: number;
  w: number;
  d: number;
  stories: number;
  material?: BuildingMaterial;
  structure_type?: StructureType;
  // Free-form description of the building's USE, captured verbatim from the
  // user's brief (e.g. "elementary school", "single-family house", "fire
  // station", "public library", "corner cafe"). Drives the interior room
  // layout + furniture. Orthogonal to `structure_type`, which only affects
  // exterior massing — a "fire station" might still render as a `house`-
  // typed building visually but get a fire-station interior.
  program?: string;
};

export const TREE_SPECIES = ["oak", "pine", "palm", "maple"] as const;
export type TreeSpecies = (typeof TREE_SPECIES)[number];
export type Tree = {
  x: number;
  z: number;
  species: TreeSpecies;
  // Trunk-to-tip height in feet. Foliage radius derived from this.
  height: number;
};

export const WALKWAY_MATERIALS = ["flagstone", "concrete", "asphalt"] as const;
export type WalkwayMaterial = (typeof WALKWAY_MATERIALS)[number];
export type Walkway = {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  width: number;
  material: WalkwayMaterial;
};

export const FENCE_STYLES = ["wood", "wrought-iron", "hedge"] as const;
export type FenceStyle = (typeof FENCE_STYLES)[number];
export type Fence = {
  sides: ("front" | "back" | "left" | "right")[];
  style: FenceStyle;
};

export const BUSH_VARIETIES = ["boxwood", "hedge_round", "flowering"] as const;
export type BushVariety = (typeof BUSH_VARIETIES)[number];
export type Bush = {
  x: number;
  z: number;
  variety: BushVariety;
  // Canopy diameter at widest in feet. Drives both render scale and avoidance.
  // Defaults: boxwood 3.5, hedge_round 4.5, flowering 3.0.
  size: number;
};

export const STREET_PROPS = [
  "bench",
  "trash_can",
  "mailbox",
  "fire_hydrant",
  "planter",
  "bus_stop",
  "stop_sign",
  "dumpster",
] as const;
export type StreetPropKind = (typeof STREET_PROPS)[number];
export type StreetProp = {
  x: number;
  z: number;
  kind: StreetPropKind;
  // Yaw in degrees. 0 = no rotation.
  yaw?: number;
};

export const POOL_SHAPES = ["rectangle", "round", "kidney"] as const;
export type PoolShape = (typeof POOL_SHAPES)[number];
export type Pool = {
  // Front-left corner of the pool's bounding box, in lot coords.
  x: number;
  z: number;
  // Bounding box dimensions in feet. For shape='round' the pool is a circle
  // inscribed in the bbox (so w should equal d); for 'kidney' the curve fits
  // inside the bbox.
  w: number;
  d: number;
  shape: PoolShape;
};

export type SitePlan = {
  lot: { width: number; depth: number };
  setbacks: { front: number; back: number; side: number };
  buildings?: Building[];
  parking?: { x: number; z: number }[];
  trees?: Tree[];
  walkways?: Walkway[];
  fences?: Fence[];
  props?: StreetProp[];
  bushes?: Bush[];
  pools?: Pool[];
};

export type Step = { tool: string; note: string; ok: boolean };
