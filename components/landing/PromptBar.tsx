"use client";
import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import PromptDropdown from "./PromptDropdown";

// Warm the heavy 3D chunks (R3F + three + Hammer3D) on the first sign of
// user intent so the fly-in animation isn't bottlenecked on a cold network
// fetch. The chunks are deferred off the landing critical path; we just
// pull them in a fraction of a second early. Idempotent — only runs once.
let prefetched3D = false;
function prefetch3DChunks() {
  if (prefetched3D || typeof window === "undefined") return;
  prefetched3D = true;
  // Fire-and-forget; bundler resolves these to the same chunks the
  // FloatingHammer + Scene dynamic imports would load.
  import("@/components/hammer/Hammer3D").catch(() => {});
}

type Props = {
  value: string;
  onValueChange: (v: string) => void;
  onSubmit: () => void;
};

export default function PromptBar({ value, onValueChange, onSubmit }: Props) {
  const [focused, setFocused] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Open the dropdown only when the user is "asking for help" — focused on
  // an empty input. As soon as they type, get out of the way.
  useEffect(() => {
    if (focused && value === "") setDropdownOpen(true);
    else if (value !== "") setDropdownOpen(false);
  }, [focused, value]);

  // Close on outside click so clicking inside the dropdown doesn't dismiss.
  useEffect(() => {
    if (!dropdownOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setFocused(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [dropdownOpen]);

  const handleSubmit = () => {
    if (!value.trim()) {
      inputRef.current?.focus();
      return;
    }
    onSubmit();
    setTimeout(() => {
      router.push(`/plan?prompt=${encodeURIComponent(value)}`);
    }, 650);
  };

  return (
    <motion.div
      ref={wrapperRef}
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
          onFocus={() => {
            setFocused(true);
            prefetch3DChunks();
          }}
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
      <PromptDropdown open={dropdownOpen} onLoadPrompt={onValueChange} />
    </motion.div>
  );
}
