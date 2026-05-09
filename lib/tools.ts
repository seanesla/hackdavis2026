// 5 pure tool functions. Each takes (plan, args) and returns
// { plan, result, ok }. Tools never throw — they return ok: false with
// a result string the model can read and react to.

import type { SitePlan } from "./types";
import {
  isInsideSetbacks,
  rectsOverlap,
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

  // Re-set lot wipes any previous building/parking.
  const next: SitePlan = {
    lot: { width, depth },
    setbacks: { front: front!, back: back!, side: side! },
  };
  return ok(
    next,
    `Lot set to ${width}x${depth} ft. Buildable area after setbacks: ${buildableW}x${buildableD} ft (x in [${side}, ${width - side!}], z in [${front}, ${depth - back!}]).`
  );
};

// ----- place_building -------------------------------------------------------

export const place_building: ToolFn = (plan, args) => {
  if (!plan) return fail(plan, "Lot not set. Call set_lot first.");

  const x = num(args.x);
  const z = num(args.z);
  const w = num(args.w);
  const d = num(args.d);
  const stories = num(args.stories);

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

  // Replace building, drop stale parking that may now overlap.
  const next: SitePlan = {
    ...plan,
    building: { x, z, w, d, stories },
    parking: undefined,
  };
  return ok(
    next,
    `Placed ${w}x${d} ft, ${stories}-story building with front-left corner at (${x}, ${z}). Footprint occupies x in [${x}, ${x + w}], z in [${z}, ${z + d}].`
  );
};

// ----- check_setbacks -------------------------------------------------------

export const check_setbacks: ToolFn = (plan) => {
  if (!plan) return fail(plan, "Lot not set. Call set_lot first.");
  if (!plan.building) {
    return fail(plan, "No building placed yet. Call place_building first.");
  }

  const c = setbackClearances(plan.building, plan.lot, plan.setbacks);
  const issues: string[] = [];
  if (c.front < 0) issues.push(`front short by ${(-c.front).toFixed(1)}ft`);
  if (c.back < 0) issues.push(`back short by ${(-c.back).toFixed(1)}ft`);
  if (c.left < 0) issues.push(`left side short by ${(-c.left).toFixed(1)}ft`);
  if (c.right < 0) issues.push(`right side short by ${(-c.right).toFixed(1)}ft`);

  if (issues.length > 0) {
    return fail(
      plan,
      `Building violates setbacks: ${issues.join("; ")}. Required: front ${plan.setbacks.front}, back ${plan.setbacks.back}, side ${plan.setbacks.side}. Move the building inward and re-check.`
    );
  }
  return ok(
    plan,
    `Building inside all setbacks. Clearances: front ${c.front.toFixed(1)}ft, back ${c.back.toFixed(1)}ft, left ${c.left.toFixed(1)}ft, right ${c.right.toFixed(1)}ft.`
  );
};

// ----- place_parking --------------------------------------------------------

export const place_parking: ToolFn = (plan, args) => {
  if (!plan) return fail(plan, "Lot not set. Call set_lot first.");

  const requested = num(args.count);
  if (requested === null || requested <= 0 || !Number.isInteger(requested)) {
    return fail(plan, `count must be a positive integer (got ${args.count}).`);
  }

  // Pack a single row along the back of the lot, just inside the back setback.
  const z = plan.lot.depth - plan.setbacks.back - STALL_D;
  if (z < plan.setbacks.front) {
    return fail(plan, "Lot too shallow for parking after setbacks.");
  }

  const minX = plan.setbacks.side;
  const maxX = plan.lot.width - plan.setbacks.side;

  const stalls: { x: number; z: number }[] = [];
  let x = minX;
  let skipped = 0;
  while (x + STALL_W <= maxX && stalls.length < requested) {
    const stallRect = { x, z, w: STALL_W, d: STALL_D };
    const overlapsBuilding =
      plan.building && rectsOverlap(stallRect, plan.building);
    if (!overlapsBuilding) {
      stalls.push({ x, z });
    } else {
      skipped++;
    }
    x += STALL_W;
  }

  const next: SitePlan = { ...plan, parking: stalls };
  if (stalls.length === 0) {
    return fail(
      next,
      `Could not place any stalls in the back row (${skipped} blocked by building). Try a smaller building footprint or a deeper lot.`
    );
  }
  if (stalls.length < requested) {
    const shortBy = requested - stalls.length;
    return ok(
      next,
      `Fit ${stalls.length} of ${requested} requested stalls in a single row along the back (each 9x18 ft). Lot too narrow for ${shortBy} more.`
    );
  }
  return ok(
    next,
    `Placed ${stalls.length} stalls in a single row along the back, each 9x18 ft.`
  );
};

// ----- finalize -------------------------------------------------------------

export const finalize: ToolFn = (plan) => {
  if (!plan) return fail(plan, "Cannot finalize: no lot set.");
  if (!plan.building) return fail(plan, "Cannot finalize: no building placed.");
  if (!isInsideSetbacks(plan.building, plan.lot, plan.setbacks)) {
    return fail(
      plan,
      "Cannot finalize: building violates setbacks. Reposition the building inside the buildable envelope and re-check."
    );
  }
  return ok(plan, "Plan finalized and validated.");
};

// ----- Registry -------------------------------------------------------------

export const TOOLS: Record<string, ToolFn> = {
  set_lot,
  place_building,
  check_setbacks,
  place_parking,
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
