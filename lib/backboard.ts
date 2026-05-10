import { BackboardClient } from "backboard-sdk";
import type { SitePlan } from "./types";

const PLACEHOLDER_KEYS = new Set([
  "your_key_here",
  "your_backboard_key_here",
  "",
]);

function hasRealKey(): boolean {
  const key = process.env.BACKBOARD_API_KEY;
  return !!key && !PLACEHOLDER_KEYS.has(key);
}

let _client: BackboardClient | null = null;
function getClient(): BackboardClient | null {
  if (!hasRealKey()) return null;
  if (!_client) {
    _client = new BackboardClient({ apiKey: process.env.BACKBOARD_API_KEY! });
  }
  return _client;
}

function summarize(plan: SitePlan): string {
  const acres = ((plan.lot.width * plan.lot.depth) / 43560).toFixed(2);
  const parts = [`${acres} acre lot`];
  const buildings = plan.buildings ?? [];
  if (buildings.length === 1) {
    const b = buildings[0];
    parts.push(
      `${b.stories}-story${b.material ? ` ${b.material}` : ""} building`,
    );
  } else if (buildings.length > 1) {
    parts.push(`${buildings.length} buildings`);
  }
  if (plan.parking?.length) parts.push(`${plan.parking.length} parking spots`);
  return parts.join(", ");
}

export type SaveResult = {
  threadId: string | null;
  ok: boolean;
};

export async function saveSession(
  userId: string,
  threadId: string | null,
  prompt: string,
  sitePlan: SitePlan,
  notes?: string,
): Promise<SaveResult> {
  const client = getClient();
  if (!client) return { threadId, ok: false };

  try {
    const content = [
      `Save this site planning session for user ${userId}.`,
      `User prompt: ${prompt}`,
      notes ? `User notes about this plan: ${notes}` : "",
      `Resulting SitePlan JSON:`,
      JSON.stringify(sitePlan),
      `Summary: ${summarize(sitePlan)}.`,
      `Acknowledge briefly. Future requests on this thread may ask you to recall past sessions, describe patterns in this user's preferences, or answer chat questions about their history.`,
    ]
      .filter(Boolean)
      .join("\n");

    const response = await client.sendMessage({
      content,
      memory: "Auto",
      ...(threadId ? { threadId } : {}),
    });

    let newThreadId = threadId;
    if (
      response &&
      typeof response === "object" &&
      "threadId" in response &&
      typeof response.threadId === "string" &&
      response.threadId
    ) {
      newThreadId = response.threadId;
    }
    return { threadId: newThreadId, ok: true };
  } catch (err) {
    console.error("[backboard] saveSession failed", err);
    return { threadId, ok: false };
  }
}

export async function getPreferences(
  threadId: string | null,
): Promise<string> {
  if (!threadId) return "";
  const client = getClient();
  if (!client) return "";

  try {
    const response = await client.sendMessage({
      content:
        "Based on the past site plans you've stored for this user, what design preferences do you observe? Look for patterns in: building material (wood/brick/stucco/etc), number of stories, building footprint size, presence of parking, lot size, structure type. Respond with 1-3 short bullet points like '- prefers wood construction'. If you have fewer than 2 past plans, respond with exactly 'NONE'. Do NOT preface with explanation.",
      threadId,
    });

    const content =
      response && typeof response === "object" && "content" in response
        ? (response.content as string | null)
        : null;
    if (typeof content !== "string") return "";
    const trimmed = content.trim();
    if (!trimmed || trimmed.toUpperCase() === "NONE") return "";
    return trimmed;
  } catch (err) {
    console.error("[backboard] getPreferences failed", err);
    return "";
  }
}

export async function chatWithHistory(
  threadId: string | null,
  question: string,
): Promise<string> {
  if (!threadId) {
    return "No past plans saved yet — generate a plan first to start your memory.";
  }
  const client = getClient();
  if (!client) return "Memory service is not configured.";

  try {
    const response = await client.sendMessage({
      content: `User question about their past site plans: "${question}"\n\nAnswer based ONLY on the plans you've stored for this user. Be concise — 2-3 sentences max. If you don't have enough information to answer, say so plainly.`,
      threadId,
    });
    const content =
      response && typeof response === "object" && "content" in response
        ? (response.content as string | null)
        : null;
    return typeof content === "string" && content.trim()
      ? content.trim()
      : "No response.";
  } catch (err) {
    console.error("[backboard] chatWithHistory failed", err);
    return "Memory service errored. Try again in a moment.";
  }
}
