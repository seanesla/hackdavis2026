"use client";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Edges, Html, Line, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { useStore } from "@/lib/store";
import { useAccent } from "@/lib/accent";
import { STORY_HEIGHT_FT, type SitePlan } from "@/lib/types";

const SCAFFOLD_BOX = { w: 30, d: 30, h: 24 };

const Y = {
  lotBottom: 0,
  lotTop: 0.12,
  lotBorder: 0.18,
  setbackLine: 0.22,
  stallTop: 0.32,
};

const COLORS = {
  lotFill: "#ece8df",
  lotEdge: "#3a3a40",
  building: "#2a2a30",
  buildingEdge: "#4a4a52",
  buildingInvalid: "#ef4444",
  floorLine: "#5a5a64",
  stall: "#1a1a1f",
  stallStripe: "#6b6b75",
};

type Props = { siteplan?: SitePlan | null };

export default function SitePlanMesh({ siteplan }: Props) {
  const storePlan = useStore((s) => s.plan);
  const accent = useAccent((s) => s.accent.hex);
  const plan = siteplan !== undefined ? siteplan : storePlan;

  if (!plan || plan.lot.width <= 0 || plan.lot.depth <= 0) {
    return (
      <RoundedBox
        position={[0, SCAFFOLD_BOX.h / 2, 0]}
        args={[SCAFFOLD_BOX.w, SCAFFOLD_BOX.h, SCAFFOLD_BOX.d]}
        radius={0.6}
        smoothness={3}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={accent} roughness={0.45} metalness={0.05} />
      </RoundedBox>
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
      <Lot lot={lot} accent={accent} />
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
        />
      )}

      {stalls.map((p, i) => (
        <ParkingStall key={`${p.x}-${p.z}-${i}`} index={i} x={p.x} z={p.z} />
      ))}
    </group>
  );
}

function Lot({ lot, accent }: { lot: SitePlan["lot"]; accent: string }) {
  const ref = useRef<THREE.Mesh>(null);
  const acres = (lot.width * lot.depth) / 43560;

  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    const k = 1 - Math.exp(-dt * 8);
    m.scale.x = THREE.MathUtils.lerp(m.scale.x, 1, k);
    m.scale.z = THREE.MathUtils.lerp(m.scale.z, 1, k);
  });

  // Accent border — survey-tape feel matching Hero's underline
  const w = lot.width;
  const d = lot.depth;
  const borderPts: [number, number, number][] = [
    [0, Y.lotBorder, 0],
    [w, Y.lotBorder, 0],
    [w, Y.lotBorder, d],
    [0, Y.lotBorder, d],
    [0, Y.lotBorder, 0],
  ];

  return (
    <group>
      <mesh
        ref={ref}
        position={[w / 2, Y.lotTop / 2, d / 2]}
        scale={[0.001, 1, 0.001]}
        receiveShadow
      >
        <boxGeometry args={[w, Y.lotTop, d]} />
        <meshStandardMaterial
          color={COLORS.lotFill}
          roughness={0.92}
          metalness={0}
        />
        <Edges color={COLORS.lotEdge} lineWidth={1.2} />
      </mesh>

      <Line
        points={borderPts}
        color={accent}
        lineWidth={1.4}
        transparent
        opacity={0.7}
      />

      <Html position={[w / 2, 0.5, d + 4]} center distanceFactor={120}>
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
      lineWidth={1.8}
      dashed
      dashSize={2.5}
      gapSize={1.5}
      transparent
      opacity={0.95}
    />
  );
}

// Smooth grow-up animation. No bouncing, no z-clipping — anchored at the base
// and scales Y from 0 → 1 with an ease-out cubic. Buildings rise out of the lot.
function useGrowUp<T extends THREE.Object3D>(durationS = 0.7, delay = 0) {
  const ref = useRef<T>(null);
  const t = useRef(0);
  const elapsed = useRef(0);

  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    elapsed.current += dt;
    if (elapsed.current < delay) {
      m.scale.y = 0.0001;
      return;
    }
    if (t.current >= 1) return;
    t.current = Math.min(1, t.current + dt / durationS);
    const e = 1 - Math.pow(1 - t.current, 3);
    m.scale.y = Math.max(0.0001, e);
  });

  return ref;
}

