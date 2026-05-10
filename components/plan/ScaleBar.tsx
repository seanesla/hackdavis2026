"use client";
import { useCameraView } from "@/lib/cameraView";

const NICE_NUMBERS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];

// Convert camera state to a "nice" feet number whose pixel width is closest
// to but no larger than the target envelope. Shared between ScaleBar and
// TitleBlock so both display the same number.
export function chooseScaleFt(
  distance: number,
  fovDeg: number,
  canvasHeight: number
): { feet: number; barPx: number } {
  const fovRad = (fovDeg * Math.PI) / 180;
  const pxPerFt = canvasHeight / (2 * distance * Math.tan(fovRad / 2));
  const targetPx = 220;
  let feet = NICE_NUMBERS[0];
  for (const n of NICE_NUMBERS) {
    if (n * pxPerFt <= targetPx) feet = n;
    else break;
  }
  return { feet, barPx: Math.max(1, feet * pxPerFt) };
}

export default function ScaleBar() {
  const distance = useCameraView((s) => s.distance);
  const fov = useCameraView((s) => s.fov);
  const canvasHeight = useCameraView((s) => s.canvasHeight);
  const { feet, barPx } = chooseScaleFt(distance, fov, canvasHeight);

  return (
    <div className="pointer-events-none absolute bottom-6 right-6 z-20 flex flex-col items-end gap-1 select-none">
      <div className="flex items-baseline gap-1 font-mono text-[10px] uppercase tracking-[0.2em] text-paper/80">
        <span>0</span>
        <span className="opacity-30">·</span>
        <span>{feet} ft</span>
      </div>
      <svg width={barPx} height={10} className="overflow-visible">
        <rect
          x="0"
          y="3"
          width={barPx}
          height="4"
          fill="rgba(238,232,213,0.95)"
          stroke="rgba(15,15,18,0.8)"
          strokeWidth="0.5"
        />
        <rect
          x="0"
          y="3"
          width={barPx / 2}
          height="4"
          fill="rgba(15,15,18,0.85)"
        />
        <line
          x1="0.5"
          y1="0"
          x2="0.5"
          y2="10"
          stroke="rgba(238,232,213,0.95)"
          strokeWidth="1"
        />
        <line
          x1={barPx - 0.5}
          y1="0"
          x2={barPx - 0.5}
          y2="10"
          stroke="rgba(238,232,213,0.95)"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
}
