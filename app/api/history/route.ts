import { NextRequest } from "next/server";
import { getSessionHistory } from "@/lib/backboard";
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit";

export async function GET(request: NextRequest) {
  const limited = rateLimit(request, { bucket: "history", limit: 60, windowMs: 60_000 });
  if (!limited.ok) return rateLimitResponse(limited);

  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) {
    return Response.json({ error: "Missing userId" }, { status: 400 });
  }

  const history = await getSessionHistory(userId);
  return Response.json({ history });
}
