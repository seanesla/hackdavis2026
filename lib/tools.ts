// 5 pure tool functions. Each takes (plan, args) and returns
// { plan, result, ok }. Tools never throw — they return ok: false with
// a result string the model can read and react to.

import {
  BUILDING_MATERIALS,
  FENCE_STYLES,
  STREET_PROPS,
  STRUCTURE_TYPES,
  TREE_SPECIES,
  WALKWAY_MATERIALS,
  type Fence,
  type FenceStyle,
  type SitePlan,
  type Building,
  type BuildingMaterial,
  type StreetProp,
  type StreetPropKind,
  type StructureType,
  type Tree,
  type TreeSpecies,
  type Walkway,
  type WalkwayMaterial,
} from "./types";
import {
  isInsideSetbacks,
  rectsOverlap,
  rectsOverlapAny,
  setbackClearances,
} from "./geometry";

export type ToolResult = {
  plan: SitePlan | null;
  result: string;
  ok: boolean;
};

export type ToolArgs = Record<string, unknown>;
export type ToolFn = (plan: SitePlan | null, args: ToolArgs) => ToolResult;

const STALL_W = 9;
const STALL_D = 18;

// ----- set_lot --------------------------------------------------------------

export const set_lot: ToolFn = (plan, args) => {
  const width = num(args.width);
  const depth = num(args.depth);
  const front = num(args.front, 0);
  const back = num(args.back, 0);
  const side = num(args.side, 0);

  if (width === null || width <= 0) {
    return fail(plan, `Lot width must be a positive number (got ${args.width}).`);
  }
  if (depth === null || depth <= 0) {
    return fail(plan, `Lot depth must be a positive number (got ${args.depth}).`);
  }
  if (front! < 0 || back! < 0 || side! < 0) {
    return fail(plan, "Setbacks cannot be negative.");
  }

  const buildableW = width - 2 * side!;
  const buildableD = depth - front! - back!;
  if (buildableW <= 0 || buildableD <= 0) {
    return fail(
      plan,
      `Setbacks (front ${front}, back ${back}, side ${side}) leave no buildable area on a ${width}x${depth} ft lot.`
    );
  }

  // Re-set lot wipes any previous buildings/parking.
  const next: SitePlan = {
    lot: { width, depth },
    setbacks: { front: front!, back: back!, side: side! },
  };
  return ok(
    next,
    `Lot set to ${width}x${depth} ft. Buildable area after setbacks: ${buildableW}x${buildableD} ft (x in [${side}, ${width - side!}], z in [${front}, ${depth - back!}]).`
  );
};

// ----- place_building (APPENDS to buildings array) --------------------------

