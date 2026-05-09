import {
  GoogleGenAI,
  FunctionCallingConfigMode,
  ThinkingLevel,
  type Content,
  type Part,
} from "@google/genai";
import { TOOLS } from "@/lib/tools";
import { TOOL_DECLARATIONS, ALLOWED_TOOL_NAMES } from "@/lib/toolDeclarations";
import type { SitePlan, Step } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_ITERATIONS = 10;

const SYSTEM_PROMPT = `You are Parcel, a site-planning agent. You translate plain-English site descriptions into 3D site plans by calling tools that lay out the lot, place a building, validate setbacks, and place parking.

COORDINATES (critical, do not deviate):
- Origin (0, 0) is the FRONT-LEFT CORNER of the lot.
- +x runs LEFT-to-RIGHT across the lot's width.
- +z runs FRONT-to-BACK (away from the street).
- All values are FEET.
- For place_building, (x, z) is the FRONT-LEFT CORNER of the footprint, NOT the center. The building occupies x in [x, x+w] and z in [z, z+d].

REQUIRED ORDER:
1. set_lot — establish lot + setbacks (always call first)
2. place_building — pick a footprint inside the buildable envelope
3. check_setbacks — verify; if it fails, call place_building again with corrected coordinates
4. place_parking — pack the requested stalls
5. finalize — when the plan is valid and complete

DEFAULTS for missing info:
- Setbacks: front 25, back 20, side 10 (typical residential).
- Stories: 2.
- Parking: 1 stall per dwelling unit if not specified, with a sensible minimum of 4.
- Acreage: 1 acre = 43,560 sqft. Assume a square lot. Round dimensions to whole feet.

EXAMPLE — input "0.5 acre lot, 25 ft front setback, 10 ft sides, 3-story building, 12 parking spots":
- 0.5 acre = 21,780 sqft → 147x147 ft square lot
- set_lot(width=147, depth=147, front=25, back=20, side=10)
  → buildable area: x in [10, 137], z in [25, 127] (127x102 ft)
- Pick a building that fits, centered on x: place_building(x=44, z=30, w=60, d=40, stories=3)
- check_setbacks() → should be OK
- place_parking(count=12)
- finalize()

ERROR HANDLING: When a tool returns ok=false, the result string tells you EXACTLY what's wrong (e.g. "front setback short by 20.0ft"). Use the numbers in the error to compute correct args. NEVER repeat the same failing call with the same args.

Stop after finalize. You have at most ${MAX_ITERATIONS} turns.`;

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "GEMINI_API_KEY missing. Add it to .env.local." },
      { status: 500 }
    );
  }

  let prompt: string;
  try {
    const body = await req.json();
    prompt = typeof body?.prompt === "string" ? body.prompt : "";
  } catch {
    return Response.json({ error: "Body must be JSON: { prompt: string }" }, { status: 400 });
  }
  if (!prompt) {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }

  const ai = new GoogleGenAI({ apiKey });

  // Conversation history. Gemini multi-turn function calling requires us to
  // append both the model's function-call turn and our function-response turn
  // each round, so the model sees the running history of what it tried.
  const contents: Content[] = [{ role: "user", parts: [{ text: prompt }] }];

  let plan: SitePlan | null = null;
  const steps: Step[] = [];
  const stages: Array<{ step: Step; plan: SitePlan | null }> = [];
  let finalized = false;
  let iterations = 0;

  try {
    for (iterations = 0; iterations < MAX_ITERATIONS; iterations++) {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
          toolConfig: {
            functionCallingConfig: {
              mode: FunctionCallingConfigMode.ANY,
              allowedFunctionNames: ALLOWED_TOOL_NAMES,
            },
          },
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const calls = response.functionCalls ?? [];
      if (calls.length === 0) {
        // Model didn't call a tool. Either it's done explaining or stuck.
        break;
      }

      // Echo the model's turn (function calls) back into the history.
      const modelParts = response.candidates?.[0]?.content?.parts ?? [];
      contents.push({ role: "model", parts: modelParts });

      // Run each tool, collect responses, push steps + stages.
      const responseParts: Part[] = [];
      for (const call of calls) {
        const name = call.name ?? "";
        const args = (call.args ?? {}) as Record<string, unknown>;
        const fn = TOOLS[name];

        let result: string;
        let ok: boolean;
        if (!fn) {
          result = `Unknown tool: "${name}". Available: ${ALLOWED_TOOL_NAMES.join(", ")}.`;
          ok = false;
        } else {
          const out = fn(plan, args);
          plan = out.plan;
          result = out.result;
          ok = out.ok;
        }

        const step: Step = { tool: name, note: result, ok };
        steps.push(step);
        stages.push({ step, plan });
        responseParts.push({
          functionResponse: { name, response: { result, ok } },
        });

        if (name === "finalize" && ok) finalized = true;
      }

      // Feed tool responses back as the user turn (Gemini convention).
      contents.push({ role: "user", parts: responseParts });

      if (finalized) break;
    }

    return Response.json({
      ok: true,
      plan,
      steps,
      stages,
      finalized,
      iterations: iterations + 1,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const isRateLimit = /429|RESOURCE_EXHAUSTED|quota/i.test(detail);
    const retryMatch = detail.match(/retry in ([\d.]+)s/i);

    return Response.json(
      {
        ok: false,
        error: isRateLimit
          ? "Gemini rate limit hit (free tier = 5 requests/min)."
          : "Gemini call failed.",
        retryAfterSeconds: retryMatch ? Math.ceil(Number(retryMatch[1])) : null,
        detail,
        steps,
        plan,
      },
      { status: isRateLimit ? 429 : 502 }
    );
  }
}
