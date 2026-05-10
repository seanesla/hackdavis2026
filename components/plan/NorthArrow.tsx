"use client";
import { useCameraView } from "@/lib/cameraView";

// Compass widget. The inner SVG rotates so that the N tip always points
// at the world's +Z direction, regardless of the camera orbit. Drives
// off the camera-broadcast northAngle in radians.
export default function NorthArrow() {
  const angle = useCameraView((s) => s.northAngle);
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-4 right-4 z-20 h-16 w-16 rounded-full bg-ink/55 backdrop-blur-md border border-paper/15 flex items-center justify-center shadow-[0_4px_18px_-4px_rgba(0,0,0,0.4)]"
    >
      <svg
        viewBox="-12 -12 24 24"
        className="h-12 w-12"
        style={{ transform: `rotate(${angle}rad)`, transformOrigin: "center" }}
      >
        <circle
          cx="0"
          cy="0"
          r="10.5"
          fill="none"
          stroke="rgba(238,232,213,0.18)"
          strokeWidth="0.4"
        />
        {[0, 90, 180, 270].map((deg) => {
          const r = (deg * Math.PI) / 180;
          const x1 = Math.sin(r) * 10.5;
          const y1 = -Math.cos(r) * 10.5;
          const x2 = Math.sin(r) * 8.5;
          const y2 = -Math.cos(r) * 8.5;
          return (
            <line
              key={deg}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="rgba(238,232,213,0.4)"
              strokeWidth="0.5"
            />
          );
        })}
        <polygon
          points="0,-9 -2.6,1 0,-1 2.6,1"
          fill="var(--accent, #e8b86d)"
          stroke="var(--accent, #e8b86d)"
          strokeWidth="0.3"
        />
        <polygon
          points="0,9 -2.2,-1 0,1 2.2,-1"
          fill="rgba(238,232,213,0.45)"
        />
        <text
          x="0"
          y="-11.5"
          fontSize="3.2"
          textAnchor="middle"
          fill="rgba(238,232,213,0.95)"
          fontFamily="ui-monospace, monospace"
          fontWeight="600"
        >
          N
        </text>
      </svg>
    </div>
  );
}
