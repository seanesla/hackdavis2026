"use client";
import { ACCENTS, useAccent } from "@/lib/accent";

export default function AccentPicker({
  align = "row",
}: {
  align?: "row" | "col";
}) {
  const { accent, setAccent } = useAccent();
  return (
    <div
      className={`flex ${align === "col" ? "flex-col" : "flex-row"} gap-1.5 items-center`}
      role="radiogroup"
      aria-label="accent color"
    >
      {ACCENTS.map((a) => {
        const active = a.name === accent.name;
        return (
          <button
            key={a.name}
            role="radio"
            aria-checked={active}
            aria-label={a.name}
            onClick={() => setAccent(a)}
            className={`relative w-3 h-3 rounded-full transition-transform duration-200 hover:scale-125 cursor-pointer ${
              active ? "scale-110 ring-1 ring-offset-2 ring-offset-ink ring-paper/40" : ""
            }`}
            style={{ background: a.hex }}
          />
        );
      })}
    </div>
  );
}
