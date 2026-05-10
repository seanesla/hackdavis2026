"use client";
import { Html, Line } from "@react-three/drei";
import type { SitePlan } from "@/lib/types";

const DIM_OFFSET = 14;
const TICK_LEN = 3;
const Y_DIM = 0.25;
const LINE_COLOR = "#cdd6df";
const TEXT_COLOR = "#0f0f12";

// One dim run along an axis. `objectSide` is the perpendicular coord of the
// object's edge (where the extension line starts); `dimSide` is where the
// dim line itself sits (where the extension ends). Tick marks cap each end.
function DimRun({
  axis,
  start,
  end,
  objectSide,
  dimSide,
  label,
}: {
  axis: "x" | "z";
  start: number;
  end: number;
  objectSide: number;
  dimSide: number;
  label: string;
}) {
  const p1: [number, number, number] =
    axis === "x" ? [start, Y_DIM, dimSide] : [dimSide, Y_DIM, start];
  const p2: [number, number, number] =
    axis === "x" ? [end, Y_DIM, dimSide] : [dimSide, Y_DIM, end];
  const ext1Inner: [number, number, number] =
    axis === "x" ? [start, Y_DIM, objectSide] : [objectSide, Y_DIM, start];
  const ext2Inner: [number, number, number] =
    axis === "x" ? [end, Y_DIM, objectSide] : [objectSide, Y_DIM, end];
  const tick1a: [number, number, number] =
    axis === "x"
      ? [start - TICK_LEN / 2, Y_DIM, dimSide - TICK_LEN / 2]
      : [dimSide - TICK_LEN / 2, Y_DIM, start - TICK_LEN / 2];
  const tick1b: [number, number, number] =
    axis === "x"
      ? [start + TICK_LEN / 2, Y_DIM, dimSide + TICK_LEN / 2]
      : [dimSide + TICK_LEN / 2, Y_DIM, start + TICK_LEN / 2];
  const tick2a: [number, number, number] =
    axis === "x"
      ? [end - TICK_LEN / 2, Y_DIM, dimSide - TICK_LEN / 2]
      : [dimSide - TICK_LEN / 2, Y_DIM, end - TICK_LEN / 2];
  const tick2b: [number, number, number] =
    axis === "x"
      ? [end + TICK_LEN / 2, Y_DIM, dimSide + TICK_LEN / 2]
      : [dimSide + TICK_LEN / 2, Y_DIM, end + TICK_LEN / 2];
  const labelPos: [number, number, number] =
    axis === "x"
      ? [(start + end) / 2, Y_DIM + 1.5, dimSide]
      : [dimSide, Y_DIM + 1.5, (start + end) / 2];

  return (
    <group>
      <Line points={[p1, p2]} color={LINE_COLOR} lineWidth={1.4} />
      <Line
        points={[ext1Inner, p1]}
        color={LINE_COLOR}
        lineWidth={1.0}
        dashed
        dashSize={1.5}
        gapSize={1.0}
      />
      <Line
        points={[ext2Inner, p2]}
        color={LINE_COLOR}
        lineWidth={1.0}
        dashed
        dashSize={1.5}
        gapSize={1.0}
      />
      <Line points={[tick1a, tick1b]} color={LINE_COLOR} lineWidth={1.6} />
      <Line points={[tick2a, tick2b]} color={LINE_COLOR} lineWidth={1.6} />
      <Html position={labelPos} center distanceFactor={120}>
        <div
          className="rounded-sm px-1.5 py-0.5 font-mono text-[10px] tracking-wider whitespace-nowrap"
          style={{ background: LINE_COLOR, color: TEXT_COLOR }}
        >
          {label}
        </div>
      </Html>
    </group>
  );
}

export default function DimensionLines({
  lot,
  buildings,
}: {
  lot: SitePlan["lot"];
  buildings: NonNullable<SitePlan["buildings"]>;
}) {
  return (
    <group>
      <DimRun
        axis="x"
        start={0}
        end={lot.width}
        objectSide={0}
        dimSide={-DIM_OFFSET}
        label={`${Math.round(lot.width)} ft`}
      />
      <DimRun
        axis="z"
        start={0}
        end={lot.depth}
        objectSide={lot.width}
        dimSide={lot.width + DIM_OFFSET}
        label={`${Math.round(lot.depth)} ft`}
      />
      {buildings
        .filter((b) => b.w > 0 && b.d > 0)
        .map((b, i) => (
          <group key={`bdim-${i}`}>
            <DimRun
              axis="x"
              start={b.x}
              end={b.x + b.w}
              objectSide={b.z}
              dimSide={b.z - 4}
              label={`${Math.round(b.w)} ft`}
            />
            <DimRun
              axis="z"
              start={b.z}
              end={b.z + b.d}
              objectSide={b.x + b.w}
              dimSide={b.x + b.w + 4}
              label={`${Math.round(b.d)} ft`}
            />
          </group>
        ))}
    </group>
  );
}
