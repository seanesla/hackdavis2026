// Transparency receipt — maps a generated SitePlan back against what the
// user actually said in their brief, so the panel can show "you asked for
// X, AI filled in Y" instead of grading AI-invented details against pro
// standards. Pure heuristics, runs in-memory.
//
// The parser is deliberately forgiving: it looks for common patterns
// ("0.5 acre", "2-story", "12 parking spots") and ignores anything it
// doesn't recognize. False negatives (treating a stated fact as AI-filled)
// are far better than false positives — the worst case is the receipt
// over-credits the AI, which still feels honest.

import type { SitePlan } from "./types";

export type ReceiptEntry = {
  label: string;
  value: string;
  // Optional caveat / source note shown below the value.
  note?: string;
};

export type Receipt = {
  // Things the user explicitly stated in their prompt.
  user: ReceiptEntry[];
  // Things the AI invented to make the plan render.
  ai: ReceiptEntry[];
};

type Brief = {
  lotAcres?: number;
  lotW?: number;
  lotD?: number;
  setbackFront?: number;
  setbackBack?: number;
  setbackSide?: number;
  stories?: number;
  parking?: number;
  noParking?: boolean;
  trees?: boolean;
  noTrees?: boolean;
  fence?: boolean;
  pool?: boolean;
  walkway?: boolean;
  material?: string;
  structureKind?: string;
};

