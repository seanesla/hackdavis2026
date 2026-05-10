// Deterministic placement for street furniture. The AI requests a kind;
// the system picks the slot. Each prop kind has a specific allowed zone
// (front sidewalk, building back wall, lot corner, etc.) plus a footprint
// used for collision checks. No more buses-in-parking-stalls.
//
// The conventions:
//   - lot-local coords: x in [0, lot.width], z in [0, lot.depth]; z=0 is the
//     front (street) edge, z=lot.depth is the back.
//   - Streetscape sidewalk lives at z in [-8, 0]; "outside the lot proper"
//     is fine — props are still in the same coordinate space.
//   - Slots are point coordinates (x, z) representing the prop's CENTER.
//     Footprint dimensions in PROP_FOOTPRINTS are checked for collisions
//     against buildings, parking stalls, and other props.

import { rectsOverlap, type Rect } from "./geometry";
import type { SitePlan, StreetProp, StreetPropKind } from "./types";

const SNAP = 2.5;
const snap = (v: number) => Math.round(v / SNAP) * SNAP;

// Footprint dims (ft) and default yaw (degrees) per kind.
export const PROP_FOOTPRINTS: Record<
  StreetPropKind,
  { w: number; d: number }
> = {
  bench:        { w: 5, d: 2 },
  trash_can:    { w: 2, d: 2 },
  mailbox:      { w: 2, d: 2 },
  fire_hydrant: { w: 1.5, d: 1.5 },
  planter:      { w: 3, d: 3 },
  bus_stop:     { w: 8, d: 4 },
  stop_sign:    { w: 1, d: 1 },
  dumpster:     { w: 6, d: 4 },
};

// Plain-English description of where each prop goes — surfaced in the tool
// result so the AI sees what the system did.
export const PROP_ZONE_DESCRIPTION: Record<StreetPropKind, string> = {
  bench:        "front sidewalk, evenly spaced, facing the street",
  trash_can:    "behind buildings, near the back wall corners",
  mailbox:      "front lot edge, near the front-walk entry",
  fire_hydrant: "front setback strip, near the street edge",
  planter:      "flanking each building's front entrance, paired",
  bus_stop:     "front-right corner of the lot, on the sidewalk",
  stop_sign:    "front lot corners, on the curb",
  dumpster:     "behind buildings, against the back wall",
};

type Slot = { x: number; z: number; yaw: number };

// Generate candidate slots for each kind, ordered by preference. The first
// non-colliding candidate wins.
function candidatesFor(kind: StreetPropKind, plan: SitePlan): Slot[] {
  const lot = plan.lot;
  const setbacks = plan.setbacks;
  const buildings = plan.buildings ?? [];

  switch (kind) {
    case "bench": {
      // Spread evenly across the front sidewalk strip (z = -4 in lot-local).
      const slots: Slot[] = [];
      const n = 6;
      for (let i = 0; i < n; i++) {
        const x = snap(lot.width * (i + 0.5) / n);
        slots.push({ x, z: -4, yaw: 180 });
      }
      return slots;
    }

    case "fire_hydrant": {
      // Two — front-left and front-right of the front setback strip.
      const z = Math.max(2, snap(setbacks.front / 2));
      return [
        { x: 6, z, yaw: 0 },
        { x: snap(lot.width - 6), z, yaw: 0 },
      ];
    }

    case "stop_sign": {
      // Front corners on the curb (z = -1).
      return [
        { x: 0, z: -1, yaw: 90 },
        { x: lot.width, z: -1, yaw: -90 },
      ];
    }

    case "bus_stop": {
      // Front-right corner of the sidewalk. One per lot.
      return [
        { x: snap(lot.width - 16), z: -4, yaw: 180 },
        { x: snap(16), z: -4, yaw: 180 },
      ];
    }

    case "mailbox": {
      // Front lot edge, slightly off-center to leave the walkway clear.
      return [
        { x: snap(lot.width / 2 + 8), z: 2, yaw: 180 },
        { x: snap(lot.width / 2 - 8), z: 2, yaw: 180 },
      ];
    }

    case "trash_can": {
      // Behind each building, two per building (back-left + back-right).
      const slots: Slot[] = [];
      for (const b of buildings) {
        const backZ = snap(b.z + b.d + 3);
        if (backZ + 1 > lot.depth) continue;
        slots.push({ x: snap(b.x + 6), z: backZ, yaw: 0 });
        slots.push({ x: snap(b.x + b.w - 6), z: backZ, yaw: 0 });
      }
      return slots;
    }

    case "dumpster": {
      // Behind each building, centered on the back wall.
      const slots: Slot[] = [];
      for (const b of buildings) {
        const backZ = snap(b.z + b.d + 5);
        if (backZ + 2 > lot.depth) continue;
        slots.push({ x: snap(b.x + b.w / 2), z: backZ, yaw: 0 });
      }
      return slots;
    }

    case "planter": {
      // Pairs flanking each building's front entrance. Generated as pairs;
      // the placement loop will pick them in order so a single user request
      // for "planter" still gets one — but typical use is "two planters."
      const slots: Slot[] = [];
      for (const b of buildings) {
        const frontZ = snap(b.z - 4);
        if (frontZ < 0) continue;
        slots.push({ x: snap(b.x + b.w / 2 - 5), z: frontZ, yaw: 0 });
        slots.push({ x: snap(b.x + b.w / 2 + 5), z: frontZ, yaw: 0 });
      }
      return slots;
    }
  }

  return [];
}

const STALL_W = 9;
const STALL_D = 18;

function propsAsRects(props: readonly StreetProp[]): Rect[] {
  return props.map((p) => {
    const fp = PROP_FOOTPRINTS[p.kind];
    return {
      x: p.x - fp.w / 2,
      z: p.z - fp.d / 2,
      w: fp.w,
      d: fp.d,
    };
  });
}

/**
 * Find a valid slot for a prop of the given kind, considering everything
 * already on the plan. Returns null if no slot in the kind's zone is free.
 */
export function findPlacementSlot(
  plan: SitePlan,
  kind: StreetPropKind
): Slot | null {
  const fp = PROP_FOOTPRINTS[kind];
  const buildings = (plan.buildings ?? []).map((b): Rect => ({
    x: b.x,
    z: b.z,
    w: b.w,
    d: b.d,
  }));
  const stalls = (plan.parking ?? []).map((s): Rect => ({
    x: s.x,
    z: s.z,
    w: STALL_W,
    d: STALL_D,
  }));
  const propRects = propsAsRects(plan.props ?? []);

  // Pad the obstacles slightly so props don't end up flush against a wall.
  const PAD = 0.5;
  const padded = (r: Rect): Rect => ({
    x: r.x - PAD,
    z: r.z - PAD,
    w: r.w + 2 * PAD,
    d: r.d + 2 * PAD,
  });

  for (const c of candidatesFor(kind, plan)) {
    const candRect: Rect = {
      x: c.x - fp.w / 2,
      z: c.z - fp.d / 2,
      w: fp.w,
      d: fp.d,
    };
    let collides = false;
    for (const r of buildings) {
      if (rectsOverlap(candRect, padded(r))) {
        collides = true;
        break;
      }
    }
    if (collides) continue;
    for (const r of stalls) {
      if (rectsOverlap(candRect, padded(r))) {
        collides = true;
        break;
      }
    }
    if (collides) continue;
    for (const r of propRects) {
      if (rectsOverlap(candRect, r)) {
        collides = true;
        break;
      }
    }
    if (collides) continue;
    return c;
  }
  return null;
}
