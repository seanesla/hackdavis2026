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

  if (!plan || plan.lot.width <= 0 || plan.lot.depth <= 0) {
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
  const buildable = isBuildable(lot, setbacks);
  const buildingShown =
    building && building.w > 0 && building.d > 0 && building.stories > 0
      ? building
      : null;
  const buildingValid = buildingShown
    ? isInsideSetbacks(buildingShown, lot, setbacks)
    : true;
  const stalls = parking ?? [];

  return (
    <group position={[-lot.width / 2, 0, -lot.depth / 2]}>
      <Lot lot={lot} />
      {buildable ? (
        <SetbackEnvelope lot={lot} setbacks={setbacks} />
      ) : (
        <SetbackWarning lot={lot} />
      )}

      {buildingShown && (
        <Building
          key={`${buildingShown.x}-${buildingShown.z}-${buildingShown.w}-${buildingShown.d}-${buildingShown.stories}`}
          building={buildingShown}
          valid={buildingValid}
        />
      )}

      {stalls.map((p, i) => (
        <ParkingStall key={`${p.x}-${p.z}-${i}`} index={i} x={p.x} z={p.z} />
      ))}
    </group>
  );
}

function Lot({ lot }: { lot: SitePlan["lot"] }) {
  const ref = useRef<THREE.Mesh>(null);
  const acres = (lot.width * lot.depth) / 43560;

  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    const k = 1 - Math.exp(-dt * 8);
    m.scale.x = THREE.MathUtils.lerp(m.scale.x, 1, k);
    m.scale.z = THREE.MathUtils.lerp(m.scale.z, 1, k);
  });

  return (
    <group>
      <mesh
        ref={ref}
        position={[lot.width / 2, 0.05, lot.depth / 2]}
        scale={[0.001, 1, 0.001]}
        receiveShadow
      >
        <boxGeometry args={[lot.width, 0.1, lot.depth]} />
        <meshStandardMaterial color={COLORS.lotFill} />
        <Edges color={COLORS.lotEdge} lineWidth={1.5} />
      </mesh>

      <Html position={[0, 0.5, lot.depth + 4]} center distanceFactor={120}>
        <div className="whitespace-nowrap rounded bg-white/90 px-2 py-1 text-[11px] font-medium text-zinc-800 shadow">
          Lot · {lot.width}×{lot.depth} ft · {acres.toFixed(2)} acre
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

function useDrop(restY: number, dropHeight: number, delay = 0) {
  const ref = useRef<THREE.Mesh>(null);
  const yRef = useRef(restY + dropHeight);
  const velRef = useRef(0);
  const elapsed = useRef(0);

  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    elapsed.current += dt;
    if (elapsed.current < delay) {
      m.position.y = restY + dropHeight;
      return;
    }
    const stiffness = 65;
    const damping = 9;
    const force = (restY - yRef.current) * stiffness;
    const dampForce = -velRef.current * damping;
    velRef.current += (force + dampForce) * dt;
    yRef.current += velRef.current * dt;
    m.position.y = yRef.current;
  });

  return ref;
}

function Building({
  building,
  valid,
}: {
  building: NonNullable<SitePlan["building"]>;
  valid: boolean;
}) {
  const height = building.stories * STORY_HEIGHT_FT;
  const cx = building.x + building.w / 2;
  const cz = building.z + building.d / 2;
  const restY = height / 2;
  const ref = useDrop(restY, 80, 0);

  return (
    <group>
      <mesh
        ref={ref}
        position={[cx, restY + 80, cz]}
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
  const restY = 0.13;
  const ref = useDrop(restY, 35, index * 0.06);

  return (
    <mesh
      ref={ref}
      position={[x + 4.5, restY + 35, z + 9]}
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

function isBuildable(lot: SitePlan["lot"], s: SitePlan["setbacks"]) {
  return lot.width - 2 * s.side > 0 && lot.depth - s.front - s.back > 0;
}

function SetbackWarning({ lot }: { lot: SitePlan["lot"] }) {
  return (
    <Html position={[lot.width / 2, 1, lot.depth / 2]} center distanceFactor={120}>
      <div className="whitespace-nowrap rounded bg-red-600/95 px-2 py-1 text-[11px] font-semibold text-white shadow">
        ⚠ Setbacks exceed lot — no buildable area
      </div>
    </Html>
  );
}
