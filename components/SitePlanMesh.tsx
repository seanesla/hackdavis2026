"use client";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Edges, Html, Line } from "@react-three/drei";
import * as THREE from "three";
import { useStore } from "@/lib/store";
import { STORY_HEIGHT_FT, type SitePlan } from "@/lib/types";

const SCAFFOLD_BOX = { w: 30, d: 30, h: 24 };

const COLORS = {
  ground: "#9ca3af",
  lotFill: "#ecfccb",
  lotEdge: "#4d7c0f",
  setback: "#f97316",
  building: "#3b82f6",
  buildingEdge: "#1e3a8a",
  buildingInvalid: "#ef4444",
  stall: "#1f2937",
  stallStripe: "#fbbf24",
};

type Props = { siteplan?: SitePlan | null };

export default function SitePlanMesh({ siteplan }: Props) {
  const storePlan = useStore((s) => s.plan);
  const plan = siteplan !== undefined ? siteplan : storePlan;

  if (!plan) {
    return (
      <mesh
        position={[0, SCAFFOLD_BOX.h / 2, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[SCAFFOLD_BOX.w, SCAFFOLD_BOX.h, SCAFFOLD_BOX.d]} />
        <meshStandardMaterial color="#22c55e" />
      </mesh>
    );
  }

  const { lot, setbacks, building, parking } = plan;
  const buildingValid = building ? isInsideSetbacks(building, lot, setbacks) : true;

  return (
    <group position={[-lot.width / 2, 0, -lot.depth / 2]}>
      <Lot lot={lot} />
      <SetbackEnvelope lot={lot} setbacks={setbacks} />

      {building && (
        <Building
          key={`${building.x}-${building.z}-${building.w}-${building.d}-${building.stories}`}
          building={building}
          valid={buildingValid}
        />
      )}

      {parking?.map((p, i) => (
        <ParkingStall key={`${p.x}-${p.z}`} index={i} x={p.x} z={p.z} />
      ))}
    </group>
  );
}

function Lot({ lot }: { lot: SitePlan["lot"] }) {
  const acres = (lot.width * lot.depth) / 43560;
  const acresLabel = acres < 0.1 ? acres.toFixed(2) : acres.toFixed(2);
  return (
    <group>
      <mesh position={[lot.width / 2, 0.05, lot.depth / 2]} receiveShadow>
        <boxGeometry args={[lot.width, 0.1, lot.depth]} />
        <meshStandardMaterial color={COLORS.lotFill} />
        <Edges color={COLORS.lotEdge} lineWidth={1.5} />
      </mesh>

      <Html position={[0, 0.5, lot.depth + 4]} center distanceFactor={120}>
        <div className="whitespace-nowrap rounded bg-white/90 px-2 py-1 text-[11px] font-medium text-zinc-800 shadow">
          Lot · {lot.width}×{lot.depth} ft · {acresLabel} acre
        </div>
      </Html>
    </group>
  );
}

function SetbackEnvelope({
  lot,
  setbacks,
}: {
  lot: SitePlan["lot"];
  setbacks: SitePlan["setbacks"];
}) {
  const x0 = setbacks.side;
  const x1 = lot.width - setbacks.side;
  const z0 = setbacks.front;
  const z1 = lot.depth - setbacks.back;
  const y = 0.12;
  const points: [number, number, number][] = [
    [x0, y, z0],
    [x1, y, z0],
    [x1, y, z1],
    [x0, y, z1],
    [x0, y, z0],
  ];
  return (
    <Line
      points={points}
      color={COLORS.setback}
      lineWidth={2}
      dashed
      dashSize={2.5}
      gapSize={1.5}
      transparent
      opacity={0.95}
    />
  );
}

function Building({
  building,
  valid,
}: {
  building: NonNullable<SitePlan["building"]>;
  valid: boolean;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const height = building.stories * STORY_HEIGHT_FT;
  const cx = building.x + building.w / 2;
  const cz = building.z + building.d / 2;

  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    m.scale.y = THREE.MathUtils.lerp(m.scale.y, 1, 1 - Math.exp(-dt * 6));
  });

  return (
    <group>
      <mesh
        ref={ref}
        position={[cx, height / 2, cz]}
        scale={[1, 0.001, 1]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[building.w, height, building.d]} />
        <meshStandardMaterial
          color={valid ? COLORS.building : COLORS.buildingInvalid}
        />
        <Edges color={COLORS.buildingEdge} lineWidth={1} />
      </mesh>

      <Html position={[cx, height + 6, cz]} center distanceFactor={120}>
        <div className="whitespace-nowrap rounded bg-blue-600/95 px-2 py-1 text-[11px] font-semibold text-white shadow">
          {building.w}×{building.d} ft · {building.stories} stories
          {!valid && <span className="ml-1 text-amber-200">· setback violation</span>}
        </div>
      </Html>
    </group>
  );
}

function ParkingStall({ index, x, z }: { index: number; x: number; z: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const elapsed = useRef(0);
  const delay = index * 0.05;

  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    elapsed.current += dt;
    if (elapsed.current < delay) return;
    m.scale.x = THREE.MathUtils.lerp(m.scale.x, 1, 1 - Math.exp(-dt * 10));
    m.scale.z = THREE.MathUtils.lerp(m.scale.z, 1, 1 - Math.exp(-dt * 10));
  });

  return (
    <mesh
      ref={ref}
      position={[x + 4.5, 0.13, z + 9]}
      scale={[0.001, 1, 0.001]}
      receiveShadow
    >
      <boxGeometry args={[9, 0.1, 18]} />
      <meshStandardMaterial color={COLORS.stall} />
      <Edges color={COLORS.stallStripe} lineWidth={1} />
    </mesh>
  );
}

function isInsideSetbacks(
  b: NonNullable<SitePlan["building"]>,
  lot: SitePlan["lot"],
  s: SitePlan["setbacks"]
) {
  return (
    b.x >= s.side &&
    b.z >= s.front &&
    b.x + b.w <= lot.width - s.side &&
    b.z + b.d <= lot.depth - s.back
  );
}
