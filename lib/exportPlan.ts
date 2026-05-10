// Export / import a complete site plan as a JSON file.
// Lets users save a generated plan and reload it later (or share it) without
// paying for another Gemini call.

import type { SitePlan, Step } from "./types";

export type ExportedPlan = {
  version: 1;
  exportedAt: string;
  prompt: string;
  plan: SitePlan;
  steps: Step[];
};

export function downloadPlan(opts: {
  prompt: string;
  plan: SitePlan;
  steps: Step[];
}): void {
  if (typeof window === "undefined") return;
  const data: ExportedPlan = {
    version: 1,
    exportedAt: new Date().toISOString(),
    prompt: opts.prompt ?? "",
    plan: opts.plan,
    steps: opts.steps ?? [],
  };
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-");
  const slug =
    (opts.prompt || "plan")
      .slice(0, 40)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "plan";
  const a = document.createElement("a");
  a.href = url;
  a.download = `parcel-${slug}-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function parseImportedPlan(text: string): ExportedPlan {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Not a valid JSON file.");
  }
  if (!data || typeof data !== "object") {
    throw new Error("Plan file is empty or malformed.");
  }
  const obj = data as Partial<ExportedPlan>;
  if (!obj.plan || typeof obj.plan !== "object") {
    throw new Error("File doesn't contain a 'plan' object.");
  }
  const plan = obj.plan as Partial<SitePlan>;
  if (!plan.lot || typeof plan.lot.width !== "number" || typeof plan.lot.depth !== "number") {
    throw new Error("Plan is missing lot dimensions.");
  }
  if (!plan.setbacks) {
    throw new Error("Plan is missing setbacks.");
  }
  return {
    version: 1,
    exportedAt: typeof obj.exportedAt === "string" ? obj.exportedAt : new Date().toISOString(),
    prompt: typeof obj.prompt === "string" ? obj.prompt : "",
    plan: obj.plan as SitePlan,
    steps: Array.isArray(obj.steps) ? (obj.steps as Step[]) : [],
  };
}
