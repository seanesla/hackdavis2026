"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { downloadPlan } from "@/lib/exportPlan";
import type { SitePlan } from "@/lib/types";

const USER_ID = "hackathon-user-1";

type StoredSession = {
  id: string;
  userId: string;
  prompt: string;
  sitePlan: SitePlan;
  createdAt: string;
};

type Props = {
  onLoad?: (prompt: string) => void;
};

export default function PastPlans({ onLoad }: Props = {}) {
  const setPromptInStore = useStore((s) => s.setPrompt);
  const loadImportedPlan = useStore((s) => s.loadImportedPlan);
  const router = useRouter();
  const handleLoadPrompt = onLoad ?? setPromptInStore;
  const handleOpenSaved = (s: StoredSession) => {
    loadImportedPlan({
      plan: s.sitePlan,
      prompt: s.prompt,
      steps: [],
    });
    router.push("/plan");
  };
  const [history, setHistory] = useState<StoredSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async (): Promise<void> => {
    try {
      const r = await fetch(`/api/history?userId=${encodeURIComponent(USER_ID)}`);
      const data = await r.json();
      setHistory(data.history ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load history");
    }
  }, []);

  useEffect(() => {
    void refetch();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refetch);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refetch);
    };
  }, [refetch]);

  return (
    <div className="w-full max-w-2xl space-y-2">
      <div className="text-[10px] uppercase tracking-[0.2em] text-mute/70 text-center font-mono">
        past plans
      </div>

      {error && (
        <div className="text-xs text-accent/80 font-mono text-center">
          {error}
        </div>
      )}

      {!error && history === null && (
        <div className="text-xs text-mute/60 italic font-mono text-center">
          loading…
        </div>
      )}

      {!error && history?.length === 0 && (
        <div className="text-xs text-mute/60 italic font-mono text-center">
          no past plans yet
        </div>
      )}

      <div className="space-y-1.5">
        {history?.map((s) => (
          <div
            key={s.id}
            className="flex items-start gap-2 px-3 py-2 rounded border border-rule/60 bg-ink/40 backdrop-blur-md"
          >
            <p className="flex-1 font-mono text-xs sm:text-[13px] text-mute line-clamp-2">
              {s.prompt}
            </p>
            <button
              onClick={() =>
                downloadPlan({ prompt: s.prompt, plan: s.sitePlan, steps: [] })
              }
              title="download this plan as a JSON file"
              className="shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-mute hover:text-accent transition-colors px-2 py-1"
            >
              export ↓
            </button>
            <button
              onClick={() => handleOpenSaved(s)}
              title="open the saved plan instantly (no api call)"
              className="shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-mute hover:text-accent transition-colors px-2 py-1"
            >
              open ↗
            </button>
            <button
              onClick={() => handleLoadPrompt(s.prompt)}
              title="put this prompt back in the input (will call gemini again)"
              className="shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-mute/70 hover:text-accent transition-colors px-2 py-1"
            >
              re-run ↵
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
