// Catalog of furniture kinds the LLM can place inside a story. Sizes are
// fixed here, not chosen by the model — the agent only picks kind + position
// + yaw. Same architecture as the buildings: model fills JSON, code renders
// boxes. Footprints in feet (w along default-x, d along default-z, h up).

export const FURNITURE_KINDS = [
  // Living room
  "sofa",
  "armchair",
  "coffee_table",
  "tv_stand",
  "bookshelf",
  // Dining
  "dining_table",
  "dining_chair",
  // Bedroom
  "bed",
  "nightstand",
  "wardrobe",
  // Bathroom
  "toilet",
  "sink",
  "bathtub",
  "shower",
  // Kitchen
  "kitchen_island",
  "stove",
  "fridge",
  "kitchen_counter",
  // Office / work
  "desk",
  "office_chair",
  "meeting_table",
  "filing_cabinet",
  "reception_desk",
  // Common
  "plant",
  "lamp",
  // Industrial
  "warehouse_rack",
  "pallet",
] as const;

export type FurnitureKind = (typeof FURNITURE_KINDS)[number];

export type FurnitureSpec = {
  w: number;
  d: number;
  h: number;
  // Short hint for the LLM so it picks appropriate items.
  hint: string;
};

export const FURNITURE_CATALOG: Record<FurnitureKind, FurnitureSpec> = {
  sofa: { w: 7, d: 3, h: 2.8, hint: "3-seater living-room sofa" },
  armchair: { w: 3, d: 3, h: 2.8, hint: "single accent chair" },
  coffee_table: { w: 4, d: 2.5, h: 1.4, hint: "low coffee table" },
  tv_stand: { w: 5, d: 1.5, h: 2, hint: "TV console" },
  bookshelf: { w: 3, d: 1, h: 6, hint: "tall bookshelf" },
  dining_table: { w: 6, d: 3, h: 2.5, hint: "dining table for 4-6" },
  dining_chair: { w: 1.5, d: 1.5, h: 3, hint: "dining chair" },
  bed: { w: 5, d: 6.5, h: 2, hint: "queen bed" },
  nightstand: { w: 1.5, d: 1.5, h: 2, hint: "small nightstand" },
  wardrobe: { w: 4, d: 2, h: 7, hint: "tall wardrobe" },
  toilet: { w: 1.5, d: 2.5, h: 2.5, hint: "toilet" },
  sink: { w: 2, d: 1.5, h: 3, hint: "bathroom or kitchen sink" },
  bathtub: { w: 5, d: 2.5, h: 1.5, hint: "bathtub" },
  shower: { w: 3, d: 3, h: 7, hint: "shower stall" },
  kitchen_island: { w: 6, d: 3, h: 3, hint: "kitchen island" },
  stove: { w: 2.5, d: 2, h: 3, hint: "stove / cooktop" },
  fridge: { w: 3, d: 2.5, h: 6, hint: "refrigerator" },
  kitchen_counter: { w: 6, d: 2, h: 3, hint: "kitchen counter run" },
  desk: { w: 5, d: 2.5, h: 2.5, hint: "office or writing desk" },
  office_chair: { w: 2, d: 2, h: 3, hint: "rolling office chair" },
  meeting_table: { w: 8, d: 4, h: 2.5, hint: "meeting room table" },
  filing_cabinet: { w: 1.5, d: 2, h: 4, hint: "filing cabinet" },
  reception_desk: { w: 8, d: 3, h: 3.5, hint: "reception / lobby desk" },
  plant: { w: 1.5, d: 1.5, h: 4, hint: "potted indoor plant" },
  lamp: { w: 1, d: 1, h: 5, hint: "floor lamp" },
  warehouse_rack: { w: 8, d: 3, h: 8, hint: "industrial pallet rack" },
  pallet: { w: 4, d: 4, h: 0.5, hint: "wooden pallet" },
};

// Per-kind paint. Kept terse — the rendered boxes lean on saturation contrast
// to read well against the texture floor. Wood-toned items unify the warm
// palette; chrome/white items pop against it.
export const FURNITURE_COLORS: Record<FurnitureKind, string> = {
  sofa: "#7d8b9f",
  armchair: "#9b6b5c",
  coffee_table: "#5a3d28",
  tv_stand: "#2a2a30",
  bookshelf: "#6b4a2e",
  dining_table: "#6b4a2e",
  dining_chair: "#3d2818",
  bed: "#e8e1d2",
  nightstand: "#5a3d28",
  wardrobe: "#5a3d28",
  toilet: "#f4f4ef",
  sink: "#f4f4ef",
  bathtub: "#f4f4ef",
  shower: "#cdd5da",
  kitchen_island: "#3d3d44",
  stove: "#2a2a30",
  fridge: "#e8e8e8",
  kitchen_counter: "#d8cfb8",
  desk: "#5a3d28",
  office_chair: "#1f2228",
  meeting_table: "#3d2818",
  filing_cabinet: "#3a4048",
  reception_desk: "#5a3d28",
  plant: "#3a5a3a",
  lamp: "#2a2a30",
  warehouse_rack: "#5a5d62",
  pallet: "#8a6a44",
};

export type FurnitureItem = {
  kind: FurnitureKind;
  // Center of the item's footprint, in feet, building-local from front-left.
  x: number;
  z: number;
  // Yaw in degrees. 0 = default orientation. Positive = clockwise from above.
  yaw?: number;
};

// Floor finish per room — drives the colored patch under the furniture, and
// the LLM uses these labels to think about the right material per program.
export const FLOOR_TYPES = [
  "hardwood",
  "carpet",
  "tile",
  "marble",
  "concrete",
  "vinyl",
] as const;
export type FloorType = (typeof FLOOR_TYPES)[number];

export const FLOOR_COLORS: Record<FloorType, string> = {
  hardwood: "#c39a6a",
  carpet: "#a89880",
  tile: "#dcd6c8",
  marble: "#ece6d8",
  concrete: "#9a9590",
  vinyl: "#d8c8a8",
};

export type Room = {
  // Short identifier — "living", "kitchen", "bedroom_1", "bath", "lobby", etc.
  name: string;
  // Front-left corner of the room, building-local in feet.
  x: number;
  z: number;
  w: number;
  d: number;
  floor: FloorType;
};

export type InteriorPlan = {
  rooms: Room[];
  furniture: FurnitureItem[];
};

// Recommended item count given footprint in sqft. Used to keep the LLM
// from over- or under-furnishing rooms.
export function targetItemCount(wFt: number, dFt: number): {
  min: number;
  max: number;
} {
  const sqft = wFt * dFt;
  if (sqft < 400) return { min: 4, max: 8 };
  if (sqft < 900) return { min: 8, max: 14 };
  if (sqft < 1800) return { min: 12, max: 22 };
  return { min: 18, max: 32 };
}

export function interiorCacheKey(args: {
  w: number;
  d: number;
  stories: number;
  storyIndex: number;
  structureType: string;
  material: string;
  program?: string;
}): string {
  return [
    // v3: program added to the cache key — same footprint with different
    // program (e.g. school vs office) must NOT collide.
    "interior-v3",
    Math.round(args.w),
    Math.round(args.d),
    args.stories,
    args.storyIndex,
    args.structureType,
    args.material,
    args.program ?? "",
  ].join("|");
}
