"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { parseImportedPlan } from "@/lib/exportPlan";

export default function ImportPlanButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const loadImportedPlan = useStore((s) => s.loadImportedPlan);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    try {
      const text = await file.text();
      const parsed = parseImportedPlan(text);
      loadImportedPlan({
        plan: parsed.plan,
        steps: parsed.steps,
        prompt: parsed.prompt,
      });
      router.push("/plan");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to import plan.");
    }
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          // Reset so picking the same file twice still triggers change.
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="font-mono text-[10px] uppercase tracking-[0.2em] text-mute hover:text-accent transition-colors px-3 py-1.5 rounded border border-rule/60 hover:border-accent bg-ink/30 backdrop-blur-md cursor-pointer"
      >
        import plan ↑
      </button>
      {error && (
        <span className="font-mono text-[10px] text-red-400 mt-0.5">
          {error}
        </span>
      )}
    </div>
  );
}
