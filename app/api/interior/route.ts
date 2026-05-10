import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import type { SitePlan } from "@/lib/types";
import {
  FLOOR_TYPES,
  FURNITURE_CATALOG,
  FURNITURE_KINDS,
  type FloorType,
  type FurnitureItem,
  type FurnitureKind,
  type InteriorPlan,
  type Room,
  interiorCacheKey,
  targetItemCount,
} from "@/lib/furniture";
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 30;

type CacheEntry = { plan: InteriorPlan; createdAt: number };
const CACHE = new Map<string, CacheEntry>();
const CACHE_LIMIT = 200;

function evictIfFull() {
  if (CACHE.size <= CACHE_LIMIT) return;
  const oldest = CACHE.keys().next().value;
  if (oldest) CACHE.delete(oldest);
}

const PROGRAM_BY_TYPE: Record<string, { ground: string; upper: string }> = {
  house: {
    ground:
      "Open living room, dining area, kitchen, half-bath, entry foyer. Living room and dining can flow into each other (open plan). Kitchen behind a counter or with its own room.",
    upper:
      "1-3 bedrooms, 1-2 bathrooms, central hallway connecting them. Master often has its own en-suite bath.",
  },
  apartment: {
    ground:
      "Lobby with reception, mailroom area, possibly 1-2 ground-floor units (each unit has a bedroom, bathroom, kitchenette, living area).",
    upper:
      "Units along a central corridor. Each unit is its own enclosed group of rooms (living/kitchen, bedroom, bath). 4-6 units per floor depending on footprint.",
  },
  office: {
    ground:
      "Reception/lobby, 2-3 meeting rooms, restrooms, service core (elevator/stair). Open lounge area near reception.",
    upper:
      "Open-plan workstation area (one large room), perimeter private offices, glass-walled meeting rooms, breakroom/kitchenette, restrooms.",
  },
  warehouse: {
    ground:
      "One large open warehouse room covering most of the floor, with a small office cluster (2-3 separate rooms) near the entry.",
    upper:
      "Mezzanine office (small) with a few rooms; the rest of the upper level can be left open.",
  },
  parking_garage: {
    ground: "No interior rooms or furniture — return empty arrays.",
    upper: "No interior rooms or furniture — return empty arrays.",
  },
  greenhouse: {
    ground:
      "One open growing room covering the whole floor, plus a small headhouse / potting room at one end.",
    upper: "Same as ground.",
  },
  pavilion: {
    ground: "One open room covering the whole floor (open-air pavilion).",
    upper: "Same as ground.",
  },
};