export const place_building: ToolFn = (plan, args) => {
  if (!plan) return fail(plan, "Lot not set. Call set_lot first.");

  const x = num(args.x);
  const z = num(args.z);
  const w = num(args.w);
  const d = num(args.d);
  const stories = num(args.stories);
  const rawMaterial = typeof args.material === "string" ? args.material.toLowerCase() : null;
  const material: BuildingMaterial | undefined =
    rawMaterial && (BUILDING_MATERIALS as readonly string[]).includes(rawMaterial)
      ? (rawMaterial as BuildingMaterial)
      : undefined;

  if (rawMaterial && !material) {
    return fail(
      plan,
      `Unknown material "${args.material}". Allowed: ${BUILDING_MATERIALS.join(", ")}.`
    );
  }

  const rawStructure = typeof args.structure_type === "string"
    ? args.structure_type.toLowerCase()
    : null;
  const structure_type: StructureType | undefined =
    rawStructure && (STRUCTURE_TYPES as readonly string[]).includes(rawStructure)
      ? (rawStructure as StructureType)
      : undefined;

  if (rawStructure && !structure_type) {
    return fail(
      plan,
      `Unknown structure_type "${args.structure_type}". Allowed: ${STRUCTURE_TYPES.join(", ")}.`
    );
  }

  if (x === null || z === null || w === null || d === null || stories === null) {
    return fail(plan, "place_building requires numeric x, z, w, d, stories.");
  }
  if (w <= 0 || d <= 0) {
    return fail(plan, `Building dimensions must be positive (got ${w}x${d}).`);
  }
  if (stories <= 0 || !Number.isInteger(stories)) {
    return fail(plan, `Stories must be a positive integer (got ${stories}).`);
  }
  if (x < 0 || z < 0 || x + w > plan.lot.width || z + d > plan.lot.depth) {
    return fail(
      plan,
      `Building extends outside lot. Lot is ${plan.lot.width}x${plan.lot.depth}, building footprint at (${x}, ${z}) sized ${w}x${d}.`
    );
  }

  const newBuilding: Building = {
    x,
    z,
    w,
    d,
    stories,
    ...(material ? { material } : {}),
    ...(structure_type ? { structure_type } : {}),
  };
  const existing = plan.buildings ?? [];
  if (rectsOverlapAny(newBuilding, existing)) {
    const which = existing.findIndex((b) => rectsOverlap(newBuilding, b));
    return fail(
      plan,
      `Building footprint at (${x}, ${z}) ${w}x${d} overlaps building #${which + 1} at (${existing[which].x}, ${existing[which].z}) ${existing[which].w}x${existing[which].d}. Move it apart and try again.`
    );
  }

  // Adding a new building invalidates any prior parking layout.
  const next: SitePlan = {
    ...plan,
    buildings: [...existing, newBuilding],
    parking: undefined,
  };
  const idx = next.buildings!.length;
  return ok(
    next,
    `Placed building #${idx}: ${w}x${d} ft, ${stories}-story${structure_type ? ` ${structure_type}` : ""}${material ? `, ${material}` : ""}, front-left corner at (${x}, ${z}). Footprint x in [${x}, ${x + w}], z in [${z}, ${z + d}]. Total buildings now: ${idx}.`
  );
};

// ----- check_setbacks -------------------------------------------------------

export const check_setbacks: ToolFn = (plan) => {
  if (!plan) return fail(plan, "Lot not set. Call set_lot first.");
  const buildings = plan.buildings ?? [];
  if (buildings.length === 0) {
    return fail(plan, "No buildings placed yet. Call place_building first.");
  }

  const issues: string[] = [];
  buildings.forEach((b, i) => {
    const c = setbackClearances(b, plan.lot, plan.setbacks);
    const sub: string[] = [];
    if (c.front < 0) sub.push(`front short by ${(-c.front).toFixed(1)}ft`);
    if (c.back < 0) sub.push(`back short by ${(-c.back).toFixed(1)}ft`);
    if (c.left < 0) sub.push(`left short by ${(-c.left).toFixed(1)}ft`);
    if (c.right < 0) sub.push(`right short by ${(-c.right).toFixed(1)}ft`);
    if (sub.length) issues.push(`building #${i + 1}: ${sub.join(", ")}`);
  });

  if (issues.length) {
    return fail(
      plan,
      `Setback violations — ${issues.join("; ")}. Required: front ${plan.setbacks.front}, back ${plan.setbacks.back}, side ${plan.setbacks.side}. Re-place the offending building(s) inward and re-check.`
    );
  }
  return ok(
    plan,
    `All ${buildings.length} building${buildings.length === 1 ? "" : "s"} inside setbacks.`
  );
};

// ----- place_parking --------------------------------------------------------

