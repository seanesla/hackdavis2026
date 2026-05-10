"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { motion } from "framer-motion";
import type { TranscriptEntry } from "@/lib/store";

type Props = {
  // Top-bar left chip (e.g. live status: "listening", "ai speaking")
  status: string;
  statusActive: boolean;
  // Top-bar right chip (e.g. "interview · 3 of 5")
  meta?: ReactNode;
  // Big prominent line under the header — current question or latest ai line
  highlight: ReactNode;
  // Optional row under the highlight (e.g. progress dots)
  highlightExtra?: ReactNode;
  // Conversation history (chat bubbles)
  transcript: TranscriptEntry[];
  // Bottom status bar
  liveText: string;
  liveTone?: "user" | "ai" | "muted";
  errorText?: string | null;
  // Optional inline action button under the live text (e.g. "tap to talk")
  inlineAction?: ReactNode;
  // Below the screen
  controls: ReactNode;
  hint?: ReactNode;
  // Outer fade
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

  // Auto-scroll to bottom when transcript grows.
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
      className={`absolute inset-0 z-30 flex flex-col items-center justify-center px-6 py-10 gap-6 ${
        hidden ? "pointer-events-none" : ""
      }`}
    >
      {/* The main "screen" */}
      <div className="pointer-events-auto w-full max-w-2xl rounded-2xl bg-ink/85 backdrop-blur-xl border border-accent/30 shadow-[0_0_50px_-10px_currentColor] text-accent flex flex-col h-[72vh] max-h-[640px] overflow-hidden">
        {/* Top status bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-rule/50 shrink-0">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                statusActive ? "bg-accent animate-pulse" : "bg-rule"
              }`}
            />
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-paper/80">
              {status}
            </span>
          </div>
          {meta && (
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-mute">
              {meta}
            </span>
          )}
        </div>

        {/* Highlight area: current question / latest ai line */}
        <div className="px-6 py-5 border-b border-rule/50 shrink-0 flex flex-col items-center gap-3">
          <div className="text-center font-mono text-lg sm:text-xl text-paper leading-snug">
            {highlight}
          </div>
          {highlightExtra}
        </div>

        {/* Chat log */}
        <div
          ref={logRef}
          className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3"
        >
          {transcript.length === 0 ? (
            <div className="flex-1 flex items-center justify-center font-mono text-[11px] text-mute/60 italic">
              conversation will appear here…
            </div>
          ) : (
            transcript.map((entry, i) =>
              entry.who === "ai" ? (
                <div key={i} className="flex justify-start">
                  <div className="max-w-[80%] bg-accent/10 border border-accent/30 rounded-2xl rounded-tl-sm px-4 py-2.5">
                    <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-accent/90 mb-1">
                      ai
                    </div>
                    <div className="font-mono text-sm text-paper leading-snug whitespace-pre-wrap">
                      {entry.text}
                    </div>
                  </div>
                </div>
              ) : (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[80%] bg-ink/60 border border-rule rounded-2xl rounded-tr-sm px-4 py-2.5">
                    <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-mute/80 mb-1 text-right">
                      you
                    </div>
                    <div className="font-mono text-sm text-paper leading-snug whitespace-pre-wrap">
                      {entry.text}
                    </div>
                  </div>
                </div>
              )
            )
          )}
        </div>

        {/* Live status footer */}
        <div className="px-5 py-3 border-t border-rule/50 shrink-0 min-h-[3.5rem] flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                liveTone === "user"
                  ? "bg-accent animate-pulse"
                  : liveTone === "ai"
                  ? "bg-accent"
                  : "bg-rule"
              }`}
            />
            <span
              className={`font-mono text-sm italic ${
                liveTone === "user" ? "text-paper" : "text-mute"
              }`}
            >
              {liveText}
            </span>
            {inlineAction && <div className="ml-auto">{inlineAction}</div>}
          </div>
          {errorText && (
            <div className="font-mono text-[10px] text-red-400 pl-4">
              {errorText}
            </div>
          )}
        </div>
      </div>

      {/* Controls outside the screen */}
      <div className="pointer-events-auto flex items-center gap-8">{controls}</div>

      {hint && (
        <div className="pointer-events-auto font-mono text-[10px] uppercase tracking-[0.2em] text-mute/60">
          {hint}
        </div>
      )}
    </motion.div>
  );
}
