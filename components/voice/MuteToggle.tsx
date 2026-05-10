"use client";
import { useStore } from "@/lib/store";

export default function MuteToggle() {
  const muted = useStore((s) => s.muted);
  const setMuted = useStore((s) => s.setMuted);

  const handleClick = () => {
    setMuted(!muted);
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={handleClick}
        title={muted ? "mic muted — click to unmute" : "mic on — click to mute"}
        aria-label={muted ? "unmute microphone" : "mute microphone"}
        aria-pressed={muted}
        className={`relative flex items-center justify-center w-14 h-14 rounded-full border-2 transition-colors duration-200 ${
          muted
            ? "border-mute/40 bg-ink/40 text-mute hover:text-paper hover:border-paper"
            : "border-accent bg-accent/15 text-accent hover:bg-accent/25 shadow-[0_0_22px_-4px_currentColor]"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-6 h-6"
          aria-hidden="true"
        >
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 11v1a7 7 0 0 0 14 0v-1" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
          {muted && <line x1="4" y1="4" x2="20" y2="20" />}
        </svg>
      </button>
      <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-mute/70 select-none">
        {muted ? "mic off" : "mic on"}
      </span>
    </div>
  );
}
