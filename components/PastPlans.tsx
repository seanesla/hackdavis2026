"use client";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import type { SitePlan } from "@/lib/types";

const USER_ID = "hackathon-user-1";

type StoredSession = {
  id: string;
  userId: string;
  prompt: string;
  sitePlan: SitePlan;
  createdAt: string;
};

export default function PastPlans() {
  const setPrompt = useStore((s) => s.setPrompt);
  const [history, setHistory] = useState<StoredSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/history?userId=${encodeURIComponent(USER_ID)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setHistory(data.history ?? []);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load history");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">
        Past plans
      </div>

      {error && <div className="text-xs text-red-400">{error}</div>}

      {!error && history === null && (
        <div className="text-xs text-zinc-600 italic">Loading…</div>
      )}

      {!error && history?.length === 0 && (
        <div className="text-xs text-zinc-600 italic">No past plans yet</div>
      )}

      {history?.map((s) => (
        <div
          key={s.id}
          className="flex items-start gap-2 p-2 rounded bg-zinc-900/50 hover:bg-zinc-900 border border-zinc-800"
        >
          <p className="flex-1 text-xs text-zinc-300 line-clamp-2">
            {s.prompt}
          </p>
          <button
            onClick={() => setPrompt(s.prompt)}
            className="shrink-0 text-[10px] uppercase tracking-wider text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded border border-emerald-500/30 hover:border-emerald-400"
          >
            Load
          </button>
        </div>
      ))}
    </div>
  );
}
