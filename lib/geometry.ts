// Pure geometry helpers shared by tools (server) and renderer (client).
// All values in feet. Coordinates: front-left corner of lot is origin.

import type { SitePlan } from "./types";

export type Rect = { x: number; z: number; w: number; d: number };

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return !(
    a.x + a.w <= b.x ||
    b.x + b.w <= a.x ||
    a.z + a.d <= b.z ||
    b.z + b.d <= a.z
  );
}

export function rectsOverlapAny(a: Rect, others: readonly Rect[]): boolean {
  for (const o of others) {
    if (rectsOverlap(a, o)) return true;
  }
  return false;
}

export function isInsideSetbacks(
  b: Rect,
  lot: SitePlan["lot"],
  s: SitePlan["setbacks"]
): boolean {
  return (
    b.x >= s.side &&
    b.z >= s.front &&
    b.x + b.w <= lot.width - s.side &&
    b.z + b.d <= lot.depth - s.back
  );
}

export function isBuildable(
  lot: SitePlan["lot"],
  s: SitePlan["setbacks"]
): boolean {
  return lot.width - 2 * s.side > 0 && lot.depth - s.front - s.back > 0;
}

// Signed clearance from each setback line. Positive = inside, negative = past.
export function setbackClearances(
  b: Rect,
  lot: SitePlan["lot"],
  s: SitePlan["setbacks"]
) {
  return {
    front: b.z - s.front,
    back: lot.depth - s.back - (b.z + b.d),
    left: b.x - s.side,
    right: lot.width - s.side - (b.x + b.w),
  };
}
