"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { downloadPlan } from "@/lib/exportPlan";
import { getPlans, updatePlanNotes, type PastPlan } from "@/lib/pastPlansDb";
import { getUserId, getThreadId, setThreadId } from "@/lib/userIdentity";

type Props = {
  onLoad?: (prompt: string) => void;
};

async function pushNotesToMemory(plan: PastPlan, notes: string): Promise<void> {
  try {
    const r = await fetch("/api/save-memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: getUserId(),
        threadId: getThreadId(),
        prompt: plan.prompt,
        sitePlan: plan.sitePlan,
        notes,
        kind: "note-update",
      }),
    });
    const d = await r.json();
    if (d?.threadId && typeof d.threadId === "string") {
      setThreadId(d.threadId);
    }
  } catch {
    // best-effort
  }
}

export default function PastPlans({ onLoad }: Props = {}) {
  const setPromptInStore = useStore((s) => s.setPrompt);
  const loadImportedPlan = useStore((s) => s.loadImportedPlan);
  const router = useRouter();
  const handleLoadPrompt = onLoad ?? setPromptInStore;
  const handleOpenSaved = (s: PastPlan) => {
    loadImportedPlan({
      plan: s.sitePlan,
      prompt: s.prompt,
      steps: [],
    });
    router.push("/plan");
  };
  const [history, setHistory] = useState<PastPlan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftNotes, setDraftNotes] = useState("");
  const [expanded, setExpanded] = useState(false);
  const COLLAPSED_COUNT = 3;

  const refetch = useCallback(async (): Promise<void> => {
    try {
      const plans = await getPlans();
      setHistory(plans);
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

  const startEdit = (s: PastPlan) => {
    setEditingId(s.id);
    setDraftNotes(s.notes ?? "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraftNotes("");
  };

  const saveNotes = async (s: PastPlan) => {
    const notes = draftNotes.trim();
    const updated = await updatePlanNotes(s.id, notes);
    if (updated) {
      setHistory((h) =>
        h ? h.map((p) => (p.id === s.id ? updated : p)) : h,
      );
      void pushNotesToMemory(updated, notes);
    }
    cancelEdit();
  };

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
        {(expanded ? history : history?.slice(0, COLLAPSED_COUNT))?.map((s) => {
          const isEditing = editingId === s.id;
          return (
            <div
              key={s.id}
              className="rounded border border-rule/60 bg-ink/40 backdrop-blur-md"
            >
              <div className="flex items-start gap-2 px-3 py-2">
                <p className="flex-1 font-mono text-xs sm:text-[13px] text-mute line-clamp-2">
                  {s.prompt}
                </p>
                <button
                  onClick={() =>
                    downloadPlan({ prompt: s.prompt, plan: s.sitePlan, steps: [] })
                  }
                  title="download this plan as a JSON file"
                  className="shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-mute hover:text-accent transition-colors px-2 py-1 cursor-pointer"
                >
                  export ↓
                </button>
                <button
                  onClick={() => handleOpenSaved(s)}
                  title="open the saved plan instantly (no api call)"
                  className="shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-mute hover:text-accent transition-colors px-2 py-1 cursor-pointer"
                >
                  open ↗
                </button>
                <button
                  onClick={() => handleLoadPrompt(s.prompt)}
                  title="put this prompt back in the input (will call gemini again)"
                  className="shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-mute/70 hover:text-accent transition-colors px-2 py-1 cursor-pointer"
                >
                  re-run ↵
                </button>
              </div>

              <div className="px-3 pb-2">
                {isEditing ? (
                  <div className="space-y-1.5">
                    <textarea
                      value={draftNotes}
                      onChange={(e) => setDraftNotes(e.target.value)}
                      placeholder="notes about this plan… (e.g. 'for the Brown family, modern look, $500k')"
                      rows={2}
                      autoFocus
                      className="w-full font-mono text-[11px] text-mute bg-ink/30 border border-rule/40 rounded px-2 py-1 resize-none focus:outline-none focus:border-accent/60"
                    />
                    <div className="flex gap-1.5 justify-end">
                      <button
                        onClick={cancelEdit}
                        className="font-mono text-[10px] uppercase tracking-[0.2em] text-mute/60 hover:text-mute transition-colors px-2 py-1 cursor-pointer"
                      >
                        cancel
                      </button>
                      <button
                        onClick={() => void saveNotes(s)}
                        className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent hover:opacity-80 transition-opacity px-2 py-1 cursor-pointer"
                      >
                        save note
                      </button>
                    </div>
                  </div>
                ) : s.notes ? (
                  <button
                    onClick={() => startEdit(s)}
                    title="edit notes"
                    className="block w-full text-left font-mono text-[11px] text-mute/70 italic hover:text-mute transition-colors cursor-pointer"
                  >
                    {s.notes}
                  </button>
                ) : (
                  <button
                    onClick={() => startEdit(s)}
                    className="font-mono text-[10px] uppercase tracking-[0.2em] text-mute/40 hover:text-accent transition-colors cursor-pointer"
                  >
                    + add note
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {history && history.length > COLLAPSED_COUNT && (
        <div className="text-center pt-1">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-mute/70 hover:text-accent transition-colors cursor-pointer"
          >
            {expanded
              ? "see less ↑"
              : `see ${history.length - COLLAPSED_COUNT} more ↓`}
          </button>
        </div>
      )}
    </div>
  );
}
