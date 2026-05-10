import { NextRequest } from "next/server";
import { getSessionHistory } from "@/lib/backboard";

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) {
    return Response.json({ error: "Missing userId" }, { status: 400 });
  }

  const history = await getSessionHistory(userId);
  return Response.json({ history });
}
