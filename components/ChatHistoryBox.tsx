"use client";
import { useState } from "react";
import { getThreadId } from "@/lib/userIdentity";

type Turn = { role: "user" | "ai"; text: string };

export default function ChatHistoryBox() {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);

  const ask = async (): Promise<void> => {
    const q = question.trim();
    if (!q || loading) return;
    setQuestion("");
    setTurns((t) => [...t, { role: "user", text: q }]);
    setLoading(true);
    try {
      const r = await fetch("/api/chat-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: getThreadId(), question: q }),
      });
      const d = await r.json();
      const answer =
        typeof d?.answer === "string" && d.answer
          ? d.answer
          : "Couldn't reach memory service.";
      setTurns((t) => [...t, { role: "ai", text: answer }]);
    } catch {
      setTurns((t) => [
        ...t,
        { role: "ai", text: "Network error reaching memory." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl space-y-2">
      <div className="text-[10px] uppercase tracking-[0.2em] text-mute/70 text-center font-mono">
        ask your history
      </div>

      {turns.length > 0 && (
        <div className="space-y-1.5 max-h-64 overflow-y-auto rounded border border-rule/60 bg-ink/40 backdrop-blur-md p-3">
          {turns.map((t, i) => (
            <div
              key={i}
              className={
                t.role === "user"
                  ? "font-mono text-xs text-mute"
                  : "font-mono text-xs text-accent/90 italic"
              }
            >
              <span className="text-mute/40 mr-2">
                {t.role === "user" ? ">" : "·"}
              </span>
              {t.text}
            </div>
          ))}
          {loading && (
            <div className="font-mono text-xs text-mute/50 italic">
              <span className="text-mute/40 mr-2">·</span>
              thinking…
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 items-stretch">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void ask();
          }}
          placeholder='try "what plans had parking?" or "what materials do I usually use?"'
          className="flex-1 font-mono text-xs sm:text-[13px] text-mute bg-ink/30 border border-rule/60 rounded px-3 py-2 focus:outline-none focus:border-accent/60"
        />
        <button
          onClick={() => void ask()}
          disabled={loading || !question.trim()}
          className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity px-3 cursor-pointer"
        >
          ask
        </button>
      </div>
    </div>
  );
}
