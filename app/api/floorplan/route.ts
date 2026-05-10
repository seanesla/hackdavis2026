import { GoogleGenAI } from "@google/genai";
import type { SitePlan } from "@/lib/types";
import { STRUCTURE_TYPES } from "@/lib/types";
import {
  buildFloorPlanPrompt,
  floorPlanCacheKey,
} from "@/lib/floorPlanPrompt";

export const runtime = "nodejs";
export const maxDuration = 60;

type CacheEntry = {
  dataUrl: string;
  mimeType: string;
  prompt: string;
  createdAt: number;
};

const CACHE = new Map<string, CacheEntry>();
const CACHE_LIMIT = 200;

function evictIfFull() {
  if (CACHE.size <= CACHE_LIMIT) return;
  const oldest = CACHE.keys().next().value;
  if (oldest) CACHE.delete(oldest);
}

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { ok: false, error: "GEMINI_API_KEY missing. Add it to .env.local." },
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
    !plan ||
    !plan.buildings ||
    !plan.buildings[buildingIndex]
  ) {
    return Response.json(
      { ok: false, error: "Missing or invalid buildingIndex / storyIndex / plan." },
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

  // Defense against a malformed/tampered structure_type reaching the prompt.
  if (
    building.structure_type &&
    !(STRUCTURE_TYPES as readonly string[]).includes(building.structure_type)
  ) {
    return Response.json(
      { ok: false, error: "Unknown structure_type." },
      { status: 400 }
    );
  }

  const key = floorPlanCacheKey(building, storyIndex);
  if (!forceRegenerate) {
    const hit = CACHE.get(key);
    if (hit) {
      return Response.json({
        ok: true,
        cached: true,
        key,
        prompt: hit.prompt,
        image: { dataUrl: hit.dataUrl, mimeType: hit.mimeType },
      });
    }
  }

  const prompt = buildFloorPlanPrompt(building, storyIndex);
  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseModalities: ["IMAGE", "TEXT"],
      },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const imgPart = parts.find((p) => p.inlineData?.data);
    if (!imgPart?.inlineData?.data) {
      return Response.json(
        {
          ok: false,
          error: "Model returned no image. Try regenerating.",
          rawText:
            parts.map((p) => p.text).filter(Boolean).join(" ") || null,
        },
        { status: 502 }
      );
    }

    const mimeType = imgPart.inlineData.mimeType ?? "image/png";
    const dataUrl = `data:${mimeType};base64,${imgPart.inlineData.data}`;

    evictIfFull();
    CACHE.set(key, { dataUrl, mimeType, prompt, createdAt: Date.now() });

    return Response.json({
      ok: true,
      cached: false,
      key,
      prompt,
      image: { dataUrl, mimeType },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const isRateLimit = /429|RESOURCE_EXHAUSTED|quota/i.test(detail);
    const retryMatch = detail.match(/retry in ([\d.]+)s/i);
    return Response.json(
      {
        ok: false,
        error: isRateLimit
          ? "Gemini image rate limit hit."
          : "Gemini image call failed.",
        retryAfterSeconds: retryMatch ? Math.ceil(Number(retryMatch[1])) : null,
        detail,
      },
      { status: isRateLimit ? 429 : 502 }
    );
  }
}
