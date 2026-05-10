import { NextRequest } from "next/server";
import { chatWithHistory } from "@/lib/backboard";
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, {
    bucket: "chat-history",
    limit: 20,
    windowMs: 60_000,
  });
  if (!limited.ok) return rateLimitResponse(limited);

  let body: { threadId?: string | null; question?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const { threadId, question } = body;
  if (!question || typeof question !== "string" || !question.trim()) {
    return Response.json({ error: "question required" }, { status: 400 });
  }

  const answer = await chatWithHistory(
    typeof threadId === "string" ? threadId : null,
    question.trim(),
  );

  return Response.json({ ok: true, answer });
}
