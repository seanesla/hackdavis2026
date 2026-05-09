import { NextRequest } from "next/server";
import { mockPlan, mockSteps } from "@/lib/mockPlan";
import { buildMemoryContext, saveSession } from "@/lib/backboard";
import type { SitePlan } from "@/lib/types";

const USER_ID = "hackathon-user-1";

const BASE_SYSTEM_PROMPT = `You are SitePlan Agent. You convert plain-English site descriptions into valid, code-compliant 3D site plans by calling tool functions. You never emit geometry directly — only call tools.`;

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { prompt?: string };
  const userPrompt = body.prompt?.trim() ?? "";

  if (!userPrompt) {
    return Response.json({ error: "Missing prompt" }, { status: 400 });
  }

  const memory = await buildMemoryContext(USER_ID);
  const systemPrompt = memory
    ? `${BASE_SYSTEM_PROMPT}\n\n${memory}`
    : BASE_SYSTEM_PROMPT;

  // TODO (C): replace this block with the real Gemini agent loop.
  // Inputs: systemPrompt + userPrompt. Output: { plan, steps }.
  const finalSitePlan: SitePlan = mockPlan;
  const steps = mockSteps;

  await saveSession(USER_ID, finalSitePlan, userPrompt);

  return Response.json({
    plan: finalSitePlan,
    steps,
    systemPrompt,
  });
}
