import { promises as fs } from "fs";
import path from "path";
import { BackboardClient } from "backboard-sdk";
import type { SitePlan } from "./types";

export type StoredSession = {
  id: string;
  userId: string;
  prompt: string;
  sitePlan: SitePlan;
  createdAt: string;
};

const PLACEHOLDER_KEY = "your_key_here";

function hasRealKey(): boolean {
  const key = process.env.BACKBOARD_API_KEY;
  return Boolean(key) && key !== PLACEHOLDER_KEY;
}

let _client: BackboardClient | null = null;
function getClient(): BackboardClient | null {
  if (!hasRealKey()) return null;
  if (!_client) {
    _client = new BackboardClient({ apiKey: process.env.BACKBOARD_API_KEY! });
  }
  return _client;
}

const mockStore: StoredSession[] = [];
const threadIdByUser = new Map<string, string>();

const THREADS_FILE = path.join(process.cwd(), ".backboard-threads.json");

async function hydrateThreadFromDisk(userId: string): Promise<void> {
  if (threadIdByUser.has(userId)) return;
  try {
    const raw = await fs.readFile(THREADS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const threadId = (parsed as Record<string, unknown>)[userId];
      if (typeof threadId === "string" && threadId) {
        threadIdByUser.set(userId, threadId);
      }
    }
  } catch {
    // missing or unreadable file is expected on first run; ignore
  }
}

async function persistThreadId(userId: string, threadId: string): Promise<void> {
  try {
    let obj: Record<string, string> = {};
    try {
      const raw = await fs.readFile(THREADS_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        obj = parsed as Record<string, string>;
      }
    } catch {
      // file may not exist yet; start fresh
    }
    obj[userId] = threadId;
    await fs.writeFile(THREADS_FILE, JSON.stringify(obj, null, 2), "utf-8");
  } catch (err) {
    console.error("[backboard] persistThreadId failed", err);
  }
}

function summarize(plan: SitePlan): string {
  const acres = ((plan.lot.width * plan.lot.depth) / 43560).toFixed(2);
  const parts = [`${acres} acre lot`];
  if (plan.building) parts.push(`${plan.building.stories}-story building`);
  if (plan.parking?.length) parts.push(`${plan.parking.length} parking spots`);
  return parts.join(", ");
}

function extractJsonArray(text: string): unknown[] {
  const trimmed = text.trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // fall through to fenced/embedded extraction
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      const parsed = JSON.parse(fence[1].trim());
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // ignore
    }
  }
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1));
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // ignore
    }
  }
  return [];
}

export async function saveSession(
  userId: string,
  sitePlan: SitePlan,
  prompt: string
): Promise<StoredSession> {
  const session: StoredSession = {
    id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    prompt,
    sitePlan,
    createdAt: new Date().toISOString(),
  };

  const client = getClient();
  if (!client) {
    console.log("[backboard:mock] saveSession", { userId, prompt });
    mockStore.unshift(session);
    return session;
  }

  try {
    await hydrateThreadFromDisk(userId);
    const existingThreadId = threadIdByUser.get(userId);
    const content = [
      `Save this site planning session for user ${userId}.`,
      `User prompt: ${prompt}`,
      `Resulting SitePlan JSON:`,
      JSON.stringify(sitePlan),
      `Summary: ${summarize(sitePlan)}.`,
      `Acknowledge briefly. Future requests on this thread may ask you to recall past sessions as a JSON array of {prompt, sitePlan} objects.`,
    ].join("\n");

    const response = await client.sendMessage({
      content,
      memory: "Auto",
      ...(existingThreadId ? { threadId: existingThreadId } : {}),
    });

    if (
      response &&
      typeof response === "object" &&
      "threadId" in response &&
      response.threadId &&
      typeof response.threadId === "string"
    ) {
      threadIdByUser.set(userId, response.threadId);
      await persistThreadId(userId, response.threadId);
    }
  } catch (err) {
    console.error("[backboard] saveSession failed", err);
  }

  return session;
}

export async function getSessionHistory(
  userId: string
): Promise<StoredSession[]> {
  const client = getClient();
  if (!client) {
    console.log("[backboard:mock] getSessionHistory", { userId });
    return mockStore.filter((s) => s.userId === userId).slice(0, 5);
  }

  await hydrateThreadFromDisk(userId);
  const threadId = threadIdByUser.get(userId);
  if (!threadId) return [];

  try {
    const response = await client.sendMessage({
      content:
        "List the last 5 site planning sessions you have stored for this user, most recent first. Respond ONLY with a raw JSON array of objects shaped {\"prompt\": string, \"sitePlan\": object}. No prose, no markdown, no commentary. If you have no sessions, return [].",
      threadId,
    });

    const content =
      response && typeof response === "object" && "content" in response
        ? (response.content as string | null)
        : null;
    if (!content) return [];

    const arr = extractJsonArray(content);
    const sessions: StoredSession[] = [];
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const obj = item as { prompt?: unknown; sitePlan?: unknown };
      if (typeof obj.prompt !== "string") continue;
      if (!obj.sitePlan || typeof obj.sitePlan !== "object") continue;
      sessions.push({
        id: `bb_${sessions.length}_${Date.now()}`,
        userId,
        prompt: obj.prompt,
        sitePlan: obj.sitePlan as SitePlan,
        createdAt: new Date().toISOString(),
      });
      if (sessions.length >= 5) break;
    }
    return sessions;
  } catch (err) {
    console.error("[backboard] getSessionHistory failed", err);
    return [];
  }
}

export async function buildMemoryContext(userId: string): Promise<string> {
  const history = await getSessionHistory(userId);
  if (history.length === 0) return "";

  const lines = history.map(
    (s, i) =>
      `  ${i + 1}. "${s.prompt}" → ${summarize(s.sitePlan)}`
  );

  return [
    `User previously planned:`,
    ...lines,
    `Use this history to infer reasonable defaults when the current prompt is vague.`,
  ].join("\n");
}
