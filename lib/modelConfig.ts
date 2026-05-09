// Per-model calibration. Drop a GLTF into public/models/ at the path below
// and the renderer will use it instead of the procedural fallback.
//
// Currently wired for Quaternius "City" pack. Each model is auto-scaled to
// its target dimension on load (height for trees, length for cars), so any
// pack works without manual unit conversion.

import type { StreetPropKind, TreeSpecies } from "./types";

export type ModelEntry = {
  url: string;
  // Extra Y rotation applied after auto-scale (radians). Use this if the
  // model's "front" doesn't match the conventional +Z direction.
  rotateY?: number;
  // Multiplier applied to the auto-derived scale (1 = exact target dim).
  // Bump if a pack's foliage looks too sparse, or shrink if too chunky.
  scaleBoost?: number;
};

// Quaternius City ships a single Tree.glb; all four species reuse it.
// Per-tree yaw + size jitter (in TreeMesh) keeps a row from looking cloned.
const TREE = "/models/Tree.glb";
export const TREE_MODELS: Record<TreeSpecies, ModelEntry> = {
  oak:   { url: TREE },
  pine:  { url: TREE },
  palm:  { url: TREE },
  maple: { url: TREE },
};

// Vehicle palette — picked deterministically per stall so a parking row gets
// a believable mix of sedans, SUVs, vans, and the occasional cop car.
// Spaces in filenames are URL-encoded as %20.
export const CAR_MODELS: ModelEntry[] = [
  { url: "/models/Car.glb" },
  { url: "/models/Car-unqqkULtRU.glb" },
  { url: "/models/Sports%20Car.glb" },
  { url: "/models/Sports%20Car-Gzj704DXdr.glb" },
  { url: "/models/SUV.glb" },
  { url: "/models/Van.glb" },
  { url: "/models/Pickup%20Truck.glb" },
  { url: "/models/Police%20Car.glb" },
];

export const TARGET_CAR_LENGTH_FT = 14;

// Fence model used for wood and wrought-iron styles. Tiled along each side
// of the lot. Hedge stays procedural because the pack has no hedge model.
export const FENCE_MODEL: ModelEntry = {
  url: "/models/Fence.glb",
};

export const TARGET_FENCE_HEIGHT_FT = 5;

// Street furniture / props. Each entry pairs a GLB with a target height in feet
// so the auto-scaler renders them at a believable real-world size relative to
// buildings and cars. Filenames with spaces are URL-encoded as %20.
export type PropEntry = ModelEntry & { targetHeightFt: number };

export const PROP_MODELS: Record<StreetPropKind, PropEntry> = {
  bench:        { url: "/models/Bench.glb",                  targetHeightFt: 3.0 },
  trash_can:    { url: "/models/Trash%20Can.glb",            targetHeightFt: 3.0 },
  mailbox:      { url: "/models/Mailbox.glb",                targetHeightFt: 4.0 },
  fire_hydrant: { url: "/models/Fire%20hydrant.glb",         targetHeightFt: 3.0 },
  planter:      { url: "/models/Planter%20%26%20Bushes.glb", targetHeightFt: 3.5 },
  bus_stop:     { url: "/models/Bus%20Stop.glb",             targetHeightFt: 8.0 },
  stop_sign:    { url: "/models/Stop%20sign.glb",            targetHeightFt: 7.0 },
  dumpster:     { url: "/models/Dumpster.glb",               targetHeightFt: 4.5 },
};

