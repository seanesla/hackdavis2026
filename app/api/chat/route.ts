// Server-side proxy for free-form Gemini chat.
// Returns 503 when no key is configured so the client falls back to canned.

import { rateLimit, rateLimitResponse } from "@/lib/rateLimit";

const MODEL = "gemini-3.1-flash-lite";
const MODEL_FALLBACK = "gemini-2.5-flash";

const SYSTEM_PROMPT = `You are a friendly architect helping someone plan a small building on their land. Have a casual, free-flowing conversation. Listen to them and respond like a thoughtful colleague — sometimes ask a follow-up, sometimes share a quick thought or suggestion, sometimes just acknowledge with a short remark. Keep responses to 1–2 short sentences max — your reply gets spoken aloud. Avoid running through a checklist of questions. After three or four exchanges where you've gathered enough info, you can suggest finalizing. The user can say "build it" or "that's it" anytime to finalize. Don't mention you're an AI; just have a natural human-feeling conversation.`;

type TranscriptEntry = { who: "ai" | "user"; text: string };

function toContents(history: TranscriptEntry[]) {
  // Gemini requires the conversation to start with a "user" turn and alternate.
  // Drop any leading AI messages (e.g., the greeting) until we find a user turn.
  let i = 0;
  while (i < history.length && history[i].who !== "user") i++;
  const trimmed = history.slice(i);
  return trimmed.map((e) => ({
    role: e.who === "ai" ? "model" : "user",
    parts: [{ text: e.text }],
  }));
}

async function callGemini(model: string, apiKey: string, contents: ReturnType<typeof toContents>) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      generationConfig: {
        temperature: 0.85,
        maxOutputTokens: 120,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });
}

export async function POST(req: Request) {
  const limited = rateLimit(req, { bucket: "chat", limit: 20, windowMs: 60_000 });
  if (!limited.ok) return rateLimitResponse(limited);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response("GEMINI_API_KEY not configured", { status: 503 });
  }

  let body: { history?: TranscriptEntry[] };
  try {
    body = await req.json();
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const history = Array.isArray(body.history) ? body.history : [];
  const contents = toContents(history);
  if (contents.length === 0) {
    return Response.json({ text: "Tell me about the building you want to design." });
  }

  let upstream: Response;
  try {
    upstream = await callGemini(MODEL, apiKey, contents);
    // If the preview model isn't available on this key, retry with the stable fallback.
    if (upstream.status === 404) {
      upstream = await callGemini(MODEL_FALLBACK, apiKey, contents);
    }
  } catch {
    return new Response("upstream fetch failed", { status: 502 });
  }

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => "");
    return new Response(errText || "gemini error", { status: upstream.status });
  }

  const data = await upstream.json().catch(() => null);
  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
  if (!text) {
    return new Response("empty completion", { status: 502 });
  }

  return Response.json({ text });
}
