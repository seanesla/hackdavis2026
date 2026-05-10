// AI integration seam. Voice flows depend only on these two functions.
// planFromIntent: still a stub today; Role C swaps it when /api/plan is built.
// chatTurn: tries real Gemini via /api/chat; falls back to varied canned
//   replies if no key is configured (or upstream fails).

import type { SitePlan, SitePlanMeta, Step } from "./types";
import { mockPlan, mockSteps } from "./mockPlan";

export type TranscriptEntry = { who: "ai" | "user"; text: string };

export async function planFromIntent(input: {
  prompt?: string;
  meta?: SitePlanMeta;
}): Promise<{ plan: SitePlan; steps: Step[] }> {
  await new Promise((r) => setTimeout(r, 200));
  const plan: SitePlan = {
    ...mockPlan,
    meta: { ...(mockPlan.meta ?? {}), ...(input.meta ?? {}) },
  };
  return { plan, steps: mockSteps };
}

export async function chatTurn(history: TranscriptEntry[]): Promise<string> {
  // Try the real Gemini-backed route first.
  try {
    const r = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history }),
    });
    if (r.ok) {
      const data = await r.json();
      const text = (data?.text ?? "").trim();
      if (text) return text;
    }
    // 503 = no key, 5xx = transient — fall through to canned.
  } catch {
    // Network error — fall through.
  }
  return cannedChatTurn(history);
}

// ---------- canned fallback ----------
// Goal: feel conversational, not like a survey. Multiple variants per topic
// are picked at random; some turns acknowledge instead of asking.

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const ACK = [
  "Got it.",
  "Nice.",
  "Makes sense.",
  "Cool.",
  "Okay.",
  "Right on.",
];

const FOLLOWUPS_FLOORS = [
  "Three sounds about right. What's the program — apartments, offices, mixed?",
  "Going up rather than out — any thoughts on roof line?",
  "Got it. Any feel for the lot size yet?",
  "Cool. What's drawing you to that height?",
];

const FOLLOWUPS_MATERIAL = [
  "Solid pick. What's drawing you to that — durability, look, cost?",
  "Good call. Any thoughts on cladding or finish?",
  "That fits well for this scale. What's the use case?",
  "Nice. Local code might want certain fire ratings — anything jumping out?",
];

const FOLLOWUPS_USE = [
  "Got it. Any sense of how many units or how big?",
  "Cool. Single-tenant or multi-tenant?",
  "Any constraints from the lot or zoning you're working around?",
  "Makes sense. Want it to feel public-facing or tucked back?",
];

const FOLLOWUPS_LOT = [
  "Got it. What's the surrounding context — residential street, commercial?",
  "Nice. Any slope or trees we should think about?",
  "Cool. Where's the street frontage?",
  "Got it. Front setback expectations from neighbors?",
];

const FOLLOWUPS_BUDGET = [
  "Tight budgets often push toward simple rectangles and wood frame — sound right?",
  "Got it. Phasing into stages might help — open to that?",
  "Sure. Want to lean affordable or splurge on finishes?",
];

const OPEN_FOLLOWUPS = [
  "Tell me more about that.",
  "What's the vibe you're going for?",
  "What's the goal — your own home, rental, something for the community?",
  "Anything special about the site — view, slope, neighbors?",
  "What would make this project feel like a win?",
  "Got a precedent in mind — a building you've seen and liked?",
];

const REFLECT_PREFIXES = [
  "So you're thinking",
  "Sounds like",
  "Reading you right —",
  "If I'm following,",
];

const NUDGE_FINALIZE = [
  "I think I've got enough. Say 'build it' when you're ready and I'll lay it out.",
  "Want me to take a first pass at the layout? Just say 'build it'.",
  "Got a good picture. Say 'build it' whenever and I'll start the plan.",
];

function cannedChatTurn(history: TranscriptEntry[]): string {
  const last = history[history.length - 1]?.text?.toLowerCase() ?? "";
  const userTurns = history.filter((e) => e.who === "user").length;

  // After several exchanges, gently suggest finalizing.
  if (userTurns >= 4 && Math.random() < 0.6) {
    return pick(NUDGE_FINALIZE);
  }

  // Topic-based response with random variant.
  const candidates: string[] = [];

  if (/floor|stor(ies|y)|level/.test(last)) candidates.push(...FOLLOWUPS_FLOORS);
  if (/concrete|steel|wood|timber|brick|frame/.test(last)) candidates.push(...FOLLOWUPS_MATERIAL);
  if (/residen|home|apartment|hous|live|living|commerc|office|retail|shop|store|mixed/.test(last))
    candidates.push(...FOLLOWUPS_USE);
  if (/lot|acre|sq ?ft|square ?feet|width|depth|setback|street|corner|slope/.test(last))
    candidates.push(...FOLLOWUPS_LOT);
  if (/budget|cheap|afford|cost|expensive|tight/.test(last)) candidates.push(...FOLLOWUPS_BUDGET);

  // Sometimes just acknowledge briefly, no question. Adds breathing room.
  if (userTurns >= 1 && Math.random() < 0.18) {
    return pick(ACK) + " " + pick(OPEN_FOLLOWUPS);
  }

  // Sometimes reflect what the user said, then open question.
  if (last.length > 12 && Math.random() < 0.18) {
    return `${pick(REFLECT_PREFIXES)} ${last.split(/[.,]/)[0].trim()}. ${pick(
      OPEN_FOLLOWUPS
    )}`;
  }

  if (candidates.length > 0) return pick(candidates);
  return pick(OPEN_FOLLOWUPS);
}
