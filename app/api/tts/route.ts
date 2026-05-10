// Server-side proxy for ElevenLabs text-to-speech.
// Keeps the API key out of the browser bundle.
// Returns 503 when no key is configured so the client can fall back gracefully.

import { rateLimit, rateLimitResponse } from "@/lib/rateLimit";

const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel
const MAX_TEXT_LEN = 1000;

export async function POST(req: Request) {
  // ElevenLabs bills per character — keep this tight to prevent runaway cost.
  const limited = rateLimit(req, { bucket: "tts", limit: 10, windowMs: 60_000 });
  if (!limited.ok) return rateLimitResponse(limited);

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return new Response("ELEVENLABS_API_KEY not configured", { status: 503 });
  }

  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const text = (body.text ?? "").trim();
  if (!text) return new Response("missing text", { status: 400 });
  if (text.length > MAX_TEXT_LEN) {
    return new Response("text too long", { status: 413 });
  }

  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });
  } catch {
    return new Response("upstream fetch failed", { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text().catch(() => "");
    return new Response(errText || "elevenlabs error", {
      status: upstream.status || 502,
    });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
