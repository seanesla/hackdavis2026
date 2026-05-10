// Debug-mode-only performance logger.
//
// Calls are no-ops unless the user has flipped on the debug overlay
// (Shift+D, or the on-screen toggle on /plan). That way the verbose
// timing output never spams a real user's console.
//
// Usage:
//   perfLog("hammer3d:mount", performance.now() - t0);
//   perfMark("scene:first-frame");

import { useDebugStore } from "@/lib/debugStore";

function isOn(): boolean {
  // Read once, synchronously. Works in client and during SSR (returns false).
  if (typeof window === "undefined") return false;
  try {
    return useDebugStore.getState().enabled;
  } catch {
    return false;
  }
}

export function perfLog(label: string, valueMs?: number, extra?: unknown): void {
  if (!isOn()) return;
  const ms = typeof valueMs === "number" ? `${valueMs.toFixed(1)}ms` : "";
  // Single tagged line so users can filter the console with `[perf]`.
  if (extra !== undefined) {
    console.log(`[perf] ${label} ${ms}`.trim(), extra);
  } else {
    console.log(`[perf] ${label} ${ms}`.trim());
  }
}

export function perfMark(label: string): void {
  if (!isOn()) return;
  if (typeof performance !== "undefined") {
    try {
      performance.mark(`perf:${label}`);
    } catch {
      // ignore
    }
  }
  console.log(`[perf] mark ${label} @${Math.round(performance.now())}ms`);
}

// Returns a function that, when called, logs the elapsed time since the
// timer was started. No-op when debug is off.
export function perfTimer(label: string): () => void {
  if (!isOn()) return () => {};
  const t0 = performance.now();
  return () => perfLog(label, performance.now() - t0);
}
