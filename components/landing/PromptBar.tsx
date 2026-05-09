"use client";
import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";

type Props = {
  value: string;
  onValueChange: (v: string) => void;
  onSubmit: () => void;
};

export default function PromptBar({ value, onValueChange, onSubmit }: Props) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleSubmit = () => {
    if (!value.trim()) {
      inputRef.current?.focus();
      return;
    }
    onSubmit();
    // Navigation handled by parent (after wipe transition).
    setTimeout(() => {
      router.push(`/plan?prompt=${encodeURIComponent(value)}`);
    }, 650);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1.3, duration: 0.6 }}
      className="relative w-full max-w-2xl"
    >
      <div className="relative flex items-center gap-3 px-5 py-4 rounded-md border border-rule bg-ink/40 backdrop-blur-md">
        <span className="font-mono text-xs text-accent select-none">›</span>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
          }}
          placeholder="describe a site…"
          className="flex-1 bg-transparent outline-none text-paper placeholder:text-mute/60 font-mono text-sm sm:text-base"
        />
        <button
          onClick={handleSubmit}
          aria-label="plan"
          className="font-mono text-xs text-mute hover:text-accent transition-colors"
        >
          enter ↵
        </button>
        <div
          className="absolute left-0 -bottom-px h-[1px] bg-accent transition-all duration-300 ease-out"
          style={{ width: focused ? "100%" : "0%" }}
        />
      </div>
    </motion.div>
  );
}
