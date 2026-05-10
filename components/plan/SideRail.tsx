"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useStore } from "@/lib/store";
import Step from "./Step";
import AccentPicker from "@/components/AccentPicker";
import CompartmentFire from "./CompartmentFire";
import MintNftButton from "./MintNftButton";
import { downloadPlan } from "@/lib/exportPlan";
import { isSpeechSupported } from "@/lib/speech";

// Hammer renders inside the slot directly — it is part of the panel DOM,
// not a body-level fixed overlay positioned via getBoundingClientRect.
// That means it moves with the panel automatically (scroll, layout reflow,
// transform — anything). No tracking math, no drift.
const Hammer3D = dynamic(() => import("@/components/hammer/Hammer3D"), {
  ssr: false,
  loading: () => null,
});

export default function SideRail() {
  const { prompt, steps, running } = useStore();
  const plan = useStore((s) => s.plan);
  const loading = useStore((s) => s.loading);
  const runFromPrompt = useStore((s) => s.runFromPrompt);
  const modifyFromPrompt = useStore((s) => s.modifyFromPrompt);
  const voiceSupported = useStore((s) => s.voiceSupported);
  const setVoiceSupported = useStore((s) => s.setVoiceSupported);
  const setVoiceModifyOpen = useStore((s) => s.setVoiceModifyOpen);
  const canExport = !!plan && !running;
  const canVoiceModify = !running && !!prompt.trim() && voiceSupported;

  const waiting = (loading || running) && plan === null;
  const forging = running && plan !== null;

  // Detect speech support if the user landed on /plan directly (e.g. via a
  // shared URL) and never went through the landing page where this is set.
  useEffect(() => {
    if (!voiceSupported) {
      setVoiceSupported(isSpeechSupported());
    }
  }, [voiceSupported, setVoiceSupported]);

  const [draft, setDraft] = useState(prompt);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Keep local draft in sync when the canonical prompt changes (new run, import, etc.)
  // — but don't clobber what the user is currently typing.
  useEffect(() => {
    if (document.activeElement !== taRef.current) {
      setDraft(prompt);
    }
  }, [prompt]);

  // Auto-grow the textarea so the brief stays fully visible while editing.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  const submitEdit = () => {
    const next = draft.trim();
    if (!next || next === prompt || running) return;
    void runFromPrompt(next);
  };

  const submitModify = () => {
    const next = draft.trim();
    if (!next || next === prompt || running || !plan) return;
    void modifyFromPrompt(next);
  };

  return (
    <motion.aside
      initial={{ x: -40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="glass absolute top-4 left-4 bottom-4 w-[400px] rounded-2xl flex flex-col overflow-hidden z-10"
    >
      <div className="px-6 pt-6 pb-4 border-b border-rule/60">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            aria-label="back to parcel"
            className="font-mono text-[10px] uppercase tracking-[0.25em] text-mute hover:text-accent transition-colors"
          >
            ← back
          </Link>
          <AccentPicker />
        </div>
      </div>

      <div
        id="hammer-slot"
        className="relative h-[260px] border-b border-rule/60"
      >
        <CompartmentFire />
        <div className="absolute inset-0">
          <Hammer3D
            isLoading={waiting}
            forging={forging}
            subtle
            interactive
          />
        </div>
      </div>

      <div className="px-6 py-4 border-b border-rule/60">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] uppercase tracking-[0.2em] text-mute font-mono">
            brief
          </div>
          <div className="flex items-center gap-3">
            {draft.trim() !== prompt.trim() && draft.trim() && !running && (
              <>
                {plan && (
                  <button
                    type="button"
                    onClick={submitModify}
                    title="apply this change on top of the existing plan (Enter)"
                    className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent hover:opacity-80 transition-opacity"
                  >
                    modify ↵
                  </button>
                )}
                <button
                  type="button"
                  onClick={submitEdit}
                  title={
                    plan
                      ? "wipe and re-plan from scratch (⌘↵)"
                      : "draft a plan from this brief"
                  }
                  className="font-mono text-[10px] uppercase tracking-[0.2em] text-mute hover:text-accent transition-colors"
                >
                  {plan ? "rebuild" : "rebuild ↵"}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => canVoiceModify && setVoiceModifyOpen(true)}
              disabled={!canVoiceModify}
              title={
                !voiceSupported
                  ? "voice not supported in this browser"
                  : !prompt.trim()
                  ? "no plan to modify yet"
                  : running
                  ? "wait for the current build to finish"
                  : "talk with ai to modify the plan"
              }
              aria-label="talk with ai to modify the plan"
              className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-accent hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity cursor-pointer"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-3 h-3"
                aria-hidden="true"
              >
                <rect x="9" y="2" width="6" height="12" rx="3" />
                <path d="M5 11v1a7 7 0 0 0 14 0v-1" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
              voice
            </button>
          </div>
        </div>
        <textarea
          ref={taRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              // Cmd/Ctrl+Enter forces a full rebuild even when a plan exists.
              if (e.metaKey || e.ctrlKey || !plan) submitEdit();
              else submitModify();
            }
          }}
          disabled={running}
          rows={1}
          placeholder="—"
          className="mt-2 w-full bg-transparent outline-none resize-none font-mono text-[13px] text-paper/80 leading-relaxed placeholder:text-mute/60 disabled:opacity-50 disabled:cursor-not-allowed focus:text-paper transition-colors"
        />
      </div>

      <div
        className="flex items-center gap-2 px-6 py-3 border-b border-rule/60"
        title={
          running
            ? "the AI is calling tools to lay out the lot, place buildings, and validate setbacks"
            : steps.length
            ? "plan complete — click a building to open its floor plan"
            : "no plan yet — type a brief above and hit enter"
        }
      >
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

      <div className="px-6 py-4 border-t border-rule/60 space-y-3">
        <MintNftButton />
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() =>
              canExport && plan && downloadPlan({ prompt, plan, steps })
            }
            disabled={!canExport}
            title={
              canExport
                ? "download this plan as a JSON file"
                : "no plan to export yet"
            }
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-mute hover:text-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            export ↓
          </button>
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-mute/70">
            built for hackdavis · v1 alpha
          </span>
        </div>
      </div>
    </motion.aside>
  );
}