// Smooth scale-in for ground-plane elements (parking stalls).
function useFadeIn<T extends THREE.Object3D>(durationS = 0.4, delay = 0) {
  const ref = useRef<T>(null);
  const t = useRef(0);
  const elapsed = useRef(0);

  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    elapsed.current += dt;
    if (elapsed.current < delay) {
      m.scale.set(0.0001, 1, 0.0001);
      return;
    }
    if (t.current >= 1) return;
    t.current = Math.min(1, t.current + dt / durationS);
    const e = 1 - Math.pow(1 - t.current, 3);
    const s = Math.max(0.0001, e);
    m.scale.set(s, 1, s);
  });

  return ref;
}

// Per-story window panes on all four faces. Window count derived from face
// length so a 30ft face gets fewer windows than a 100ft face — no awkward
// stretching. Emissive uses the accent color so the building reads as "lit"
// against the dark contour bg.
function StoryWindows({
  storyIndex,
  w,
  d,
  accent,
}: {
  storyIndex: number;
  w: number;
  d: number;
  accent: string;
}) {
  const winW = 2.2;
  const winH = 4.5;
  const spacing = 5.0;
  const padding = 3.5;
  const yCenter = storyIndex * STORY_HEIGHT_FT + STORY_HEIGHT_FT * 0.55;
  const offset = 0.06;

  const positionsAlong = (length: number): number[] => {
    const usable = length - 2 * padding;
    if (usable <= 0) return [];
    const count = Math.max(1, Math.floor(usable / spacing) + 1);
    const span = (count - 1) * spacing;
    const start = -span / 2;
    return Array.from({ length: count }, (_, i) => start + i * spacing);
  };

  const xs = positionsAlong(w);
  const zs = positionsAlong(d);

  const matProps = {
    color: "#0a0a10",
    emissive: accent,
    emissiveIntensity: 0.5,
    roughness: 0.18,
    metalness: 0.35,
  } as const;

  return (
    <group>
      {/* North face (z = +d/2) */}
      {xs.map((x, i) => (
        <mesh key={`n-${i}`} position={[x, yCenter, d / 2 + offset]}>
          <planeGeometry args={[winW, winH]} />
          <meshStandardMaterial {...matProps} />
        </mesh>
      ))}
      {/* South face (z = -d/2) */}
      {xs.map((x, i) => (
        <mesh
          key={`s-${i}`}
          position={[x, yCenter, -d / 2 - offset]}
          rotation={[0, Math.PI, 0]}
        >
          <planeGeometry args={[winW, winH]} />
          <meshStandardMaterial {...matProps} />
        </mesh>
      ))}
      {/* East face (x = +w/2) */}
      {zs.map((z, i) => (
        <mesh
          key={`e-${i}`}
          position={[w / 2 + offset, yCenter, z]}
          rotation={[0, Math.PI / 2, 0]}
        >
          <planeGeometry args={[winW, winH]} />
          <meshStandardMaterial {...matProps} />
        </mesh>
      ))}
      {/* West face (x = -w/2) */}
      {zs.map((z, i) => (
        <mesh
          key={`w-${i}`}
          position={[-w / 2 - offset, yCenter, z]}
          rotation={[0, -Math.PI / 2, 0]}
        >
          <planeGeometry args={[winW, winH]} />
          <meshStandardMaterial {...matProps} />
        </mesh>
      ))}
    </group>
  );
}

const CAR_PALETTE = [
  "#3a4252", // slate
  "#5a3a3a", // burgundy
  "#3a4a3a", // forest
  "#7a7a82", // silver
  "#1f1f25", // graphite
  "#86715a", // tan
];

// Deterministic hash so the same parking layout always renders the same cars.
function stallHash(i: number): number {
  return ((Math.sin(i * 12.9898 + 78.233) * 43758.5453) % 1 + 1) % 1;
}

function Car({ index }: { index: number }) {
  const h1 = stallHash(index);
  const h2 = stallHash(index + 17);
  const color = CAR_PALETTE[Math.floor(h1 * CAR_PALETTE.length)];
  // Stalls run with their long axis on Z. Car length aligns Z too. Random yaw
  // (in / out facing) for variety.
  const yaw = h2 > 0.5 ? 0 : Math.PI;
  // Body slightly off-center within the stall, scaled to fit (stall = 9 × 18 ft).
  return (
    <group position={[0, 0.85, 0]} rotation={[0, yaw, 0]}>
      {/* Lower body */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[5.6, 1.4, 13.5]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.45} />
      </mesh>
      {/* Cabin / roof */}
      <mesh castShadow position={[0, 1.0, -0.6]}>
        <boxGeometry args={[5.0, 1.2, 7.5]} />
        <meshStandardMaterial color="#0c0c12" roughness={0.15} metalness={0.6} />
      </mesh>
      {/* Windshield highlight — slight rake */}
      <mesh position={[0, 1.0, 3.2]} rotation={[-0.45, 0, 0]} castShadow>
        <planeGeometry args={[4.5, 1.3]} />
        <meshStandardMaterial
          color="#1a242e"
          roughness={0.08}
          metalness={0.85}
        />
      </mesh>
      {/* Rear window */}
      <mesh position={[0, 1.0, -4.4]} rotation={[0.45, Math.PI, 0]} castShadow>
        <planeGeometry args={[4.5, 1.1]} />
        <meshStandardMaterial
          color="#1a242e"
          roughness={0.08}
          metalness={0.85}
        />
      </mesh>
    </group>
  );
}