export const place_parking: ToolFn = (plan, args) => {
  if (!plan) return fail(plan, "Lot not set. Call set_lot first.");

  const requested = num(args.count);
  if (requested === null || requested <= 0 || !Number.isInteger(requested)) {
    return fail(plan, `count must be a positive integer (got ${args.count}).`);
  }

  const minX = plan.setbacks.side;
  const maxX = plan.lot.width - plan.setbacks.side;
  const minZ = plan.setbacks.front;
  const maxZ = plan.lot.depth - plan.setbacks.back;

  if (maxX - minX < STALL_W || maxZ - minZ < STALL_D) {
    return fail(
      plan,
      "Buildable envelope too small for any 9x18 ft parking stall after setbacks."
    );
  }

  const buildings = plan.buildings ?? [];
  const stalls: { x: number; z: number }[] = [];
  let blocked = 0;
  let rowsUsed = 0;

  // Greedy multi-row pack: scan rows back-to-front (closest to back setback
  // first), columns left-to-right within each row. Stalls (9x18 ft) abut
  // edge-to-edge — no drive-aisle modeling, matching the simplified visual
  // style elsewhere. Cells that overlap any building are skipped, so the
  // packer naturally fills side strips next to the building when the
  // requested count exceeds a single row.
  for (let z = maxZ - STALL_D; z >= minZ - 1e-6; z -= STALL_D) {
    let placedThisRow = 0;
    for (let x = minX; x + STALL_W <= maxX + 1e-6; x += STALL_W) {
      if (stalls.length >= requested) break;
      const stallRect = { x, z, w: STALL_W, d: STALL_D };
      if (rectsOverlapAny(stallRect, buildings)) {
        blocked++;
        continue;
      }
      stalls.push({ x, z });
      placedThisRow++;
    }
    if (placedThisRow > 0) rowsUsed++;
    if (stalls.length >= requested) break;
  }

  const next: SitePlan = { ...plan, parking: stalls };
  if (stalls.length === 0) {
    return fail(
      next,
      `Could not place any stalls — buildings fill the buildable envelope (${blocked} candidates blocked).`
    );
  }
  if (stalls.length < requested) {
    const shortBy = requested - stalls.length;
    return ok(
      next,
      `Fit ${stalls.length} of ${requested} requested stalls across ${rowsUsed} row${rowsUsed === 1 ? "" : "s"} (greedy back-to-front, left-to-right; ${blocked} cells blocked by buildings). No more 9x18 ft cells available within setbacks; cannot fit ${shortBy} more.`
    );
  }
  return ok(
    next,
    `Placed ${stalls.length} stalls across ${rowsUsed} row${rowsUsed === 1 ? "" : "s"}, each 9x18 ft, packed back-to-front and avoiding building footprints.`
  );
};

// ----- place_trees ----------------------------------------------------------

// Per-species canopy radius coefficient. Multiplied by tree height. Matches
// the renderer (oak/maple = sphere canopy, pine = cone, palm = thin fronds).
const CANOPY_R: Record<TreeSpecies, number> = {
  oak: 0.42,
  maple: 0.4,
  pine: 0.3,
  palm: 0.16,
};
// Extra clearance beyond canopy radius — leaves shouldn't graze a wall.
const TREE_CLEARANCE = 2;

function distPointToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-6) return Math.hypot(px - ax, pz - az);
  let t = ((px - ax) * dx + (pz - az) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

export const place_trees: ToolFn = (plan, args) => {
  if (!plan) return fail(plan, "Lot not set. Call set_lot first.");

  const count = num(args.count);
  if (count === null || count <= 0 || !Number.isInteger(count)) {
    return fail(plan, `count must be a positive integer (got ${args.count}).`);
  }

  const placementRaw =
    typeof args.placement === "string" ? args.placement.toLowerCase() : "perimeter";
  const allowedPlacements = [
    "perimeter",
    "front",
    "back",
    "left",
    "right",
    "scattered",
  ] as const;
  if (!(allowedPlacements as readonly string[]).includes(placementRaw)) {
    return fail(
      plan,
      `Unknown placement "${args.placement}". Allowed: ${allowedPlacements.join(", ")}.`
    );
  }
  const placement = placementRaw as (typeof allowedPlacements)[number];

  const speciesRaw =
    typeof args.species === "string" ? args.species.toLowerCase() : "oak";
  if (!(TREE_SPECIES as readonly string[]).includes(speciesRaw)) {
    return fail(
      plan,
      `Unknown species "${args.species}". Allowed: ${TREE_SPECIES.join(", ")}.`
    );
  }
  const species = speciesRaw as TreeSpecies;

  const heightArg = num(args.height);
  const defaultHeight =
    species === "palm" ? 28 : species === "pine" ? 32 : species === "maple" ? 22 : 24;
  const height = heightArg !== null && heightArg > 0 ? heightArg : defaultHeight;

  // Sample candidate positions, then filter against buildings + lot edges.
  const buildings = plan.buildings ?? [];
  const trunkR = 1.2;

  // Effective inset depends on whether the chosen side is already fenced.
  // Without a fence, 6ft is enough; with a fence (especially a hedge ~3.5ft
  // thick), the candidate row needs to sit canopy + buffer farther in or
  // every candidate gets rejected.
  const canopyR = CANOPY_R[species] * height;
  const baseInset = 6;
  const fencedSet = new Set<string>();
  for (const f of plan.fences ?? []) for (const s of f.sides) fencedSet.add(s);
  const insetFor = (side: "front" | "back" | "left" | "right"): number =>
    fencedSet.has(side)
      ? canopyR + TREE_CLEARANCE + 4 + 1 // fence buffer + a hair
      : baseInset;

  const margin = 4; // keep off the absolute lot edge
  const xMin = margin;
  const xMax = plan.lot.width - margin;
  const zMin = margin;
  const zMax = plan.lot.depth - margin;

  const candidates: { x: number; z: number }[] = [];
  if (placement === "perimeter") {
    // Use the fenced-side inset on each side so perimeter trees clear hedges.
    const px0 = insetFor("left");
    const px1 = plan.lot.width - insetFor("right");
    const pz0 = insetFor("front");
    const pz1 = plan.lot.depth - insetFor("back");
    const perim = 2 * (px1 - px0) + 2 * (pz1 - pz0);
    const spacing = Math.max(canopyR * 2.2, 12, perim / Math.max(count * 1.5, 6));
    let dist = 0;
    while (dist < perim) {
      const p = perimPoint(dist, px0, px1, pz0, pz1);
      candidates.push(p);
      dist += spacing;
    }
  } else if (placement === "scattered") {
    // Deterministic pseudo-random: golden-angle sampling inside the lot.
    const seedOffset = (plan.trees?.length ?? 0) * 7.31;
    for (let i = 0; i < count * 6; i++) {
      const t = i + seedOffset;
      const u = (Math.sin(t * 12.9898) * 43758.5453) % 1;
      const v = (Math.sin(t * 78.233) * 12345.6789) % 1;
      const x = xMin + ((u + 1) % 1) * (xMax - xMin);
      const z = zMin + ((v + 1) % 1) * (zMax - zMin);
      candidates.push({ x, z });
    }
  } else {
    // front / back / left / right — single line of trees, inset adjusted for
    // any fence on that side.
    if (placement === "front") {
      const z = insetFor("front");
      for (let i = 0; i < count * 2; i++) {
        const t = (i + 0.5) / (count * 2);
        candidates.push({ x: xMin + t * (xMax - xMin), z });
      }
    } else if (placement === "back") {
      const z = plan.lot.depth - insetFor("back");
      for (let i = 0; i < count * 2; i++) {
        const t = (i + 0.5) / (count * 2);
        candidates.push({ x: xMin + t * (xMax - xMin), z });
      }
    } else if (placement === "left") {
      const x = insetFor("left");
      for (let i = 0; i < count * 2; i++) {
        const t = (i + 0.5) / (count * 2);
        candidates.push({ x, z: zMin + t * (zMax - zMin) });
      }
    } else {
      const x = plan.lot.width - insetFor("right");
      for (let i = 0; i < count * 2; i++) {
        const t = (i + 0.5) / (count * 2);
        candidates.push({ x, z: zMin + t * (zMax - zMin) });
      }
    }
  }

  // Treat each tree as a circle of radius (canopy + clearance). It must not
  // intrude into any building, parking stall, walkway, or fenced side. Also
  // enforce min separation from other already-placed trees so they don't
  // overlap each other.
  const treeR = canopyR + TREE_CLEARANCE;
  const stalls = plan.parking ?? [];
  const walkways = plan.walkways ?? [];
  const fences = plan.fences ?? [];

  // Aggregate all fenced sides (later fence segments override but every
  // present side counts as "fenced" for tree avoidance).
  const fencedSides = new Set<"front" | "back" | "left" | "right">();
  for (const f of fences) for (const s of f.sides) fencedSides.add(s);
  const FENCE_BUFFER = 4; // hedge thickness ~3.5ft, plus a little air

  const placed: Tree[] = [];
  const minSep = Math.max(canopyR * 1.5, 10);

  // Distance from a circle center to the nearest edge of a rect — negative
  // (penetration) if the center is inside.
  const distToRect = (
    cx: number,
    cz: number,
    rx: number,
    rz: number,
    rw: number,
    rd: number
  ): number => {
    const dx = Math.max(rx - cx, 0, cx - (rx + rw));
    const dz = Math.max(rz - cz, 0, cz - (rz + rd));
    return Math.hypot(dx, dz);
  };

  for (const c of candidates) {
    if (placed.length >= count) break;

    // Canopy must clear all buildings.
    let blocked = false;
    for (const b of buildings) {
      if (distToRect(c.x, c.z, b.x, b.z, b.w, b.d) < treeR) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    // Clear of parking stalls.
    for (const s of stalls) {
      if (distToRect(c.x, c.z, s.x, s.z, STALL_W, STALL_D) < treeR) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    // Clear of walkways (treat as line segments with width).
    for (const w of walkways) {
      const d = distPointToSegment(c.x, c.z, w.x1, w.z1, w.x2, w.z2);
      if (d < treeR + w.width / 2) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    // Clear of any fenced side of the lot. The fence sits ~2ft from the lot
    // edge; require canopyR + FENCE_BUFFER between trunk and the fence line.
    if (fencedSides.has("front") && c.z < treeR + FENCE_BUFFER) continue;
    if (fencedSides.has("back") && c.z > plan.lot.depth - treeR - FENCE_BUFFER) continue;
    if (fencedSides.has("left") && c.x < treeR + FENCE_BUFFER) continue;
    if (fencedSides.has("right") && c.x > plan.lot.width - treeR - FENCE_BUFFER) continue;

    // Don't crowd already-placed trees.
    const tooCloseToOther = placed.some(
      (t) => Math.hypot(t.x - c.x, t.z - c.z) < minSep
    );
    if (tooCloseToOther) continue;

    placed.push({ x: c.x, z: c.z, species, height });
  }

  if (placed.length === 0) {
    return fail(
      plan,
      `Could not place any trees with placement="${placement}" — lot too crowded by buildings.`
    );
  }

  const next: SitePlan = {
    ...plan,
    trees: [...(plan.trees ?? []), ...placed],
  };
  if (placed.length < count) {
    return ok(
      next,
      `Placed ${placed.length} of ${count} requested ${species} trees (${placement}). Could not fit ${count - placed.length} more — buildings or spacing constraints. Trunk radius ~${trunkR}ft.`
    );
  }
  return ok(
    next,
    `Placed ${placed.length} ${species} trees (${placement}). Each ~${height}ft tall.`
  );
};

function perimPoint(
  dist: number,
  xMin: number,
  xMax: number,
  zMin: number,
  zMax: number
): { x: number; z: number } {
  const W = xMax - xMin;
  const D = zMax - zMin;
  if (dist < W) return { x: xMin + dist, z: zMin };
  dist -= W;
  if (dist < D) return { x: xMax, z: zMin + dist };
  dist -= D;
  if (dist < W) return { x: xMax - dist, z: zMax };
  dist -= W;
  return { x: xMin, z: zMax - Math.min(dist, D) };
}

// ----- place_walkway --------------------------------------------------------

// Renderer always paints the front entrance at the center of the building's
// south face: world position (building.x + building.w/2, building.z). When the
// agent aims a walkway endpoint near that face, snap it to the door so the
// path actually meets the entrance instead of landing a few feet off-axis.
function snapToEntrance(
  ex: number,
  ez: number,
  buildings: readonly Building[]
): { x: number; z: number; index: number | null } {
  let best: { idx: number; centerX: number; frontZ: number; score: number } | null =
    null;
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    const centerX = b.x + b.w / 2;
    const dx = Math.abs(ex - centerX);
    const dz = ez - b.z; // negative = in front of building (toward street)
    // Acceptance zone: within half the building's width laterally, and from
    // 8 ft outside the front face to 2 ft past it.
    if (dx > b.w * 0.5) continue;
    if (dz < -8 || dz > 2) continue;
    const score = dx + Math.abs(dz);
    if (!best || score < best.score) {
      best = { idx: i, centerX, frontZ: b.z, score };
    }
  }
  if (!best) return { x: ex, z: ez, index: null };
  return { x: best.centerX, z: best.frontZ, index: best.idx };
}

export const place_walkway: ToolFn = (plan, args) => {
  if (!plan) return fail(plan, "Lot not set. Call set_lot first.");

  const x1 = num(args.x1);
  const z1 = num(args.z1);
  const x2 = num(args.x2);
  const z2 = num(args.z2);
  if (x1 === null || z1 === null || x2 === null || z2 === null) {
    return fail(plan, "place_walkway requires numeric x1, z1, x2, z2.");
  }
  const width = num(args.width, 6) ?? 6;
  if (width <= 0) {
    return fail(plan, `Walkway width must be positive (got ${width}).`);
  }

  const matRaw =
    typeof args.material === "string" ? args.material.toLowerCase() : "flagstone";
  if (!(WALKWAY_MATERIALS as readonly string[]).includes(matRaw)) {
    return fail(
      plan,
      `Unknown walkway material "${args.material}". Allowed: ${WALKWAY_MATERIALS.join(", ")}.`
    );
  }
  const material = matRaw as WalkwayMaterial;

  const inLot = (x: number, z: number) =>
    x >= 0 && z >= 0 && x <= plan.lot.width && z <= plan.lot.depth;
  if (!inLot(x1, z1) || !inLot(x2, z2)) {
    return fail(
      plan,
      `Walkway endpoint outside lot (lot is ${plan.lot.width}x${plan.lot.depth}).`
    );
  }

  // Coordinate the walkway with each building's front entrance. Endpoint that
  // lands near a south face → snap to (building.x + w/2, building.z). If only
  // one end snaps to a door and the other sits on the lot's front edge, align
  // it perpendicularly so the path runs straight from street to door.
  const buildings = plan.buildings ?? [];
  const s1 = snapToEntrance(x1, z1, buildings);
  const s2 = snapToEntrance(x2, z2, buildings);
  let nx1 = s1.x;
  let nz1 = s1.z;
  let nx2 = s2.x;
  let nz2 = s2.z;
  const STREET_EDGE_TOL = 6;
  if (s1.index !== null && s2.index === null) {
    if (nz2 <= STREET_EDGE_TOL || nz2 >= plan.lot.depth - STREET_EDGE_TOL) {
      nx2 = nx1;
    }
  } else if (s2.index !== null && s1.index === null) {
    if (nz1 <= STREET_EDGE_TOL || nz1 >= plan.lot.depth - STREET_EDGE_TOL) {
      nx1 = nx2;
    }
  }
  const snapped =
    nx1 !== x1 || nz1 !== z1 || nx2 !== x2 || nz2 !== z2;

  const len = Math.hypot(nx2 - nx1, nz2 - nz1);
  if (len < 1) {
    return fail(plan, "Walkway endpoints are essentially the same point.");
  }

  const w: Walkway = {
    x1: nx1,
    z1: nz1,
    x2: nx2,
    z2: nz2,
    width,
    material,
  };
  const next: SitePlan = { ...plan, walkways: [...(plan.walkways ?? []), w] };
  const snapNote = snapped
    ? ` Aligned to building #${(s1.index ?? s2.index ?? 0) + 1}'s front entrance.`
    : "";
  return ok(
    next,
    `Placed ${material} walkway from (${nx1},${nz1}) to (${nx2},${nz2}), width ${width}ft, length ~${len.toFixed(1)}ft.${snapNote}`
  );
};

// ----- place_fence ----------------------------------------------------------

export const place_fence: ToolFn = (plan, args) => {
  if (!plan) return fail(plan, "Lot not set. Call set_lot first.");

  const allowedSides = ["front", "back", "left", "right"] as const;
  type Side = (typeof allowedSides)[number];

  let sides: Side[];
  if (args.sides === "all" || args.sides === "perimeter") {
    sides = [...allowedSides];
  } else if (Array.isArray(args.sides)) {
    const lowered = args.sides.map((s) =>
      typeof s === "string" ? s.toLowerCase() : ""
    );
    const bad = lowered.find(
      (s) => !(allowedSides as readonly string[]).includes(s)
    );
    if (bad !== undefined) {
      return fail(
        plan,
        `Unknown fence side "${bad}". Allowed: ${allowedSides.join(", ")}, or "all".`
      );
    }
    sides = lowered as Side[];
  } else {
    return fail(
      plan,
      `place_fence sides must be "all" or an array of sides (${allowedSides.join(", ")}).`
    );
  }
  if (sides.length === 0) {
    return fail(plan, "place_fence sides cannot be empty.");
  }

  const styleRaw =
    typeof args.style === "string" ? args.style.toLowerCase() : "wood";
  // Accept "wrought iron" with a space too.
  const styleNorm = styleRaw.replace(/\s+/g, "-");
  if (!(FENCE_STYLES as readonly string[]).includes(styleNorm)) {
    return fail(
      plan,
      `Unknown fence style "${args.style}". Allowed: ${FENCE_STYLES.join(", ")}.`
    );
  }
  const style = styleNorm as FenceStyle;

  // Dedup sides preserving order.
  const seen = new Set<Side>();
  const dedup: Side[] = [];
  for (const s of sides) {
    if (!seen.has(s)) {
      seen.add(s);
      dedup.push(s);
    }
  }

  const newFence: Fence = { sides: dedup, style };
  const newSet = new Set<Side>(dedup);
  // Later calls win on overlapping sides. Strip any side that the new segment
  // covers from prior fences; drop fences whose sides become empty.
  const prior = (plan.fences ?? [])
    .map((f) => ({
      ...f,
      sides: f.sides.filter((s) => !newSet.has(s)),
    }))
    .filter((f) => f.sides.length > 0);
  const next: SitePlan = { ...plan, fences: [...prior, newFence] };
  return ok(
    next,
    `Set ${style} fence on ${dedup.join(", ")}.`
  );
};

// ----- place_street_furniture (APPENDS to props array) ---------------------

export const place_street_furniture: ToolFn = (plan, args) => {
  if (!plan) return fail(plan, "Lot not set. Call set_lot first.");

  const x = num(args.x);
  const z = num(args.z);
  const yaw = num(args.yaw, 0);
  const rawKind =
    typeof args.kind === "string" ? args.kind.toLowerCase() : null;

  if (!rawKind || !(STREET_PROPS as readonly string[]).includes(rawKind)) {
    return fail(
      plan,
      `kind must be one of: ${STREET_PROPS.join(", ")} (got "${args.kind}").`
    );
  }
  if (x === null || z === null) {
    return fail(plan, "place_street_furniture requires numeric x, z.");
  }
  if (x < 0 || x > plan.lot.width || z < 0 || z > plan.lot.depth) {
    return fail(
      plan,
      `Position (${x}, ${z}) is outside lot ${plan.lot.width}×${plan.lot.depth}.`
    );
  }

  const prop: StreetProp = {
    kind: rawKind as StreetPropKind,
    x,
    z,
    ...(yaw ? { yaw: yaw! } : {}),
  };
  const next: SitePlan = {
    ...plan,
    props: [...(plan.props ?? []), prop],
  };
  return ok(
    next,
    `Placed ${rawKind} at (${x}, ${z})${yaw ? ` rotated ${yaw}°` : ""}.`
  );
};

// ----- finalize -------------------------------------------------------------

export const finalize: ToolFn = (plan) => {
  if (!plan) return fail(plan, "Cannot finalize: no lot set.");
  const buildings = plan.buildings ?? [];
  if (buildings.length === 0) {
    return fail(plan, "Cannot finalize: no buildings placed.");
  }
  for (let i = 0; i < buildings.length; i++) {
    if (!isInsideSetbacks(buildings[i], plan.lot, plan.setbacks)) {
      return fail(
        plan,
        `Cannot finalize: building #${i + 1} violates setbacks. Reposition it inside the buildable envelope and re-check.`
      );
    }
  }
  return ok(
    plan,
    `Plan finalized. ${buildings.length} building${buildings.length === 1 ? "" : "s"} validated.`
  );
};

// ----- Registry -------------------------------------------------------------

export const TOOLS: Record<string, ToolFn> = {
  set_lot,
  place_building,
  check_setbacks,
  place_parking,
  place_trees,
  place_walkway,
  place_fence,
  place_street_furniture,
  finalize,
};

// ----- Helpers --------------------------------------------------------------

function num(v: unknown, fallback?: number): number | null {
  if (v === undefined || v === null || v === "") {
    return fallback ?? null;
  }
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function ok(plan: SitePlan | null, result: string): ToolResult {
  return { plan, result, ok: true };
}

function fail(plan: SitePlan | null, result: string): ToolResult {
  return { plan, result, ok: false };
}