function buildPrompt(args: {
  w: number;
  d: number;
  totalStories: number;
  storyIndex: number;
  type: string;
  material: string;
}): string {
  const { w, d, totalStories, storyIndex, type, material } = args;
  const isGround = storyIndex === 0;
  const program = PROGRAM_BY_TYPE[type] ?? PROGRAM_BY_TYPE.office;
  const programBlurb = isGround ? program.ground : program.upper;
  const floorLabel = isGround
    ? `Ground Floor (Level 1 of ${totalStories})`
    : storyIndex === totalStories - 1 && totalStories > 1
    ? `Top Floor (Level ${totalStories} of ${totalStories})`
    : `Level ${storyIndex + 1} of ${totalStories}`;

  const target = targetItemCount(w, d);
  const catalogLines = FURNITURE_KINDS.map((k) => {
    const s = FURNITURE_CATALOG[k];
    return `- ${k} (${s.w}×${s.d}×${s.h} ft): ${s.hint}`;
  }).join("\n");

  return [
    `You are an architect-interior designer for a 3D site-planning app. Design ONE floor of a building: lay out rooms, then furnish them.`,
    `BUILDING: ${type} (${material} construction). Footprint ${w}×${d} ft. This is ${floorLabel}.`,
    `PROGRAM FOR THIS FLOOR: ${programBlurb}`,
    `COORDINATE SYSTEM (critical):
- Origin (0, 0) is the FRONT-LEFT corner of the building footprint.
- +x runs left-to-right along the ${w}ft width.
- +z runs front-to-back along the ${d}ft depth.
- All values are FEET.
- Room (x, z) is the FRONT-LEFT corner of the room (NOT the center).
- Furniture (x, z) is the CENTER of the item's footprint.
- yaw is degrees clockwise from above (0 = default, 90 = quarter turn).`,
    `STEP 1 — ROOMS:
Tile the floor with non-overlapping rectangular rooms. Cover most of the footprint (small voids OK for hallways, but try to fill ≥85% of the area). Pick a name and a floor finish per room:
- Floor finishes: ${FLOOR_TYPES.join(", ")}.
- Use hardwood for living/dining/bedrooms. Tile for kitchen/bathroom. Carpet OK for bedrooms / private offices. Marble for upscale lobbies. Concrete for warehouses. Vinyl for utility / corridors.
- Room names should be human-readable: "living", "kitchen", "dining", "master_bed", "bed_2", "bath", "half_bath", "foyer", "office_1", "meeting_a", "lobby", "corridor", "open_office", "warehouse_floor", etc.
- Each room must fit fully: 0 ≤ x and x + w ≤ ${w}, 0 ≤ z and z + d ≤ ${d}.
- Rooms must NOT overlap each other.
- Common rooms (living + dining + kitchen island) can flow as one larger "great_room" if the floor is small.
- Shared walls between adjacent rooms will automatically get a door opening — so make sure each room is reachable through some chain of adjacencies from a likely-entrance room (foyer / lobby / corridor).

STEP 2 — FURNITURE:
Place ${target.min}-${target.max} pieces total INSIDE the rooms. Use only kinds from the catalog. Each item must lie fully within ONE room (no item straddling a wall). Cluster naturally — sofa+coffee_table+tv_stand together facing each other; bed against a wall with nightstands; dining_table with chairs around it; kitchen_counter+stove+sink+fridge along a wall; toilet+sink in the bathroom.

AVAILABLE FURNITURE KINDS (footprint w×d×h in feet):
${catalogLines}`,
    `Return ONLY JSON matching the schema. No prose.`,
  ].join("\n\n");
}

// ── Validation helpers ────────────────────────────────────────────────────
function clampRoom(r: Room, bw: number, bd: number): Room | null {
  const x = Math.max(0, Math.min(bw - 1, r.x));
  const z = Math.max(0, Math.min(bd - 1, r.z));
  const w = Math.max(2, Math.min(bw - x, r.w));
  const d = Math.max(2, Math.min(bd - z, r.d));
  if (w < 2 || d < 2) return null;
  return { ...r, x, z, w, d };
}

function rectsOverlap(a: Room, b: Room): boolean {
  const eps = 0.01;
  return (
    a.x + a.w > b.x + eps &&
    b.x + b.w > a.x + eps &&
    a.z + a.d > b.z + eps &&
    b.z + b.d > a.z + eps
  );
}

