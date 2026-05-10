"use client";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Edges, Html, Line } from "@react-three/drei";
import * as THREE from "three";
import { useStore } from "@/lib/store";
import { useAccent } from "@/lib/accent";
import { STORY_HEIGHT_FT, type SitePlan } from "@/lib/types";

const SCAFFOLD_BOX = { w: 30, d: 30, h: 24 };

const Y = {
  lotTop: 0.1,
  setbackLine: 0.15,
  stallTop: 0.3,
};

const COLORS = {
  lotFill: "#f5f5f4",
  lotEdge: "#52525b",
  building: "#1f1f23",
  buildingEdge: "#27272a",
  buildingInvalid: "#ef4444",
  stall: "#27272a",
  stallStripe: "#52525b",
};

const MATERIAL_COLORS: Record<string, string> = {
  concrete: "#9ca3af",
  steel: "#3b82f6",
  wood: "#92400e",
  other: COLORS.building,
};

type Props = { siteplan?: SitePlan | null };

export default function SitePlanMesh({ siteplan }: Props) {
  const storePlan = useStore((s) => s.plan);
  const accent = useAccent((s) => s.accent.hex);
  const plan = siteplan !== undefined ? siteplan : storePlan;

  if (!plan || plan.lot.width <= 0 || plan.lot.depth <= 0) {
    return (
      <mesh
        position={[0, SCAFFOLD_BOX.h / 2, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[SCAFFOLD_BOX.w, SCAFFOLD_BOX.h, SCAFFOLD_BOX.d]} />
        <meshStandardMaterial color={accent} roughness={0.5} />
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
        <SetbackEnvelope lot={lot} setbacks={setbacks} color={accent} />
      ) : (
        <SetbackWarning lot={lot} />
      )}

      {buildingShown && (
        <Building
          key={`${buildingShown.x}-${buildingShown.z}-${buildingShown.w}-${buildingShown.d}-${buildingShown.stories}`}
          building={buildingShown}
          valid={buildingValid}
          accent={accent}
          material={plan.meta?.material}
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
    const k = 1 - Math.exp(-dt * 9);
    m.scale.x = THREE.MathUtils.lerp(m.scale.x, 1, k);
    m.scale.z = THREE.MathUtils.lerp(m.scale.z, 1, k);
  });

  return (
    <group>
      <mesh
        ref={ref}
        position={[lot.width / 2, Y.lotTop / 2, lot.depth / 2]}
        scale={[0.001, 1, 0.001]}
        receiveShadow
      >
        <boxGeometry args={[lot.width, Y.lotTop, lot.depth]} />
        <meshStandardMaterial color={COLORS.lotFill} roughness={0.95} />
        <Edges color={COLORS.lotEdge} lineWidth={1.5} />
      </mesh>

      <Html position={[0, 0.5, lot.depth + 4]} center distanceFactor={120}>
        <div className="whitespace-nowrap rounded bg-paper px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-ink shadow-md">
          lot · {lot.width}×{lot.depth} ft · {acres.toFixed(2)} acre
        </div>
      </Html>
    </group>
  );
}

function SetbackEnvelope({
  lot,
  setbacks,
  color,
}: {
  lot: SitePlan["lot"];
  setbacks: SitePlan["setbacks"];
  color: string;
}) {
  const x0 = setbacks.side;
  const x1 = lot.width - setbacks.side;
  const z0 = setbacks.front;
  const z1 = lot.depth - setbacks.back;
  const points: [number, number, number][] = [
    [x0, Y.setbackLine, z0],
    [x1, Y.setbackLine, z0],
    [x1, Y.setbackLine, z1],
    [x0, Y.setbackLine, z1],
    [x0, Y.setbackLine, z0],
  ];
  return (
    <Line
      points={points}
      color={color}
      lineWidth={2}
      dashed
      dashSize={2.5}
      gapSize={1.5}
      transparent
      opacity={0.95}
    />
  );
}

// Gravity-based drop with bounce-on-floor. Mesh physically cannot pass
// through the rest position, so no clipping through the ground.
function useDrop<T extends THREE.Object3D>(
  restY: number,
  dropHeight: number,
  delay = 0
) {
  const ref = useRef<T>(null);
  const yRef = useRef(restY + dropHeight);
  const velRef = useRef(0);
  const elapsed = useRef(0);
  const settled = useRef(false);

  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    elapsed.current += dt;
    if (elapsed.current < delay) {
      m.position.y = restY + dropHeight;
      return;
    }
    if (settled.current) {
      m.position.y = restY;
      return;
    }

    const gravity = -160;
    const restitution = 0.3;
    const settleSpeed = 1.5;
    const dtClamped = Math.min(dt, 1 / 30);

    velRef.current += gravity * dtClamped;
    yRef.current += velRef.current * dtClamped;

    if (yRef.current <= restY) {
      yRef.current = restY;
      if (Math.abs(velRef.current) < settleSpeed) {
        velRef.current = 0;
        settled.current = true;
      } else {
        velRef.current = -velRef.current * restitution;
      }
    }

    m.position.y = yRef.current;
  });

  return ref;
}

function Building({
  building,
  valid,
  accent,
  material,
}: {
  building: NonNullable<SitePlan["building"]>;
  valid: boolean;
  accent: string;
  material?: string;
}) {
  const height = building.stories * STORY_HEIGHT_FT;
  const cx = building.x + building.w / 2;
  const cz = building.z + building.d / 2;
  const restY = Y.lotTop + height / 2;
  const ref = useDrop<THREE.Group>(restY, 50);
  const roofColor = valid ? accent : COLORS.buildingInvalid;
  const bodyColor = valid
    ? MATERIAL_COLORS[material ?? "other"] ?? COLORS.building
    : COLORS.buildingInvalid;

  return (
    <group ref={ref} position={[cx, restY + 50, cz]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[building.w, height, building.d]} />
        <meshStandardMaterial color={bodyColor} roughness={0.6} />
        <Edges color={COLORS.buildingEdge} lineWidth={1} />
      </mesh>

      {/* Accent-colored roof plate, glows */}
      <mesh position={[0, height / 2 + 0.4, 0]} castShadow>
        <boxGeometry args={[building.w + 0.2, 0.6, building.d + 0.2]} />
        <meshStandardMaterial
          color={roofColor}
          emissive={roofColor}
          emissiveIntensity={0.4}
          roughness={0.4}
        />
      </mesh>

      <Html position={[0, height / 2 + 6, 0]} center distanceFactor={120}>
        <div className="whitespace-nowrap rounded bg-paper px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-ink shadow-md">
          {building.w}×{building.d} ft · {building.stories} stories
          {!valid && (
            <span className="ml-1 text-red-600">· setback violation</span>
          )}
        </div>
      </Html>
    </group>
  );
}

function ParkingStall({ index, x, z }: { index: number; x: number; z: number }) {
  const stallThickness = 0.2;
  const restY = Y.stallTop - stallThickness / 2;
  const ref = useDrop<THREE.Mesh>(restY, 18, index * 0.05);

  return (
    <mesh
      ref={ref}
      position={[x + 4.5, restY + 18, z + 9]}
      receiveShadow
    >
      <boxGeometry args={[9, stallThickness, 18]} />
      <meshStandardMaterial color={COLORS.stall} roughness={0.9} />
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
      <div className="whitespace-nowrap rounded bg-red-600 px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-white shadow-md">
        ⚠ setbacks exceed lot — no buildable area
      </div>
    </Html>
  );
}