export function parseBrief(prompt: string): Brief {
  const p = prompt.toLowerCase();
  const out: Brief = {};

  // Lot acreage: "0.5 acre", "1 ac", "5-acre"
  const ac = p.match(/(\d+(?:\.\d+)?)[\s-]*(?:acres?|ac\b)/);
  if (ac) out.lotAcres = parseFloat(ac[1]);

  // Lot dimensions: "147x147 ft", "100 by 200 feet", "60 ft × 100 ft"
  const dim = p.match(/(\d+)\s*(?:by|x|×)\s*(\d+)\s*(?:ft|feet|foot|′)?/);
  if (dim) {
    out.lotW = parseInt(dim[1]);
    out.lotD = parseInt(dim[2]);
  }

  // Setbacks: "25 ft front setback", "10 foot side setbacks"
  const sbF = p.match(/(\d+)\s*(?:ft|foot|feet|')?\s*front\s+setback/);
  if (sbF) out.setbackFront = parseInt(sbF[1]);
  const sbB = p.match(/(\d+)\s*(?:ft|foot|feet|')?\s*back\s+setback/);
  if (sbB) out.setbackBack = parseInt(sbB[1]);
  const sbS = p.match(/(\d+)\s*(?:ft|foot|feet|')?\s*side\s+setbacks?/);
  if (sbS) out.setbackSide = parseInt(sbS[1]);

  // Stories
  const st = p.match(/(\d+)[\s-]+stor(?:ies|y)/);
  if (st) out.stories = parseInt(st[1]);
  if (/\bsingle[-\s]?story\b/.test(p)) out.stories = 1;
  if (/\btwo[-\s]?story\b/.test(p)) out.stories = 2;
  if (/\bthree[-\s]?story\b/.test(p)) out.stories = 3;

  // Parking — counts as "user-stated" if any number sits next to a
  // parking-y word, OR if the user explicitly said "no parking".
  const pk = p.match(
    /(\d+)\s*(?:parking|stalls?|spots?|spaces?|cars?)/,
  );
  if (pk) out.parking = parseInt(pk[1]);
  if (/\bno\s+parking\b/.test(p)) out.noParking = true;

  // Trees
  if (
    /\btrees?\b|\boaks?\b|\bmaples?\b|\bpines?\b|\bpalms?\b|landscap|shade\s+tree/.test(
      p,
    )
  ) {
    out.trees = true;
  }
  if (/\bno\s+trees?\b|\bbare\s+lot\b|\bno\s+greenery\b/.test(p)) {
    out.noTrees = true;
  }

  // Fence
  if (
    /\bfence|fenced|hedge|wrought.?iron|picket|perimeter\s+wall\b/.test(p)
  ) {
    out.fence = true;
  }

  // Pool
  if (/\bpool|lap\s+pool|spa|hot\s+tub\b/.test(p)) out.pool = true;

  // Walkway / driveway
  if (/\bwalkway|sidewalk|flagstone|walk\s+from|driveway|path\b/.test(p)) {
    out.walkway = true;
  }

  // Material — explicit name
  const mat = p.match(/\b(brick|wood|wooden|stucco|concrete|steel|glass)\b/);
  if (mat) {
    out.material = mat[1] === "wooden" ? "wood" : mat[1];
  }

  // Structure kind
  if (/\bhouse|home|cottage|cabin|bungalow|residence\b/.test(p)) {
    out.structureKind = "house";
  } else if (/\bapartment|condo|townhouse|townhome|tenement\b/.test(p)) {
    out.structureKind = "apartment";
  } else if (/\boffice\b/.test(p)) {
    out.structureKind = "office";
  } else if (/\bschool|library|civic\b/.test(p)) {
    out.structureKind = "school";
  } else if (/\bgreenhouse|conservatory\b/.test(p)) {
    out.structureKind = "greenhouse";
  } else if (/\bwarehouse|industrial|distribution\b/.test(p)) {
    out.structureKind = "warehouse";
  } else if (/\bpavilion|gazebo|shelter\b/.test(p)) {
    out.structureKind = "pavilion";
  } else if (/\bgarage\b/.test(p)) {
    out.structureKind = "garage";
  }

  return out;
}

export function buildReceipt(
  plan: SitePlan,
  prompt: string,
): Receipt | null {
  if (!plan?.lot || plan.lot.width <= 0 || plan.lot.depth <= 0) return null;
  const brief = parseBrief(prompt);
  const user: ReceiptEntry[] = [];
  const ai: ReceiptEntry[] = [];

  // ── Lot ────────────────────────────────────────────────────────────────
  const lotArea = plan.lot.width * plan.lot.depth;
  const acres = lotArea / 43560;
  const lotValue = `${plan.lot.width}×${plan.lot.depth} ft (${acres.toFixed(2)} ac)`;
  if (brief.lotAcres !== undefined || brief.lotW !== undefined) {
    user.push({ label: "Lot", value: lotValue });
  } else {
    ai.push({
      label: "Lot",
      value: lotValue,
      note: "no size in your brief — AI picked a typical lot",
    });
  }

  // ── Setbacks ───────────────────────────────────────────────────────────
  const sb = plan.setbacks;
  const sbValue = `${sb.front} / ${sb.back} / ${sb.side} ft`;
  const userSetSb =
    brief.setbackFront !== undefined ||
    brief.setbackBack !== undefined ||
    brief.setbackSide !== undefined;
  if (userSetSb) {
    user.push({
      label: "Setbacks",
      value: sbValue,
      note: "front / back / side",
    });
  } else {
    const isResDefault = sb.front === 25 && sb.back === 20 && sb.side === 10;
    ai.push({
      label: "Setbacks",
      value: sbValue,
      note: isResDefault
        ? "AI used typical residential defaults (25/20/10)"
        : "AI-chosen for the site",
    });
  }

  // ── Buildings ──────────────────────────────────────────────────────────
  const buildings = plan.buildings ?? [];
  if (buildings.length > 0) {
    // Stories — first building's stories count is what the user usually
    // means; multi-building briefs rarely vary stories per building.
    const stories = buildings[0].stories;
    if (brief.stories !== undefined) {
      user.push({ label: "Stories", value: `${stories}` });
    } else {
      ai.push({
        label: "Stories",
        value: `${stories}`,
        note: "AI inferred from building type",
      });
    }

    // Footprint — almost always AI-sized. Show the unique sizes.
    const sizes = Array.from(
      new Set(
        buildings.map((b) => `${Math.round(b.w)}×${Math.round(b.d)}`),
      ),
    ).join(", ");
    ai.push({
      label: "Footprint",
      value: `${sizes} ft`,
      note:
        buildings.length === 1
          ? "AI sized to fit setbacks + brief"
          : `${buildings.length} buildings, sized by AI`,
    });

    // Material
    const mat = buildings[0].material;
    if (mat) {
      if (brief.material && brief.material === mat) {
        user.push({ label: "Material", value: mat });
      } else {
        ai.push({
          label: "Material",
          value: mat,
          note: "AI-inferred from program",
        });
      }
    }
  }

  // ── Parking ────────────────────────────────────────────────────────────
  const stalls = (plan.parking ?? []).length;
  if (stalls > 0) {
    if (brief.parking !== undefined) {
      user.push({ label: "Parking", value: `${stalls} stalls` });
    } else {
      ai.push({
        label: "Parking",
        value: `${stalls} stalls`,
        note: "you didn't ask — AI added these",
      });
    }
  } else if (brief.noParking || brief.parking === 0) {
    user.push({ label: "Parking", value: "none (your call)" });
  }

  // ── Trees ──────────────────────────────────────────────────────────────
  const trees = plan.trees ?? [];
  if (trees.length > 0) {
    const speciesCounts = new Map<string, number>();
    for (const t of trees) {
      speciesCounts.set(t.species, (speciesCounts.get(t.species) ?? 0) + 1);
    }
    const speciesStr = Array.from(speciesCounts.entries())
      .map(([s, n]) => `${n} ${s}`)
      .join(", ");
    if (brief.trees) {
      user.push({ label: "Trees", value: speciesStr });
    } else {
      ai.push({
        label: "Trees",
        value: speciesStr,
        note: "default landscaping — say 'no trees' to skip",
      });
    }
  } else if (brief.noTrees) {
    user.push({ label: "Trees", value: "none (your call)" });
  }

  // ── Walkways ───────────────────────────────────────────────────────────
  const walks = plan.walkways ?? [];
  if (walks.length > 0) {
    if (brief.walkway) {
      user.push({ label: "Walkways", value: `${walks.length} placed` });
    } else {
      ai.push({
        label: "Walkways",
        value: `${walks.length} placed`,
        note: "AI added paths to connect things",
      });
    }
  } else if (buildings.length > 0) {
    // Renderer auto-draws front walks when no manual walkways exist.
    ai.push({
      label: "Front walks",
      value: "auto-rendered",
      note: "concrete walks from the curb to each door",
    });
  }

  // ── Fence / Pool — only meaningful when present ────────────────────────
  const fences = plan.fences ?? [];
  if (fences.length > 0) {
    const f = fences[0];
    const sides = f.sides.join("/");
    if (brief.fence) {
      user.push({ label: "Fence", value: `${f.style} on ${sides}` });
    } else {
      ai.push({
        label: "Fence",
        value: `${f.style} on ${sides}`,
        note: "you didn't ask — AI added",
      });
    }
  }

  const pools = plan.pools ?? [];
  if (pools.length > 0) {
    const pool = pools[0];
    if (brief.pool) {
      user.push({
        label: "Pool",
        value: `${pool.shape}, ${Math.round(pool.w)}×${Math.round(pool.d)} ft`,
      });
    } else {
      ai.push({
        label: "Pool",
        value: pool.shape,
        note: "you didn't ask — AI added",
      });
    }
  }

  return { user, ai };
}
