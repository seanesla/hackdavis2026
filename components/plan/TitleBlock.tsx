"use client";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useCameraView } from "@/lib/cameraView";
import { chooseScaleFt } from "./ScaleBar";

// Fake-but-stable sheet number so the title block doesn't change every render.
function makeSheetNumber(prompt: string) {
  if (!prompt) return "SP-1";
  let h = 0;
  for (let i = 0; i < prompt.length; i++) h = (h * 31 + prompt.charCodeAt(i)) | 0;
  const n = (Math.abs(h) % 99) + 1;
  return `SP-${String(n).padStart(2, "0")}`;
}

// Engineering-drawing title block — the small information rectangle in the
// corner of every CE deliverable. Project / Drawn / Date / Scale / Sheet.
// Anchored at bottom-right, paired with the ScaleBar directly above it so
// the visual scale bar and the textual scale read as a single legend block.
export default function TitleBlock() {
  const prompt = useStore((s) => s.prompt);
  const distance = useCameraView((s) => s.distance);
  const fov = useCameraView((s) => s.fov);
  const canvasHeight = useCameraView((s) => s.canvasHeight);

  // Date is computed in a useEffect so the initial server render and the
  // initial client hydration render both produce an empty string — using
  // `new Date()` directly during render captures server time on SSR and
  // client time on hydration, which can disagree across timezones / cache
  // staleness and trip a hydration mismatch.
  const [dateStr, setDateStr] = useState("");
  useEffect(() => {
    setDateStr(
      new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
    );
  }, []);

  const project = (prompt?.trim() || "untitled site").slice(0, 60);
  const sheet = useMemo(() => makeSheetNumber(prompt ?? ""), [prompt]);
  const { feet } = chooseScaleFt(distance, fov, canvasHeight);
  const scaleStr = `1” = ${feet} ft`;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute bottom-6 right-6 z-20 select-none"
    >
      <div className="bg-ink/55 backdrop-blur-md border border-paper/15 rounded-md px-3 py-2 shadow-[0_4px_18px_-4px_rgba(0,0,0,0.4)] min-w-[260px]">
        <div className="font-mono text-[8px] uppercase tracking-[0.25em] text-paper/45 mb-1.5">
          parcel · site plan
        </div>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 font-mono text-[10px] leading-tight">
          <dt className="text-mute uppercase tracking-[0.15em] text-[8px]">project</dt>
          <dd className="text-paper/90 truncate">{project}</dd>
          <dt className="text-mute uppercase tracking-[0.15em] text-[8px]">drawn</dt>
          <dd className="text-paper/90">parcel · ai</dd>
          <dt className="text-mute uppercase tracking-[0.15em] text-[8px]">date</dt>
          <dd className="text-paper/90">{dateStr}</dd>
          <dt className="text-mute uppercase tracking-[0.15em] text-[8px]">scale</dt>
          <dd className="text-paper/90">{scaleStr}</dd>
          <dt className="text-mute uppercase tracking-[0.15em] text-[8px]">sheet</dt>
          <dd className="text-paper/90">{sheet}</dd>
        </dl>
      </div>
    </div>
  );
}
