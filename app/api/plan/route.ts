import {
  GoogleGenAI,
  Type,
  FunctionCallingConfigMode,
  ThinkingLevel,
} from "@google/genai";

export const runtime = "nodejs";

// Smoke test for hour 0-3:
// One tool, one Gemini call, returns whatever function calls came back.
// No agent loop, no SitePlan, no validation. Just proves the SDK works.

const setLotDeclaration = {
  name: "set_lot",
  description:
    "Record the dimensions of the lot the user described. Width is left-right, depth is front-to-back. Both in feet.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      width: {
        type: Type.NUMBER,
        description: "Lot width in feet.",
      },
      depth: {
        type: Type.NUMBER,
        description: "Lot depth in feet.",
      },
    },
    required: ["width", "depth"],
  },
};

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

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        tools: [{ functionDeclarations: [setLotDeclaration] }],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY,
            allowedFunctionNames: ["set_lot"],
          },
        },
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    return Response.json({
      ok: true,
      functionCalls: response.functionCalls ?? [],
      text: response.text ?? null,
    });
  } catch (err) {
    return Response.json(
      {
        error: "Gemini call failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    );
  }
}