function Building({
  building,
  valid,
  accent,
}: {
  building: NonNullable<SitePlan["building"]>;
  valid: boolean;
  accent: string;
}) {
  const height = building.stories * STORY_HEIGHT_FT;
  const cx = building.x + building.w / 2;
  const cz = building.z + building.d / 2;

  // Anchor at the base so growth scales upward from the lot, not the center.
  const ref = useGrowUp<THREE.Group>(0.75, 0.1);
  const bodyColor = valid ? COLORS.building : COLORS.buildingInvalid;
  const roofColor = valid ? accent : COLORS.buildingInvalid;

  return (
    <group ref={ref} position={[cx, Y.lotTop, cz]}>
      {/* Stories — stacked rounded boxes with a thin gap creating subtle floor lines */}
      {Array.from({ length: building.stories }).map((_, i) => {
        const storyH = STORY_HEIGHT_FT - 0.25;
        const yCenter = i * STORY_HEIGHT_FT + storyH / 2;
        return (
          <RoundedBox
            key={i}
            args={[building.w, storyH, building.d]}
            radius={0.5}
            smoothness={3}
            position={[0, yCenter, 0]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial
              color={bodyColor}
              roughness={0.55}
              metalness={0.08}
            />
            <Edges color={COLORS.buildingEdge} lineWidth={0.8} threshold={20} />
          </RoundedBox>
        );
      })}

      {/* Windows — per story per face. Skipped for invalid (red) buildings. */}
      {valid &&
        Array.from({ length: building.stories }).map((_, i) => (
          <StoryWindows
            key={`win-${i}`}
            storyIndex={i}
            w={building.w}
            d={building.d}
            accent={accent}
          />
        ))}

      {/* Floor-line accent strip on top of each story (except the very top, which the roof covers) */}
      {Array.from({ length: Math.max(0, building.stories - 1) }).map((_, i) => {
        const y = (i + 1) * STORY_HEIGHT_FT - 0.125;
        return (
          <mesh
            key={`fl-${i}`}
            position={[0, y, 0]}
            renderOrder={1}
          >
            <boxGeometry args={[building.w + 0.04, 0.06, building.d + 0.04]} />
            <meshStandardMaterial
              color={COLORS.floorLine}
              roughness={0.4}
              metalness={0.1}
            />
          </mesh>
        );
      })}

      {/* Accent roof plate */}
      <mesh position={[0, height + 0.25, 0]} castShadow>
        <boxGeometry args={[building.w + 0.4, 0.5, building.d + 0.4]} />
        <meshStandardMaterial
          color={roofColor}
          emissive={roofColor}
          emissiveIntensity={valid ? 0.55 : 0.2}
          roughness={0.35}
          metalness={0.1}
        />
      </mesh>

      <Html position={[0, height + 6, 0]} center distanceFactor={120}>
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
  const stallThickness = 0.18;
  const yCenter = Y.stallTop - stallThickness / 2;
  const ref = useFadeIn<THREE.Group>(0.35, 0.5 + index * 0.04);
  const occupied = stallHash(index + 99) > 0.4;

  return (
    <group ref={ref} position={[x + 4.5, yCenter, z + 9]}>
      <mesh receiveShadow castShadow>
        <boxGeometry args={[9, stallThickness, 18]} />
        <meshStandardMaterial color={COLORS.stall} roughness={0.92} />
      </mesh>
      {/* Two parking stripes per stall — thin paper-tone bars */}
      <mesh position={[-3.0, stallThickness / 2 + 0.005, 0]}>
        <boxGeometry args={[0.25, 0.02, 16]} />
        <meshStandardMaterial color={COLORS.stallStripe} roughness={0.6} />
      </mesh>
      <mesh position={[3.0, stallThickness / 2 + 0.005, 0]}>
        <boxGeometry args={[0.25, 0.02, 16]} />
        <meshStandardMaterial color={COLORS.stallStripe} roughness={0.6} />
      </mesh>
      {occupied && <Car index={index} />}
    </group>
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
