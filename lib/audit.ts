// Lightweight site-plan audit. Runs purely off the SitePlan in memory — no
// network calls, no external services. Each check is one of:
//   pass  — meets the rule of thumb
//   warn  — soft issue (consider fixing)
//   fail  — hard issue (probably needs fixing)
//   info  — neutral note for context
// `fixPrompt` is the natural-language change the user would type to ask the
// agent to apply the fix; the AuditPill wires that into modifyFromPrompt.

import { isInsideSetbacks } from "./geometry";
import type { SitePlan } from "./types";

export type CheckStatus = "pass" | "warn" | "fail" | "info";

export type AuditCheck = {
  id: string;
  status: CheckStatus;
  label: string;
  detail: string;
  fixPrompt?: string;
};

export type AuditResult = {
  checks: AuditCheck[];
  passCount: number;
  warnCount: number;
  failCount: number;
};

const SQFT_PER_ACRE = 43560;

export function auditPlan(plan: SitePlan | null): AuditResult | null {
  if (!plan || !plan.lot || plan.lot.width <= 0 || plan.lot.depth <= 0) {
    return null;
  }

  const checks: AuditCheck[] = [];
  const buildings = plan.buildings ?? [];
  const trees = plan.trees ?? [];
  const walkways = plan.walkways ?? [];
  const lotArea = plan.lot.width * plan.lot.depth;
  const acres = lotArea / SQFT_PER_ACRE;

  // ── Zoning compliance ───────────────────────────────────────────────────
  // The agent is supposed to enforce setbacks server-side, but we re-check
  // here so the user gets visible confirmation. Doubles as a guard against
  // imported plans that bypassed the agent.
  if (buildings.length === 0) {
    checks.push({
      id: "zoning-empty",
      status: "info",
      label: "Zoning compliance",
      detail: "No buildings placed yet — nothing to check.",
    });
  } else {
    const violators = buildings.filter(
      (b) => !isInsideSetbacks(b, plan.lot, plan.setbacks),
    );
    if (violators.length === 0) {
      checks.push({
        id: "zoning-pass",
        status: "pass",
        label: "Zoning compliance",
        detail: `All ${buildings.length} building${buildings.length === 1 ? "" : "s"} respect front/back/side setbacks (${plan.setbacks.front}/${plan.setbacks.back}/${plan.setbacks.side} ft).`,
      });
    } else {
      checks.push({
        id: "zoning-fail",
        status: "fail",
        label: "Zoning compliance",
        detail: `${violators.length} building${violators.length === 1 ? "" : "s"} cross the setback line. Most municipalities require buildings to stay inside the buildable envelope.`,
        fixPrompt: "move every building inside the front, back, and side setback envelope.",
      });
    }
  }

  // ── Lot coverage ────────────────────────────────────────────────────────
  // Rule of thumb: residential infill targets 35-55% lot coverage; >70% is
  // typically over-built and forecloses tree canopy + on-site stormwater.
  if (buildings.length > 0) {
    const covered = buildings.reduce((sum, b) => sum + b.w * b.d, 0);
    const ratio = covered / lotArea;
    const pct = Math.round(ratio * 100);
    if (ratio > 0.7) {
      checks.push({
        id: "coverage-fail",
        status: "fail",
        label: "Lot coverage",
        detail: `Buildings cover ${pct}% of the lot. Most zoning codes cap residential coverage near 50% to leave room for landscaping and stormwater absorption.`,
        fixPrompt: "shrink the building footprints so total lot coverage drops below 50%.",
      });
    } else if (ratio > 0.5) {
      checks.push({
        id: "coverage-warn",
        status: "warn",
        label: "Lot coverage",
        detail: `Buildings cover ${pct}% of the lot. Tight but workable; consider 50% as a soft ceiling.`,
      });
    } else {
      checks.push({
        id: "coverage-pass",
        status: "pass",
        label: "Lot coverage",
        detail: `Buildings cover ${pct}% of the lot — plenty of room for landscaping and pervious surfaces.`,
      });
    }
  }

  // ── Pedestrian access ───────────────────────────────────────────────────
  // A site without any path from the street to the entrance is car-only.
  // Flag this as an accessibility + walkability issue.
  if (buildings.length > 0) {
    if (walkways.length === 0) {
      checks.push({
        id: "walkway-warn",
        status: "warn",
        label: "Pedestrian access",
        detail: "No walkway connects the street to any building entrance — pedestrians and wheelchair users have no defined path. ADA-equivalent guidance asks for at least one accessible route.",
        fixPrompt: "add a 6-foot-wide flagstone walkway from the street to the front door of each building.",
      });
    } else {
      checks.push({
        id: "walkway-pass",
        status: "pass",
        label: "Pedestrian access",
        detail: `${walkways.length} walkway${walkways.length === 1 ? "" : "s"} on the site — pedestrians can reach the building${buildings.length === 1 ? "" : "s"} without walking through traffic.`,
      });
    }
  }

  // ── Tree canopy / heat island ───────────────────────────────────────────
  // EPA + most municipal climate plans target ~40% canopy in residential
  // areas. Crude proxy: at least one tree per 1500 sqft of buildable area
  // for lots ≥ 0.25 acres.
  if (acres >= 0.25 && buildings.length > 0) {
    const buildable =
      Math.max(0, plan.lot.width - 2 * plan.setbacks.side) *
      Math.max(0, plan.lot.depth - plan.setbacks.front - plan.setbacks.back);
    const targetTrees = Math.max(3, Math.round(buildable / 1500));
    if (trees.length === 0) {
      checks.push({
        id: "canopy-warn",
        status: "warn",
        label: "Tree canopy",
        detail: `No trees on a ${acres.toFixed(2)} acre lot. Tree shade reduces summer surface temps by 20–45°F and is one of the cheapest climate-resilience moves.`,
        fixPrompt: `add ${targetTrees} oak trees around the perimeter for shade.`,
      });
    } else if (trees.length < targetTrees) {
      checks.push({
        id: "canopy-info",
        status: "info",
        label: "Tree canopy",
        detail: `${trees.length} tree${trees.length === 1 ? "" : "s"} placed; municipal climate guidance for this lot size suggests ~${targetTrees}.`,
      });
    } else {
      checks.push({
        id: "canopy-pass",
        status: "pass",
        label: "Tree canopy",
        detail: `${trees.length} trees — meets the ~${targetTrees} climate-resilience target for this lot size.`,
      });
    }
  }

  // ── Parking sanity ──────────────────────────────────────────────────────
  // Optional, only when there's parking. Flag accessibility-spec gap (1
  // accessible stall per ~25 stalls is the federal ADA minimum).
  const stalls = plan.parking?.length ?? 0;
  if (stalls >= 4) {
    checks.push({
      id: "parking-info",
      status: "info",
      label: "Accessible parking",
      detail: `${stalls} stalls on site. ADA requires at least 1 accessible space for lots of 1–25 stalls (van-accessible at 76+ stalls). The current renderer doesn't distinguish accessible stalls — flag the requirement to your engineer.`,
    });
  }

  const passCount = checks.filter((c) => c.status === "pass").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;
  const failCount = checks.filter((c) => c.status === "fail").length;

  return { checks, passCount, warnCount, failCount };
}
