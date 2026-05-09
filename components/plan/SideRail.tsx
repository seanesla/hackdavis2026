"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import Step from "./Step";
import AccentPicker from "@/components/AccentPicker";

export default function SideRail() {
  const prompt = useStore((s) => s.prompt);
  const steps = useStore((s) => s.steps);
  const running = useStore((s) => s.running);
  const runFromPrompt = useStore((s) => s.runFromPrompt);
  const router = useRouter();

  const [draft, setDraft] = useState(prompt);

  // Keep the textarea synced when the store's prompt changes (e.g. on first
  // landing-page submit). Doesn't clobber edits in progress because effect
  // only fires when the underlying `prompt` value actually changes.
  useEffect(() => {
    setDraft(prompt);
  }, [prompt]);

  const submit = () => {
    const trimmed = draft.trim();
    if (!trimmed || running || trimmed === prompt) return;
    // Reflect the new prompt in the URL so refreshing reproduces this run.
    router.replace(`/plan?prompt=${encodeURIComponent(trimmed)}`);
    runFromPrompt(trimmed);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  const dirty = draft.trim() !== prompt && draft.trim().length > 0;

  return (
    <motion.aside
      initial={{ x: -40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="glass w-[400px] shrink-0 h-screen flex flex-col"
    >
      <div className="px-6 pt-6 pb-4 border-b border-rule/60">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="font-mono text-[10px] uppercase tracking-[0.25em] text-mute hover:text-accent transition-colors"
          >
            ← parcel
          </Link>
          <AccentPicker />
        </div>
        <div className="mt-5 text-[10px] uppercase tracking-[0.2em] text-mute font-mono">
          brief
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={running}
          rows={3}
          className="mt-2 w-full resize-none bg-transparent font-mono text-[13px] text-paper/90 leading-relaxed focus:outline-none disabled:opacity-50 placeholder:text-mute/40"
          placeholder="describe the site…"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-mute/50">
            ⌘↵ to re-plan
          </span>
          <button
            onClick={submit}
            disabled={!dirty || running}
            className="font-mono text-[10px] uppercase tracking-[0.2em] px-2.5 py-1 rounded border border-rule/60 text-mute hover:text-accent hover:border-accent/40 disabled:opacity-30 disabled:hover:text-mute disabled:hover:border-rule/60 transition-colors"
          >
            re-plan
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 px-6 py-3 border-b border-rule/60">
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            running ? "bg-accent animate-pulse" : "bg-paper/40"
          }`}
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-mute">
          {running ? "planning" : steps.length ? "complete" : "idle"}
        </span>
      </div>

      <ol className="flex-1 overflow-y-auto px-6 py-2">
        {steps.map((s, i) => (
          <Step key={i} step={s} index={i} />
        ))}
      </ol>

      <div className="px-6 py-4 border-t border-rule/60 font-mono text-[10px] uppercase tracking-[0.25em] text-mute/70">
        stage 0 of construction
      </div>
    </motion.aside>
  );
}
