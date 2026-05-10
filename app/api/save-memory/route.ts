import { NextRequest } from "next/server";
import { saveSession } from "@/lib/backboard";
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit";
import type { SitePlan } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, {
    bucket: "save-memory",
    limit: 30,
    windowMs: 60_000,
  });
  if (!limited.ok) return rateLimitResponse(limited);

  let body: {
    userId?: string;
    threadId?: string | null;
    prompt?: string;
    sitePlan?: SitePlan;
    notes?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const { userId, threadId, prompt, sitePlan, notes } = body;
  if (!userId || typeof userId !== "string") {
    return Response.json({ error: "userId required" }, { status: 400 });
  }
  if (!prompt || typeof prompt !== "string") {
    return Response.json({ error: "prompt required" }, { status: 400 });
  }
  if (!sitePlan || typeof sitePlan !== "object") {
    return Response.json({ error: "sitePlan required" }, { status: 400 });
  }

  const result = await saveSession(
    userId,
    typeof threadId === "string" ? threadId : null,
    prompt,
    sitePlan,
    typeof notes === "string" ? notes : undefined,
  );

  return Response.json({ ok: result.ok, threadId: result.threadId });
}
