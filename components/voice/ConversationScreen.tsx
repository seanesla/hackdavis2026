"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { motion } from "framer-motion";
import type { TranscriptEntry } from "@/lib/store";

type Props = {
  // Top-bar left chip (e.g., "listening", "ai speaking")
  status: string;
  statusActive: boolean;
  // Top-bar right chip (e.g., "interview · 3 of 5")
  meta?: ReactNode;
  // Big prominent line under the header — current question or latest AI line
  highlight: ReactNode;
  // Optional row under the highlight (e.g., progress dots)
  highlightExtra?: ReactNode;
  // Conversation history (chat bubbles)
  transcript: TranscriptEntry[];
  // Bottom live footer
  liveText: string;
  liveTone?: "user" | "ai" | "muted";
  errorText?: string | null;
  // Optional inline action button under the live text (e.g., "tap to talk")
  inlineAction?: ReactNode;
  // Buttons below the screen (mute, end)
  controls: ReactNode;
  hint?: ReactNode;
  // Outer fade — true = fade out and disable pointer events
  hidden?: boolean;
};

export default function ConversationScreen({
  status,
  statusActive,
  meta,
  highlight,
  highlightExtra,
  transcript,
  liveText,
  liveTone = "muted",
  errorText,
  inlineAction,
  controls,
  hint,
  hidden,
}: Props) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [transcript.length]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: hidden ? 0 : 1 }}
      transition={{ duration: hidden ? 1.2 : 0.4 }}
      className={`fixed inset-0 z-[95] ${hidden ? "pointer-events-none" : ""}`}
    >
      {/* Dim backdrop tint behind the card. Click-through stays disabled
          on the rest of the page — only the card itself is interactive. */}
      <div className="absolute inset-0 bg-ink/55 backdrop-blur-sm pointer-events-none" />

      <div className="relative h-full flex flex-col items-center justify-center px-6 py-10 gap-5">
        {/* The main "screen" — minimal: thin hairline border, soft glow, no
            section borders inside. Sections separate with whitespace. */}
        <div className="pointer-events-auto w-full max-w-3xl rounded-2xl bg-ink/70 backdrop-blur-2xl border border-paper/10 text-accent shadow-[0_8px_40px_-12px_rgba(0,0,0,0.6),0_0_50px_-15px_currentColor] flex flex-col h-[72vh] max-h-[640px] overflow-hidden">
          {/* Top status bar */}
          <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0">
            <div className="flex items-center gap-2">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  statusActive ? "bg-accent animate-pulse" : "bg-paper/20"
                }`}
              />
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-paper/60">
                {status}
              </span>
            </div>
            {meta && (
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-paper/35">
                {meta}
              </span>
            )}
          </div>

          {/* Highlight area: current question / latest AI line */}
          <div className="px-6 pt-2 pb-4 shrink-0 flex flex-col items-center gap-3">
            <div className="text-center font-mono text-base sm:text-lg text-paper/95 leading-snug">
              {highlight}
            </div>
            {highlightExtra}
          </div>

          {/* Chat log */}
          <div
            ref={logRef}
            className="flex-1 overflow-y-auto px-5 py-3 flex flex-col gap-2"
          >
            {transcript.length === 0 ? (
              <div className="flex-1 flex items-center justify-center font-mono text-[11px] text-paper/30 italic">
                conversation will appear here
              </div>
            ) : (
              transcript.map((entry, i) =>
                entry.who === "ai" ? (
                  <div key={i} className="flex justify-start">
                    <div className="max-w-[78%] bg-accent/8 rounded-2xl rounded-tl-md px-3.5 py-2 font-mono text-sm text-paper/90 leading-snug whitespace-pre-wrap">
                      {entry.text}
                    </div>
                  </div>
                ) : (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[78%] bg-paper/8 rounded-2xl rounded-tr-md px-3.5 py-2 font-mono text-sm text-paper/90 leading-snug whitespace-pre-wrap">
                      {entry.text}
                    </div>
                  </div>
                )
              )
            )}
          </div>

          {/* Live status footer — single hairline above for separation */}
          <div className="px-5 pt-3 pb-4 shrink-0 min-h-[3.5rem] flex flex-col gap-1 border-t border-paper/5">
            <div className="flex items-center gap-2.5">
              <span
                className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                  liveTone === "user"
                    ? "bg-accent animate-pulse"
                    : liveTone === "ai"
                    ? "bg-accent/80"
                    : "bg-paper/20"
                }`}
              />
              <span
                className={`font-mono text-sm italic truncate ${
                  liveTone === "user" ? "text-paper/90" : "text-paper/45"
                }`}
              >
                {liveText}
              </span>
              {inlineAction && <div className="ml-auto shrink-0">{inlineAction}</div>}
            </div>
            {errorText && (
              <div className="font-mono text-[10px] text-red-400/80 pl-4">
                {errorText}
              </div>
            )}
          </div>
        </div>

        {/* Controls outside the screen */}
        <div className="pointer-events-auto flex items-center gap-8">{controls}</div>

        {hint && (
          <div className="pointer-events-auto font-mono text-[10px] uppercase tracking-[0.2em] text-paper/40">
            {hint}
          </div>
        )}
      </div>
    </motion.div>
  );
}