export async function POST(req: Request) {
  const limited = rateLimit(req, { bucket: "interior", limit: 15, windowMs: 60_000 });
  if (!limited.ok) return rateLimitResponse(limited);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { ok: false, error: "GEMINI_API_KEY missing." },
      { status: 500 }
    );
  }

  let body: {
    buildingIndex?: number;
    storyIndex?: number;
    plan?: SitePlan;
    forceRegenerate?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { ok: false, error: "Body must be JSON." },
      { status: 400 }
    );
  }

  const { buildingIndex, storyIndex, plan, forceRegenerate } = body;
  if (
    typeof buildingIndex !== "number" ||
    typeof storyIndex !== "number" ||
    !plan?.buildings?.[buildingIndex]
  ) {
    return Response.json(
      { ok: false, error: "Missing buildingIndex / storyIndex / plan." },
      { status: 400 }
    );
  }
  const building = plan.buildings[buildingIndex];
  if (storyIndex < 0 || storyIndex >= building.stories) {
    return Response.json(
      { ok: false, error: "storyIndex out of range." },
      { status: 400 }
    );
  }

  const w = Math.round(building.w);
  const d = Math.round(building.d);
  const type = building.structure_type ?? "office";
  const material = building.material ?? "concrete";
  const key = interiorCacheKey({
    w,
    d,
    stories: building.stories,
    storyIndex,
    structureType: type,
    material,
  });

  if (!forceRegenerate) {
    const hit = CACHE.get(key);
    if (hit) {
      return Response.json({
        ok: true,
        cached: true,
        key,
        ...hit.plan,
      });
    }
  }

  const prompt = buildPrompt({
    w,
    d,
    totalStories: building.stories,
    storyIndex,
    type,
    material,
  });

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            rooms: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  x: { type: Type.NUMBER },
                  z: { type: Type.NUMBER },
                  w: { type: Type.NUMBER },
                  d: { type: Type.NUMBER },
                  floor: {
                    type: Type.STRING,
                    enum: [...FLOOR_TYPES],
                  },
                },
                required: ["name", "x", "z", "w", "d", "floor"],
              },
            },
            furniture: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  kind: { type: Type.STRING, enum: [...FURNITURE_KINDS] },
                  x: { type: Type.NUMBER },
                  z: { type: Type.NUMBER },
                  yaw: { type: Type.NUMBER },
                },
                required: ["kind", "x", "z"],
              },
            },
          },
          required: ["rooms", "furniture"],
        },
        thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
      },
    });

    const text =
      response.text ??
      response.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("") ??
      "";
    if (!text) {
      return Response.json(
        { ok: false, error: "Model returned no text." },
        { status: 502 }
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return Response.json(
        { ok: false, error: "Model returned invalid JSON.", rawText: text },
        { status: 502 }
      );
    }

    const data = parsed as {
      rooms?: unknown;
      furniture?: unknown;
    };

    // ── Validate rooms ─────────────────────────────────────────────────
    const validFloors = new Set<string>(FLOOR_TYPES);
    const roomsRaw = Array.isArray(data.rooms) ? data.rooms : [];
    const rooms: Room[] = [];
    for (const rRaw of roomsRaw) {
      const r = rRaw as {
        name?: unknown;
        x?: unknown;
        z?: unknown;
        w?: unknown;
        d?: unknown;
        floor?: unknown;
      };
      if (
        typeof r.name !== "string" ||
        typeof r.x !== "number" ||
        typeof r.z !== "number" ||
        typeof r.w !== "number" ||
        typeof r.d !== "number" ||
        typeof r.floor !== "string" ||
        !validFloors.has(r.floor)
      )
        continue;
      const candidate: Room = {
        name: r.name.slice(0, 32),
        x: r.x,
        z: r.z,
        w: r.w,
        d: r.d,
        floor: r.floor as FloorType,
      };
      const clamped = clampRoom(candidate, w, d);
      if (!clamped) continue;
      // Drop rooms that overlap any already-accepted room. Keep first-wins so
      // earlier (presumably more important) rooms in the LLM's list survive.
      if (rooms.some((r2) => rectsOverlap(clamped, r2))) continue;
      rooms.push(clamped);
    }

    // ── Validate furniture ─────────────────────────────────────────────
    const validKinds = new Set<string>(FURNITURE_KINDS);
    const furnRaw = Array.isArray(data.furniture) ? data.furniture : [];
    const furniture: FurnitureItem[] = [];
    for (const itemRaw of furnRaw) {
      const item = itemRaw as {
        kind?: unknown;
        x?: unknown;
        z?: unknown;
        yaw?: unknown;
      };
      if (typeof item.kind !== "string" || !validKinds.has(item.kind)) continue;
      if (typeof item.x !== "number" || typeof item.z !== "number") continue;
      const kind = item.kind as FurnitureKind;
      const spec = FURNITURE_CATALOG[kind];
      const halfW = spec.w / 2;
      const halfD = spec.d / 2;
      const x = Math.min(w - halfW, Math.max(halfW, item.x));
      const z = Math.min(d - halfD, Math.max(halfD, item.z));
      const yaw = typeof item.yaw === "number" ? item.yaw : 0;
      furniture.push({ kind, x, z, yaw });
    }

    const result: InteriorPlan = { rooms, furniture };
    evictIfFull();
    CACHE.set(key, { plan: result, createdAt: Date.now() });

    return Response.json({ ok: true, cached: false, key, ...result });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const isRateLimit = /429|RESOURCE_EXHAUSTED|quota/i.test(detail);
    const retryMatch = detail.match(/retry in ([\d.]+)s/i);
    return Response.json(
      {
        ok: false,
        error: isRateLimit ? "Gemini rate limit hit." : "Gemini call failed.",
        retryAfterSeconds: retryMatch ? Math.ceil(Number(retryMatch[1])) : null,
        detail,
      },
      { status: isRateLimit ? 429 : 502 }
    );
  }
}
