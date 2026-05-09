"use client";
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Edges, Html, Line, RoundedBox } from "@react-three/drei";
import * as THREE from "three";

// Distance-based LOD. When the camera is far away, sub-foot architectural
// details (mullions, sills, lintels, door handles, flagstone joint lines)
// are smaller than a pixel and produce shimmering aliasing artifacts. Hide
// them past a threshold; the wall/glass/recess hierarchy still reads.
//
// Why a module-level mutable object instead of state: it lets `useFrame`
// callbacks in detail components mutate a group's `.visible` directly
// without triggering a React re-render every frame.
const LOD = { far: false, midFar: false };

function LODSentinel() {
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    const d = camera.position.length();
    LOD.far = d > 320;
    LOD.midFar = d > 220;
  });
  return null;
}
import { useStore } from "@/lib/store";
import { useAccent } from "@/lib/accent";
import {
  STORY_HEIGHT_FT,
  type BuildingMaterial,
  type Fence,
  type SitePlan,
  type StreetProp,
  type StructureType,
  type Tree,
  type Walkway,
} from "@/lib/types";
import GltfOrFallback, { ModelBoundary } from "./models/GltfModel";
import { useGLTF } from "@react-three/drei";
import {
  CAR_MODELS,
  FENCE_MODEL,
  PROP_MODELS,
  TARGET_CAR_LENGTH_FT,
  TARGET_FENCE_HEIGHT_FT,
  TREE_MODELS,
} from "@/lib/modelConfig";

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
  // Asphalt-grey + bright cream stripes — much more readable than near-black.
  stall: "#454549",
  stallEdge: "#2a2a2e",
  stallStripe: "#e8e0c8",
  wheelStop: "#a39888",
  hvac: "#7d8388",
  hvacEdge: "#3f4548",
};

type MaterialPreset = {
  body: string;
  edge: string;
  floorLine: string;
  roof: string;
  roughness: number;
  metalness: number;
  // Override window glow (e.g. cool blue for glass/steel). Falls back to accent.
  windowEmissive?: string;
  windowIntensity: number;
  // Pitched gable roof (residential) or flat parapet (commercial / industrial).
  roofStyle: "gable" | "flat";
  label: string;
};

const MATERIAL_PRESETS: Record<BuildingMaterial | "default", MaterialPreset> = {
  wood: {
    body: "#8a5a3c",
    edge: "#4a2c19",
    floorLine: "#3d2316",
    roof: "#3a2418",
    roughness: 0.85,
    metalness: 0.0,
    windowIntensity: 0.45,
    roofStyle: "gable",
    label: "wood",
  },
  brick: {
    body: "#a04432",
    edge: "#5e2419",
    floorLine: "#3d1c14",
    roof: "#2a1612",
    roughness: 0.95,
    metalness: 0.0,
    windowIntensity: 0.5,
    roofStyle: "gable",
    label: "brick",
  },
  stucco: {
    body: "#d8c9a8",
    edge: "#8c7e60",
    floorLine: "#7c6e52",
    roof: "#5a3c2a",
    roughness: 0.95,
    metalness: 0.0,
    windowIntensity: 0.45,
    roofStyle: "gable",
    label: "stucco",
  },
  concrete: {
    body: "#9b9a93",
    edge: "#5e5d57",
    floorLine: "#4a4944",
    roof: "#3a3a36",
    roughness: 0.9,
    metalness: 0.05,
    windowIntensity: 0.4,
    roofStyle: "flat",
    label: "concrete",
  },
  steel: {
    body: "#6b7785",
    edge: "#3e4751",
    floorLine: "#2a3138",
    roof: "#1f242b",
    roughness: 0.28,
    metalness: 0.85,
    windowEmissive: "#8fc4e8",
    windowIntensity: 0.35,
    roofStyle: "flat",
    label: "steel",
  },
  glass: {
    body: "#3a4f5a",
    edge: "#1f2a31",
    floorLine: "#5a7a85",
    roof: "#1a2228",
    roughness: 0.12,
    metalness: 0.9,
    windowEmissive: "#c2e5f5",
    windowIntensity: 0.65,
    roofStyle: "flat",
    label: "glass",
  },
  default: {
    body: "#2a2a30",
    edge: "#4a4a52",
    floorLine: "#5a5a64",
    roof: "#1a1a20",
    roughness: 0.55,
    metalness: 0.08,
    windowIntensity: 0.5,
    roofStyle: "flat",
    label: "",
  },
};

function presetFor(m?: BuildingMaterial): MaterialPreset {
  return m ? MATERIAL_PRESETS[m] : MATERIAL_PRESETS.default;
}

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

  const { lot, setbacks, buildings, parking, trees, walkways, fences, props } = plan;
  const buildable = isBuildable(lot, setbacks);
  const validBuildings = (buildings ?? []).filter(
    (b) => b.w > 0 && b.d > 0 && b.stories > 0
  );
  const stalls = parking ?? [];

  return (
    <group position={[-lot.width / 2, 0, -lot.depth / 2]}>
      <LODSentinel />
      <Lot lot={lot} accent={accent} />
      {buildable ? (
        <SetbackEnvelope lot={lot} setbacks={setbacks} color={accent} />
      ) : (
        <SetbackWarning lot={lot} />
      )}

      {(walkways ?? []).map((w, i) => (
        <WalkwayMesh key={`wk-${i}-${w.x1}-${w.z1}-${w.x2}-${w.z2}`} walkway={w} delay={i * 0.05} />
      ))}

      {validBuildings.map((b, i) => (
        <Building
          key={`${i}-${b.x}-${b.z}-${b.w}-${b.d}-${b.stories}`}
          building={b}
          siblings={validBuildings}
          valid={isInsideSetbacks(b, lot, setbacks)}
          accent={accent}
          delay={i * 0.15}
        />
      ))}

      {stalls.map((p, i) => (
        <ParkingStall key={`${p.x}-${p.z}-${i}`} index={i} x={p.x} z={p.z} />
      ))}

      {(trees ?? []).map((t, i) => (
        <TreeMesh key={`tr-${i}-${t.x}-${t.z}`} tree={t} delay={i * 0.04} />
      ))}

      {(fences ?? []).map((f, i) => (
        <FenceMesh key={`f-${i}-${f.style}-${f.sides.join("|")}`} lot={lot} fence={f} />
      ))}

      {(props ?? []).map((p, i) => (
        <StreetPropMesh
          key={`sp-${i}-${p.kind}-${p.x}-${p.z}`}
          prop={p}
          delay={i * 0.04}
        />
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

      <Html position={[w / 2, 0.5, d + 4]} center>
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
type OccludedSpans = {
  n: [number, number][];
  s: [number, number][];
  e: [number, number][];
  w: [number, number][];
};

const NO_OCCLUSION: OccludedSpans = { n: [], s: [], e: [], w: [] };

function inAnySpan(v: number, spans: [number, number][]): boolean {
  for (const [a, b] of spans) {
    if (v >= a && v <= b) return true;
  }
  return false;
}

function StoryWindows({
  storyIndex,
  w,
  d,
  accent,
  preset,
  occluded = NO_OCCLUSION,
}: {
  storyIndex: number;
  w: number;
  d: number;
  accent: string;
  preset: MaterialPreset;
  occluded?: OccludedSpans;
}) {
  // Glass curtain-walls get tighter spacing + taller panes; everything else
  // gets typical punched-window spacing.
  const isGlass = preset.label === "glass";
  const winW = isGlass ? 3.4 : 2.6;
  const winH = isGlass ? 6.8 : 4.8;
  const spacing = isGlass ? 4.2 : 5.2;
  const padding = 3.5;
  const yCenter = storyIndex * STORY_HEIGHT_FT + STORY_HEIGHT_FT * 0.55;
  // Sit windows clearly proud of the wall so they read as recessed openings
  // with trim, not pasted-on rectangles. polygonOffset on the glass kills
  // the last sliver of z-fight at glancing camera angles.
  const offset = 0.18;

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

  return (
    <group>
      {/* North face (z = +d/2) */}
      {xs.map((x, i) =>
        inAnySpan(x, occluded.n) ? null : (
          <Window
            key={`n-${i}`}
            position={[x, yCenter, d / 2 + offset]}
            rotationY={0}
            winW={winW}
            winH={winH}
            isGlass={isGlass}
            preset={preset}
            accent={accent}
          />
        )
      )}
      {/* South face (z = -d/2) */}
      {xs.map((x, i) =>
        inAnySpan(x, occluded.s) ? null : (
          <Window
            key={`s-${i}`}
            position={[x, yCenter, -d / 2 - offset]}
            rotationY={Math.PI}
            winW={winW}
            winH={winH}
            isGlass={isGlass}
            preset={preset}
            accent={accent}
          />
        )
      )}
      {/* East face (x = +w/2) */}
      {zs.map((z, i) =>
        inAnySpan(z, occluded.e) ? null : (
          <Window
            key={`e-${i}`}
            position={[w / 2 + offset, yCenter, z]}
            rotationY={Math.PI / 2}
            winW={winW}
            winH={winH}
            isGlass={isGlass}
            preset={preset}
            accent={accent}
          />
        )
      )}
      {/* West face (x = -w/2) */}
      {zs.map((z, i) =>
        inAnySpan(z, occluded.w) ? null : (
          <Window
            key={`w-${i}`}
            position={[-w / 2 - offset, yCenter, z]}
            rotationY={-Math.PI / 2}
            winW={winW}
            winH={winH}
            isGlass={isGlass}
            preset={preset}
            accent={accent}
          />
        )
      )}
    </group>
  );
}

// One window unit: trim frame (slightly larger, lighter color) + dark recess
// + glass pane (with emissive glow) + horizontal mullion + sill + lintel.
// All children are inside a group rotated so the glass faces outward, so
// "outward" = local +z, "in front of the glass" = local +z bias.
function Window({
  position,
  rotationY,
  winW,
  winH,
  isGlass,
  preset,
  accent,
}: {
  position: [number, number, number];
  rotationY: number;
  winW: number;
  winH: number;
  isGlass: boolean;
  preset: MaterialPreset;
  accent: string;
}) {
  const trimColor = preset.floorLine; // matches the cornice trim
  const recessColor = "#0a0a10";
  const glassEmissive = preset.windowEmissive ?? accent;

  // Outer trim a bit larger than the recess; recess slightly inset so it
  // reads as depth.
  const trimMargin = 0.35;
  const sillH = 0.22;
  const sillD = 0.45;
  const lintelH = 0.18;

  // Hide the sub-foot mullions / sill / lintel when the camera is far enough
  // that they'd be sub-pixel-sized and shimmer.
  const detailRef = useRef<THREE.Group>(null);
  const fineRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (detailRef.current) detailRef.current.visible = !LOD.far;
    if (fineRef.current) fineRef.current.visible = !LOD.midFar;
  });

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Layer offsets are deliberately spread far enough apart (≥0.03 ft per
          step) so the log-depth buffer can distinguish them at any zoom. */}
      {/* Outer trim — frame border ~3 inches around the recess. Always
          visible (it's chunky enough to read at distance). */}
      <mesh position={[0, 0, -0.05]}>
        <planeGeometry args={[winW + trimMargin, winH + trimMargin]} />
        <meshStandardMaterial
          color={trimColor}
          roughness={0.7}
          metalness={preset.metalness * 0.4}
        />
      </mesh>
      {/* Dark recess — gives the window depth even before the glass lights up. */}
      <mesh position={[0, 0, -0.02]}>
        <planeGeometry args={[winW + 0.04, winH + 0.04]} />
        <meshStandardMaterial color={recessColor} roughness={0.4} metalness={0.2} />
      </mesh>
      {/* Glass — emissive panel sitting cleanly in front of the recess. */}
      <mesh position={[0, 0, 0.01]}>
        <planeGeometry args={[winW, winH]} />
        <meshStandardMaterial
          color="#0a0a10"
          emissive={glassEmissive}
          emissiveIntensity={preset.windowIntensity}
          roughness={isGlass ? 0.05 : 0.18}
          metalness={isGlass ? 0.6 : 0.35}
        />
      </mesh>

      {/* Mid-distance details — chunky enough to show up to ~220ft camera. */}
      <group ref={detailRef}>
        {/* Sill — small lip under the window, projecting outward. */}
        {!isGlass && (
          <mesh position={[0, -winH / 2 - sillH / 2, sillD / 2 - 0.04]} castShadow>
            <boxGeometry args={[winW + trimMargin + 0.2, sillH, sillD]} />
            <meshStandardMaterial color={trimColor} roughness={0.85} metalness={0.05} />
          </mesh>
        )}
        {/* Lintel — short header over the window. */}
        {!isGlass && (
          <mesh position={[0, winH / 2 + lintelH / 2, 0.05]} castShadow>
            <boxGeometry args={[winW + trimMargin + 0.1, lintelH, 0.18]} />
            <meshStandardMaterial color={trimColor} roughness={0.8} metalness={0.05} />
          </mesh>
        )}
      </group>

      {/* Fine details — sub-foot pieces that go sub-pixel past ~220ft and
          are hidden first to kill the shimmer. */}
      <group ref={fineRef}>
        {/* Horizontal mullion across the middle (skipped on glass curtain walls).
            Box (not plane) so it has its own depth profile in front of the glass. */}
        {!isGlass && (
          <mesh position={[0, 0, 0.04]}>
            <boxGeometry args={[winW + 0.02, 0.14, 0.06]} />
            <meshStandardMaterial color={trimColor} roughness={0.6} metalness={0.1} />
          </mesh>
        )}
        {/* Vertical mullion (only on wider non-glass panes for double-hung look). */}
        {!isGlass && winW >= 3.0 && (
          <mesh position={[0, 0, 0.04]}>
            <boxGeometry args={[0.12, winH + 0.02, 0.06]} />
            <meshStandardMaterial color={trimColor} roughness={0.6} metalness={0.1} />
          </mesh>
        )}
      </group>
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
  const modelPick = stallHash(index + 31);
  const yaw = h2 > 0.5 ? 0 : Math.PI;
  const carModel = CAR_MODELS[Math.floor(modelPick * CAR_MODELS.length)];

  return (
    <group position={[0, 0.09, 0]} rotation={[0, yaw, 0]}>
      <GltfOrFallback
        url={carModel.url}
        targetSize={TARGET_CAR_LENGTH_FT}
        axis="z"
        rotateY={carModel.rotateY}
        scaleBoost={carModel.scaleBoost}
        fallback={<ProceduralCar h1={h1} />}
      />
    </group>
  );
}

function ProceduralCar({ h1 }: { h1: number }) {
  const color = CAR_PALETTE[Math.floor(h1 * CAR_PALETTE.length)];
  const wheelR = 0.65;
  const wheelW = 0.5;
  const bodyH = 1.5;
  const cabinH = 1.0;
  const bodyY = wheelR + bodyH / 2 - 0.15; // body overlaps wheels in wheel wells
  const cabinY = bodyY + bodyH / 2 + cabinH / 2 - 0.05;

  return (
    <group>
      {/* Wheels — 4 short cylinders, axle along world X. */}
      {[
        [+2.4, +4.5],
        [-2.4, +4.5],
        [+2.4, -4.5],
        [-2.4, -4.5],
      ].map(([wx, wz], i) => (
        <group key={i} position={[wx, wheelR, wz]} rotation={[0, 0, Math.PI / 2]}>
          {/* Tire */}
          <mesh castShadow receiveShadow>
            <cylinderGeometry args={[wheelR, wheelR, wheelW, 16]} />
            <meshStandardMaterial color="#1a1a1d" roughness={0.85} metalness={0.05} />
          </mesh>
          {/* Hub — coaxial mini-cylinder on the outer face */}
          <mesh position={[0, (wx > 0 ? 1 : -1) * (wheelW / 2 + 0.03), 0]}>
            <cylinderGeometry args={[wheelR * 0.4, wheelR * 0.4, 0.06, 12]} />
            <meshStandardMaterial color="#9aa0a6" roughness={0.35} metalness={0.7} />
          </mesh>
        </group>
      ))}

      {/* Lower body — chamfered box */}
      <RoundedBox
        args={[5.4, bodyH, 13.5]}
        radius={0.35}
        smoothness={3}
        position={[0, bodyY, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={color} roughness={0.32} metalness={0.5} />
      </RoundedBox>

      {/* Cabin / greenhouse — pulled slightly toward the rear */}
      <RoundedBox
        args={[4.8, cabinH, 7.0]}
        radius={0.3}
        smoothness={3}
        position={[0, cabinY, -0.6]}
        castShadow
      >
        <meshStandardMaterial color="#0c0c12" roughness={0.18} metalness={0.55} />
      </RoundedBox>

      {/* Windshield — glassy, slight rake forward */}
      <mesh position={[0, cabinY + 0.05, 3.05]} rotation={[-0.45, 0, 0]} castShadow>
        <planeGeometry args={[4.4, 1.2]} />
        <meshStandardMaterial
          color="#1a242e"
          emissive="#3a5a78"
          emissiveIntensity={0.15}
          roughness={0.06}
          metalness={0.9}
        />
      </mesh>
      {/* Rear window */}
      <mesh position={[0, cabinY + 0.05, -4.25]} rotation={[0.45, Math.PI, 0]} castShadow>
        <planeGeometry args={[4.4, 1.0]} />
        <meshStandardMaterial
          color="#1a242e"
          emissive="#3a5a78"
          emissiveIntensity={0.15}
          roughness={0.06}
          metalness={0.9}
        />
      </mesh>
      {/* Side windows — strip on each flank */}
      <mesh
        position={[2.41, cabinY, -0.6]}
        rotation={[0, Math.PI / 2, 0]}
      >
        <planeGeometry args={[6.4, 0.65]} />
        <meshStandardMaterial
          color="#0a121a"
          emissive="#2c4860"
          emissiveIntensity={0.12}
          roughness={0.06}
          metalness={0.9}
        />
      </mesh>
      <mesh
        position={[-2.41, cabinY, -0.6]}
        rotation={[0, -Math.PI / 2, 0]}
      >
        <planeGeometry args={[6.4, 0.65]} />
        <meshStandardMaterial
          color="#0a121a"
          emissive="#2c4860"
          emissiveIntensity={0.12}
          roughness={0.06}
          metalness={0.9}
        />
      </mesh>

      {/* Headlights — pair at the front bumper */}
      {[+1.7, -1.7].map((hx) => (
        <mesh key={`hl-${hx}`} position={[hx, bodyY - 0.05, 6.78]}>
          <boxGeometry args={[0.85, 0.4, 0.12]} />
          <meshStandardMaterial
            color="#fff8e0"
            emissive="#fff0c2"
            emissiveIntensity={1.4}
            roughness={0.3}
            metalness={0.2}
          />
        </mesh>
      ))}
      {/* Taillights — pair at the rear */}
      {[+1.7, -1.7].map((tx) => (
        <mesh key={`tl-${tx}`} position={[tx, bodyY - 0.05, -6.78]} rotation={[0, Math.PI, 0]}>
          <boxGeometry args={[0.85, 0.4, 0.12]} />
          <meshStandardMaterial
            color="#3a0808"
            emissive="#ff2a2a"
            emissiveIntensity={0.9}
            roughness={0.3}
            metalness={0.2}
          />
        </mesh>
      ))}

      {/* Front grille / lower bumper — small accent block */}
      <mesh position={[0, bodyY - 0.45, 6.78]}>
        <boxGeometry args={[3.6, 0.3, 0.1]} />
        <meshStandardMaterial color="#0c0c10" roughness={0.5} metalness={0.4} />
      </mesh>
      {/* Rear bumper line */}
      <mesh position={[0, bodyY - 0.45, -6.78]}>
        <boxGeometry args={[3.6, 0.3, 0.1]} />
        <meshStandardMaterial color="#0c0c10" roughness={0.5} metalness={0.4} />
      </mesh>
    </group>
  );
}

// Front entrance on the south face. Multi-layer construction reads as a real
// door from distance: outer trim band + dark recess + door panel + transom
// (glowing fanlight above) + bronze handle + 2-step stoop. Skipped if the
// door's footprint is occluded by a flush sibling building.
function FrontDoor({
  d,
  accent,
  preset,
  occludedSouth,
}: {
  d: number;
  accent: string;
  preset: MaterialPreset;
  occludedSouth: [number, number][];
}) {
  // Door span check — width 3.6 so half = 1.8.
  const halfW = 1.8;
  for (const [a, b] of occludedSouth) {
    if (a <= halfW && b >= -halfW) return null;
  }
  const doorH = 7.5;
  const doorW = 3.6;
  const transomH = 1.4;
  const yCenter = doorH / 2 + 0.05;
  const glow = preset.windowEmissive ?? accent;
  const trimColor = preset.floorLine;

  // LOD: hide sub-foot details (handle, mid-rail, panel seam, transom mullions,
  // nosing accents) when zoomed far enough that they'd be sub-pixel.
  const fineRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (fineRef.current) fineRef.current.visible = !LOD.midFar;
  });

  // Group sits ~0.2ft outside the south wall. Children at local +z are
  // closer to the south viewer (in front of the door panel); children at
  // local -z are tucked into the wall behind the door (frame border).
  return (
    <group position={[0, yCenter, -d / 2 - 0.2]} rotation={[0, Math.PI, 0]}>
      {/* Layer offsets spread ≥0.04ft apart so log-depth keeps them ordered
          at long camera distances. Local +z = closer to the south viewer. */}
      {/* Outer trim — wide surround in the building's trim color. Always on. */}
      <mesh position={[0, transomH / 2, -0.1]}>
        <planeGeometry args={[doorW + 0.9, doorH + transomH + 0.6]} />
        <meshStandardMaterial
          color={trimColor}
          roughness={0.7}
          metalness={preset.metalness * 0.4}
        />
      </mesh>
      {/* Dark recess — gives the door real visual depth. */}
      <mesh position={[0, transomH / 2, -0.05]}>
        <planeGeometry args={[doorW + 0.4, doorH + transomH + 0.2]} />
        <meshStandardMaterial color="#080810" roughness={0.5} metalness={0.2} />
      </mesh>
      {/* Door panel — dark stained wood feel. Always on. */}
      <mesh position={[0, 0, 0]}>
        <planeGeometry args={[doorW, doorH]} />
        <meshStandardMaterial color="#2a1a10" roughness={0.55} metalness={0.18} />
      </mesh>
      {/* Transom (glowing fanlight) — always on; the glow is what makes the
          entrance read from any zoom. */}
      <mesh position={[0, doorH / 2 + transomH / 2 + 0.05, 0.05]}>
        <planeGeometry args={[doorW, transomH]} />
        <meshStandardMaterial
          color="#0a0a10"
          emissive={glow}
          emissiveIntensity={0.65}
          roughness={0.1}
          metalness={0.55}
        />
      </mesh>

      {/* Fine details — hidden at long camera distances to kill shimmer. */}
      <group ref={fineRef}>
        {/* Recessed center seam — vertical inset line gives a 6-panel-door feel. */}
        <mesh position={[0, 0, 0.05]}>
          <boxGeometry args={[0.08, doorH * 0.84, 0.06]} />
          <meshStandardMaterial color="#0a0408" roughness={0.5} metalness={0.1} />
        </mesh>
        {/* Horizontal mid-rail — splits door into upper and lower panels. */}
        <mesh position={[0, doorH * 0.05, 0.05]}>
          <boxGeometry args={[doorW * 0.95, 0.16, 0.07]} />
          <meshStandardMaterial color="#1a0e08" roughness={0.55} metalness={0.1} />
        </mesh>
        {/* Bronze handle — small projecting box on the right edge. */}
        <mesh position={[doorW * 0.36, -0.4, 0.12]} castShadow>
          <boxGeometry args={[0.16, 0.55, 0.18]} />
          <meshStandardMaterial
            color="#b89466"
            emissive="#3a2a14"
            emissiveIntensity={0.2}
            roughness={0.3}
            metalness={0.85}
          />
        </mesh>
        {/* Escutcheon backing plate around the handle. */}
        <mesh position={[doorW * 0.36, -0.4, 0.07]}>
          <planeGeometry args={[0.4, 0.8]} />
          <meshStandardMaterial color="#2a1a0a" roughness={0.5} metalness={0.4} />
        </mesh>
        {/* Transom mullions — three vertical bars across the fanlight. */}
        {[-doorW * 0.27, 0, doorW * 0.27].map((mx, i) => (
          <mesh
            key={`tm-${i}`}
            position={[mx, doorH / 2 + transomH / 2 + 0.05, 0.1]}
          >
            <boxGeometry args={[0.08, transomH * 0.95, 0.05]} />
            <meshStandardMaterial color={trimColor} roughness={0.6} />
          </mesh>
        ))}
        {/* Stoop nosing accent — 0.04ft thin, hidden at midFar like other
            fine detail. */}
        <mesh position={[0, -doorH / 2 - 0.5, 1.18]}>
          <boxGeometry args={[doorW + 1.6, 0.04, 0.04]} />
          <meshStandardMaterial color="#bdbdc4" roughness={0.6} />
        </mesh>
        <mesh position={[0, -doorH / 2 - 0.95, 2.23]}>
          <boxGeometry args={[doorW + 2.6, 0.04, 0.04]} />
          <meshStandardMaterial color="#bdbdc4" roughness={0.6} />
        </mesh>
      </group>
      {/* Stoop steps — chunky enough to read at any zoom. */}
      <mesh position={[0, -doorH / 2 - 0.25, 0.6]} castShadow receiveShadow>
        <boxGeometry args={[doorW + 1.6, 0.5, 1.2]} />
        <meshStandardMaterial color="#666670" roughness={0.85} />
      </mesh>
      <mesh position={[0, -doorH / 2 - 0.7, 1.55]} castShadow receiveShadow>
        <boxGeometry args={[doorW + 2.6, 0.5, 1.4]} />
        <meshStandardMaterial color="#76767e" roughness={0.85} />
      </mesh>
    </group>
  );
}

// Rooftop HVAC — small grey utility boxes scattered on flat roofs. Count and
// position derived from footprint so big roofs get more units, small roofs
// get one or two. Adds the unmistakable "real building" silhouette.
function RooftopHVAC({
  w,
  d,
  baseY,
}: {
  w: number;
  d: number;
  baseY: number;
}) {
  const footprint = w * d;
  const count = Math.min(6, Math.max(1, Math.floor(footprint / 1200)));
  // Deterministic placement keyed on footprint, so the same building gets
  // the same HVAC arrangement every render.
  const seed = (n: number) => stallHash(n + Math.floor(w + d * 31));

  const units = useMemo(() => {
    const out: { x: number; z: number; w: number; d: number; h: number }[] = [];
    const margin = 4;
    for (let i = 0; i < count; i++) {
      const r1 = seed(i * 3 + 1);
      const r2 = seed(i * 3 + 2);
      const r3 = seed(i * 3 + 3);
      const uw = 4 + r3 * 4; // 4-8 ft wide
      const ud = 3 + r1 * 3; // 3-6 ft deep
      const uh = 1.2 + r2 * 1.6; // 1.2-2.8 ft tall
      const x = (r1 - 0.5) * (w - uw - margin * 2);
      const z = (r2 - 0.5) * (d - ud - margin * 2);
      out.push({ x, z, w: uw, d: ud, h: uh });
    }
    return out;
  }, [w, d, count]);

  return (
    <group position={[0, baseY, 0]}>
      {units.map((u, i) => (
        <group key={i} position={[u.x, u.h / 2, u.z]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[u.w, u.h, u.d]} />
            <meshStandardMaterial
              color={COLORS.hvac}
              roughness={0.55}
              metalness={0.35}
            />
            <Edges color={COLORS.hvacEdge} lineWidth={0.5} />
          </mesh>
          {/* Vent grille on top */}
          <mesh position={[0, u.h / 2 + 0.02, 0]}>
            <boxGeometry args={[u.w * 0.7, 0.06, u.d * 0.7]} />
            <meshStandardMaterial color={COLORS.hvacEdge} roughness={0.7} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// Pitched gable roof — used for residential materials (wood, brick, stucco).
// Triangular prism whose ridge runs along whichever footprint axis is longer,
// so the roof never looks awkwardly squat on a long-and-skinny building.
function GableRoof({
  w,
  d,
  baseY,
  color,
  edge,
  roughness,
}: {
  w: number;
  d: number;
  baseY: number;
  color: string;
  edge: string;
  roughness: number;
}) {
  const ridgeAlongZ = d >= w;
  const span = ridgeAlongZ ? w : d;
  const length = ridgeAlongZ ? d : w;
  const ridgeHeight = Math.min(span * 0.35, 14);
  const overhang = 0.6;

  const shape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-(span / 2 + overhang), 0);
    s.lineTo(span / 2 + overhang, 0);
    s.lineTo(0, ridgeHeight);
    s.closePath();
    return s;
  }, [span, ridgeHeight]);

  const extrudeArgs = useMemo<[THREE.Shape, THREE.ExtrudeGeometryOptions]>(
    () => [shape, { depth: length + overhang * 2, bevelEnabled: false }],
    [shape, length]
  );

  // ExtrudeGeometry pushes along +Z. With a +PI/2 Y-rotation, local +Z maps to
  // scene +X (right-handed system), so the geometry lands at scene X in
  // [0, length+2*overhang]. Shift -X by half that extent to re-center the
  // roof over the building footprint.
  return (
    <group
      position={[
        ridgeAlongZ ? 0 : -(length / 2 + overhang),
        baseY,
        ridgeAlongZ ? -(length / 2 + overhang) : 0,
      ]}
      rotation={[0, ridgeAlongZ ? 0 : Math.PI / 2, 0]}
    >
      <mesh castShadow receiveShadow>
        <extrudeGeometry args={extrudeArgs} />
        <meshStandardMaterial color={color} roughness={roughness} metalness={0} />
        <Edges color={edge} lineWidth={0.6} threshold={20} />
      </mesh>
    </group>
  );
}

type BuildingProps = {
  building: NonNullable<SitePlan["buildings"]>[number];
  siblings: NonNullable<SitePlan["buildings"]>;
  valid: boolean;
  accent: string;
  delay?: number;
};

// Dispatcher — routes to specialized renderers when structure_type calls for
// a non-standard shape (open parking decks, transparent greenhouse, open
// pavilion). Anything else falls through to the standard massing renderer.
function Building(props: BuildingProps) {
  const t: StructureType | undefined = props.building.structure_type;
  if (props.valid) {
    if (t === "parking_garage") return <ParkingGarageBuilding {...props} />;
    if (t === "greenhouse") return <GreenhouseBuilding {...props} />;
    if (t === "pavilion") return <PavilionBuilding {...props} />;
  }
  return <DefaultBuilding {...props} />;
}

// Multi-level open parking deck — concrete slabs supported by columns.
function ParkingGarageBuilding({
  building,
  valid,
  accent,
  delay = 0.1,
}: BuildingProps) {
  const height = building.stories * STORY_HEIGHT_FT;
  const cx = building.x + building.w / 2;
  const cz = building.z + building.d / 2;
  const ref = useGrowUp<THREE.Group>(0.75, delay);

  const concrete = MATERIAL_PRESETS.concrete;
  const slabT = 1.2;
  const colW = 1.4;
  const half = colW / 2;
  const bodyColor = valid ? concrete.body : COLORS.buildingInvalid;
  const edgeColor = valid ? concrete.edge : COLORS.buildingInvalid;

  const cols = useMemo(() => {
    const halfW = building.w / 2;
    const halfD = building.d / 2;
    const list: [number, number][] = [
      [-halfW + half, -halfD + half],
      [+halfW - half, -halfD + half],
      [-halfW + half, +halfD - half],
      [+halfW - half, +halfD - half],
    ];
    const segCount = (len: number) => Math.max(0, Math.floor(len / 30) - 1);
    const wMid = segCount(building.w);
    for (let i = 1; i <= wMid; i++) {
      const x = -halfW + (building.w * i) / (wMid + 1);
      list.push([x, -halfD + half], [x, +halfD - half]);
    }
    const dMid = segCount(building.d);
    for (let i = 1; i <= dMid; i++) {
      const z = -halfD + (building.d * i) / (dMid + 1);
      list.push([-halfW + half, z], [+halfW - half, z]);
    }
    return list;
  }, [building.w, building.d, half]);

  return (
    <group ref={ref} position={[cx, Y.lotTop, cz]}>
      {/* Floor slabs — N+1 (ground + each level + roof) */}
      {Array.from({ length: building.stories + 1 }).map((_, i) => {
        const isGround = i === 0;
        const t = isGround ? slabT * 1.5 : slabT;
        const y = i * STORY_HEIGHT_FT + t / 2;
        return (
          <mesh
            key={`slab-${i}`}
            position={[0, y, 0]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[building.w, t, building.d]} />
            <meshStandardMaterial
              color={bodyColor}
              roughness={concrete.roughness}
              metalness={concrete.metalness}
            />
            <Edges color={edgeColor} lineWidth={0.6} />
          </mesh>
        );
      })}

      {/* Columns — full height */}
      {cols.map(([x, z], i) => (
        <mesh
          key={`col-${i}`}
          position={[x, height / 2 + slabT, z]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[colW, height + 2 * slabT, colW]} />
          <meshStandardMaterial
            color={bodyColor}
            roughness={concrete.roughness}
            metalness={concrete.metalness}
          />
        </mesh>
      ))}

      {/* Top parapet — knee walls so the roof deck reads as enclosed */}
      {[
        { p: [0, height + slabT + 1.4, building.d / 2 - 0.2], s: [building.w, 0.8, 0.4] },
        { p: [0, height + slabT + 1.4, -(building.d / 2 - 0.2)], s: [building.w, 0.8, 0.4] },
        { p: [building.w / 2 - 0.2, height + slabT + 1.4, 0], s: [0.4, 0.8, building.d] },
        { p: [-(building.w / 2 - 0.2), height + slabT + 1.4, 0], s: [0.4, 0.8, building.d] },
      ].map((wall, i) => (
        <mesh
          key={`para-${i}`}
          position={wall.p as [number, number, number]}
          castShadow
        >
          <boxGeometry args={wall.s as [number, number, number]} />
          <meshStandardMaterial color={bodyColor} roughness={0.9} />
        </mesh>
      ))}

      {/* Accent stripe atop parapet */}
      <mesh position={[0, height + slabT + 2.0, 0]}>
        <boxGeometry args={[building.w + 0.1, 0.18, building.d + 0.1]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={0.45}
          roughness={0.4}
        />
      </mesh>

      <Html position={[0, height + slabT + 6, 0]} center>
        <div className="whitespace-nowrap rounded bg-paper px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-ink shadow-md">
          {building.w}×{building.d} ft · {building.stories}-level garage
        </div>
      </Html>
    </group>
  );
}

// Translucent glass greenhouse with frame ribs and a peaked roof.
function GreenhouseBuilding({
  building,
  valid,
  delay = 0.1,
}: BuildingProps) {
  const height = building.stories * STORY_HEIGHT_FT;
  const cx = building.x + building.w / 2;
  const cz = building.z + building.d / 2;
  const ref = useGrowUp<THREE.Group>(0.75, delay);

  const frameColor = valid ? "#1f2a24" : COLORS.buildingInvalid;
  const glassColor = "#bcd5d8";

  const ribsAlong = (len: number) => {
    const count = Math.max(2, Math.floor(len / 5));
    return Array.from({ length: count + 1 }, (_, i) => -len / 2 + (len * i) / count);
  };
  const xRibs = ribsAlong(building.w);
  const zRibs = ribsAlong(building.d);

  const ridgeH = Math.min((Math.min(building.w, building.d) / 2) * 0.6, 12);
  const ridgeAlongZ = building.d >= building.w;
  const span = ridgeAlongZ ? building.w : building.d;
  const length = ridgeAlongZ ? building.d : building.w;

  const roofShape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-span / 2, 0);
    s.lineTo(span / 2, 0);
    s.lineTo(0, ridgeH);
    s.closePath();
    return s;
  }, [span, ridgeH]);
  const roofExtrudeArgs = useMemo<[THREE.Shape, THREE.ExtrudeGeometryOptions]>(
    () => [roofShape, { depth: length, bevelEnabled: false }],
    [roofShape, length]
  );

  return (
    <group ref={ref} position={[cx, Y.lotTop, cz]}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[building.w, height, building.d]} />
        <meshPhysicalMaterial
          color={glassColor}
          transparent
          opacity={0.32}
          transmission={0.6}
          roughness={0.06}
          metalness={0}
          ior={1.4}
        />
      </mesh>

      <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
        <boxGeometry args={[building.w + 0.2, 0.4, building.d + 0.2]} />
        <meshStandardMaterial color="#7a8076" roughness={0.9} />
      </mesh>

      {[height + 0.05, 0.6].map((y, i) => (
        <mesh key={`rail-${i}`} position={[0, y, 0]}>
          <boxGeometry args={[building.w + 0.1, 0.18, building.d + 0.1]} />
          <meshStandardMaterial color={frameColor} roughness={0.4} metalness={0.5} />
        </mesh>
      ))}

      {xRibs.map((x, i) => (
        <group key={`xrib-${i}`}>
          <mesh position={[x, height / 2, building.d / 2 + 0.04]}>
            <boxGeometry args={[0.18, height, 0.08]} />
            <meshStandardMaterial color={frameColor} roughness={0.4} metalness={0.5} />
          </mesh>
          <mesh position={[x, height / 2, -building.d / 2 - 0.04]}>
            <boxGeometry args={[0.18, height, 0.08]} />
            <meshStandardMaterial color={frameColor} roughness={0.4} metalness={0.5} />
          </mesh>
        </group>
      ))}
      {zRibs.map((z, i) => (
        <group key={`zrib-${i}`}>
          <mesh position={[building.w / 2 + 0.04, height / 2, z]}>
            <boxGeometry args={[0.08, height, 0.18]} />
            <meshStandardMaterial color={frameColor} roughness={0.4} metalness={0.5} />
          </mesh>
          <mesh position={[-building.w / 2 - 0.04, height / 2, z]}>
            <boxGeometry args={[0.08, height, 0.18]} />
            <meshStandardMaterial color={frameColor} roughness={0.4} metalness={0.5} />
          </mesh>
        </group>
      ))}

      <group
        position={[0, height, ridgeAlongZ ? -length / 2 : 0]}
        rotation={[0, ridgeAlongZ ? 0 : Math.PI / 2, 0]}
      >
        <mesh castShadow receiveShadow>
          <extrudeGeometry args={roofExtrudeArgs} />
          <meshPhysicalMaterial
            color={glassColor}
            transparent
            opacity={0.32}
            transmission={0.6}
            roughness={0.06}
            metalness={0}
            ior={1.4}
          />
        </mesh>
        <mesh position={[0, ridgeH, length / 2]}>
          <boxGeometry args={[0.18, 0.18, length + 0.05]} />
          <meshStandardMaterial color={frameColor} roughness={0.4} metalness={0.5} />
        </mesh>
      </group>

      <Html position={[0, height + ridgeH + 4, 0]} center>
        <div className="whitespace-nowrap rounded bg-paper px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-ink shadow-md">
          {building.w}×{building.d} ft · greenhouse
        </div>
      </Html>
    </group>
  );
}

// Open shelter — gable roof on corner columns, single story.
function PavilionBuilding({
  building,
  delay = 0.1,
}: BuildingProps) {
  const height = STORY_HEIGHT_FT;
  const cx = building.x + building.w / 2;
  const cz = building.z + building.d / 2;
  const ref = useGrowUp<THREE.Group>(0.75, delay);

  const woodTrim = "#7a543a";
  const beam = "#3d2316";
  const roofColor = "#3a2418";
  const slabColor = "#bdb6a4";
  const colW = 1.0;

  const needMidX = building.w > 32;
  const needMidZ = building.d > 32;

  const colPositions = useMemo(() => {
    const halfW = building.w / 2 - colW;
    const halfD = building.d / 2 - colW;
    const list: [number, number][] = [
      [-halfW, -halfD],
      [+halfW, -halfD],
      [-halfW, +halfD],
      [+halfW, +halfD],
    ];
    if (needMidX) list.push([0, -halfD], [0, +halfD]);
    if (needMidZ) list.push([-halfW, 0], [+halfW, 0]);
    return list;
  }, [building.w, building.d, needMidX, needMidZ]);

  return (
    <group ref={ref} position={[cx, Y.lotTop, cz]}>
      <mesh position={[0, 0.2, 0]} receiveShadow>
        <boxGeometry args={[building.w, 0.4, building.d]} />
        <meshStandardMaterial color={slabColor} roughness={0.92} />
        <Edges color="#5a564b" lineWidth={0.5} />
      </mesh>

      {colPositions.map(([x, z], i) => (
        <mesh
          key={`col-${i}`}
          position={[x, height / 2, z]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[colW, height, colW]} />
          <meshStandardMaterial color={woodTrim} roughness={0.85} />
        </mesh>
      ))}

      {/* Beam ring */}
      <mesh position={[0, height + 0.2, building.d / 2 - 0.3]}>
        <boxGeometry args={[building.w + 0.1, 0.4, 0.6]} />
        <meshStandardMaterial color={beam} roughness={0.85} />
      </mesh>
      <mesh position={[0, height + 0.2, -(building.d / 2 - 0.3)]}>
        <boxGeometry args={[building.w + 0.1, 0.4, 0.6]} />
        <meshStandardMaterial color={beam} roughness={0.85} />
      </mesh>

      <GableRoof
        w={building.w}
        d={building.d}
        baseY={height + 0.4}
        color={roofColor}
        edge={beam}
        roughness={0.85}
      />

      <Html position={[0, height + 8, 0]} center>
        <div className="whitespace-nowrap rounded bg-paper px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-ink shadow-md">
          {building.w}×{building.d} ft · pavilion
        </div>
      </Html>
    </group>
  );
}

function DefaultBuilding({
  building,
  siblings,
  valid,
  accent,
  delay = 0.1,
}: BuildingProps) {
  const height = building.stories * STORY_HEIGHT_FT;
  const cx = building.x + building.w / 2;
  const cz = building.z + building.d / 2;

  // Anchor at the base so growth scales upward from the lot, not the center.
  const ref = useGrowUp<THREE.Group>(0.75, delay);
  const preset = presetFor(building.material);

  // Where this building shares a face with another same-material/same-stories
  // neighbor (i.e. an L-shape decomposed into two boxes), suppress the windows
  // on the interior face so the cluster reads as one continuous building.
  const occluded = useMemo<OccludedSpans>(() => {
    const eps = 0.5;
    const spans: OccludedSpans = { n: [], s: [], e: [], w: [] };
    const bX0 = building.x;
    const bX1 = building.x + building.w;
    const bZ0 = building.z;
    const bZ1 = building.z + building.d;
    for (const o of siblings) {
      if (o === building) continue;
      if (o.material !== building.material) continue;
      if (o.stories !== building.stories) continue;
      const oX0 = o.x;
      const oX1 = o.x + o.w;
      const oZ0 = o.z;
      const oZ1 = o.z + o.d;
      // East face flush — neighbor sits at +x with overlapping z.
      if (Math.abs(oX0 - bX1) < eps) {
        const z0 = Math.max(bZ0, oZ0);
        const z1 = Math.min(bZ1, oZ1);
        if (z1 > z0 + eps) spans.e.push([z0 - cz, z1 - cz]);
      }
      // West face flush — neighbor at -x.
      if (Math.abs(oX1 - bX0) < eps) {
        const z0 = Math.max(bZ0, oZ0);
        const z1 = Math.min(bZ1, oZ1);
        if (z1 > z0 + eps) spans.w.push([z0 - cz, z1 - cz]);
      }
      // North face flush — neighbor at +z.
      if (Math.abs(oZ0 - bZ1) < eps) {
        const x0 = Math.max(bX0, oX0);
        const x1 = Math.min(bX1, oX1);
        if (x1 > x0 + eps) spans.n.push([x0 - cx, x1 - cx]);
      }
      // South face flush — neighbor at -z.
      if (Math.abs(oZ1 - bZ0) < eps) {
        const x0 = Math.max(bX0, oX0);
        const x1 = Math.min(bX1, oX1);
        if (x1 > x0 + eps) spans.s.push([x0 - cx, x1 - cx]);
      }
    }
    return spans;
  }, [building, siblings, cx, cz]);
  const bodyColor = valid ? preset.body : COLORS.buildingInvalid;
  const edgeColor = valid ? preset.edge : COLORS.buildingInvalid;
  const roofColor = valid ? preset.roof : COLORS.buildingInvalid;

  return (
    <group ref={ref} position={[cx, Y.lotTop, cz]}>
      {/* Body — single continuous mass (no story seams). The plinth's bottom
          face sinks below local y=0 (into the lot mesh) and its top sits below
          the body's bottom, so neither face is coplanar with the body's faces
          — eliminates the z-fight that shows up at long camera distances. The
          single rectilinear volume gives windows / doors a flat plane to sit
          on; cornices read as deliberate trim, not stacking artifacts. */}
      <mesh position={[0, 0.325, 0]} castShadow receiveShadow>
        <boxGeometry args={[building.w + 0.5, 0.75, building.d + 0.5]} />
        <meshStandardMaterial
          color={preset.floorLine}
          roughness={0.85}
          metalness={preset.metalness * 0.4}
        />
      </mesh>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[building.w, height, building.d]} />
        <meshStandardMaterial
          color={bodyColor}
          roughness={preset.roughness}
          metalness={preset.metalness}
        />
        <Edges color={edgeColor} lineWidth={1.0} threshold={20} />
      </mesh>

      {/* Windows — per story per face. Skipped for invalid (red) buildings. */}
      {valid &&
        Array.from({ length: building.stories }).map((_, i) => (
          <StoryWindows
            key={`win-${i}`}
            storyIndex={i}
            w={building.w}
            d={building.d}
            accent={accent}
            preset={preset}
            occluded={occluded}
          />
        ))}

      {/* Floor-line cornice — wraps the building at each story boundary. A
          chunky belt course (0.25ft tall, projecting 0.15ft) reads at any
          zoom and matches real architectural trim, instead of the previous
          0.06 × 0.04 hairline that turned into shimmer at distance. */}
      {Array.from({ length: Math.max(0, building.stories - 1) }).map((_, i) => {
        const y = (i + 1) * STORY_HEIGHT_FT - 0.125;
        return (
          <mesh
            key={`fl-${i}`}
            position={[0, y, 0]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[building.w + 0.3, 0.25, building.d + 0.3]} />
            <meshStandardMaterial
              color={preset.floorLine}
              roughness={0.55}
              metalness={preset.metalness * 0.4}
            />
          </mesh>
        );
      })}

      {/* Front entrance — multi-layer real door on the south face. Skipped
          if the door's footprint is occluded by a flush sibling building. */}
      {valid && (
        <FrontDoor
          d={building.d}
          accent={accent}
          preset={preset}
          occludedSouth={occluded.s}
        />
      )}

      {/* Roof — gable for low-rise residential, flat parapet otherwise.
          Gables look absurd on tall buildings, so anything above 2 stories
          forces a flat roof regardless of material preset. */}
      {preset.roofStyle === "gable" && valid && building.stories <= 2 ? (
        <GableRoof
          w={building.w}
          d={building.d}
          baseY={height}
          color={roofColor}
          edge={edgeColor}
          roughness={Math.min(0.95, preset.roughness + 0.05)}
        />
      ) : (
        <>
          {/* Flat parapet cap */}
          <mesh position={[0, height + 0.4, 0]} castShadow>
            <boxGeometry args={[building.w + 0.3, 0.8, building.d + 0.3]} />
            <meshStandardMaterial
              color={roofColor}
              roughness={preset.roughness}
              metalness={preset.metalness * 0.6}
            />
          </mesh>
          {/* Accent stripe across parapet top — keeps the brand color present on commercial blocks */}
          <mesh position={[0, height + 0.85, 0]}>
            <boxGeometry args={[building.w + 0.34, 0.15, building.d + 0.34]} />
            <meshStandardMaterial
              color={valid ? accent : COLORS.buildingInvalid}
              emissive={valid ? accent : COLORS.buildingInvalid}
              emissiveIntensity={valid ? 0.45 : 0.2}
              roughness={0.4}
              metalness={0.1}
            />
          </mesh>
          {/* Rooftop HVAC — placed on flat roofs only. Count scales with footprint. */}
          {valid && (
            <RooftopHVAC w={building.w} d={building.d} baseY={height + 0.95} />
          )}
        </>
      )}

      <Html position={[0, height + 6, 0]} center>
        <div className="whitespace-nowrap rounded bg-paper px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-ink shadow-md">
          {building.w}×{building.d} ft · {building.stories} stories
          {preset.label && (
            <span className="ml-1 text-mute">· {preset.label}</span>
          )}
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
  const surfaceY = stallThickness / 2;
  const stripeY = surfaceY + 0.012;

  return (
    <group ref={ref} position={[x + 4.5, yCenter, z + 9]}>
      {/* Asphalt slab — lighter so cars and stripes read */}
      <mesh receiveShadow castShadow>
        <boxGeometry args={[9, stallThickness, 18]} />
        <meshStandardMaterial color={COLORS.stall} roughness={0.85} metalness={0.05} />
        <Edges color={COLORS.stallEdge} lineWidth={0.5} />
      </mesh>

      {/* Side stripes — bright cream paint, slightly raised so they don't z-fight */}
      <mesh position={[-3.0, stripeY, 0]}>
        <boxGeometry args={[0.32, 0.02, 16]} />
        <meshStandardMaterial
          color={COLORS.stallStripe}
          emissive={COLORS.stallStripe}
          emissiveIntensity={0.12}
          roughness={0.55}
        />
      </mesh>
      <mesh position={[3.0, stripeY, 0]}>
        <boxGeometry args={[0.32, 0.02, 16]} />
        <meshStandardMaterial
          color={COLORS.stallStripe}
          emissive={COLORS.stallStripe}
          emissiveIntensity={0.12}
          roughness={0.55}
        />
      </mesh>

      {/* End-of-stall stripe (back curb line) */}
      <mesh position={[0, stripeY, -8.4]}>
        <boxGeometry args={[6.2, 0.02, 0.32]} />
        <meshStandardMaterial
          color={COLORS.stallStripe}
          emissive={COLORS.stallStripe}
          emissiveIntensity={0.1}
          roughness={0.55}
        />
      </mesh>

      {/* Concrete wheel stop — anchors the back of every stall */}
      <mesh position={[0, surfaceY + 0.18, -7.4]} castShadow receiveShadow>
        <boxGeometry args={[5.2, 0.36, 0.5]} />
        <meshStandardMaterial color={COLORS.wheelStop} roughness={0.95} metalness={0} />
      </mesh>

      {occupied && <Car index={index} />}
    </group>
  );
}

// ----- Trees ----------------------------------------------------------------

const TREE_COLORS = {
  trunk: "#5a3a26",
  trunkEdge: "#2f1d12",
  oakLeaf: "#3d6b3a",
  oakLeafShadow: "#2a4a28",
  pineLeaf: "#2c4a2c",
  pineLeafShadow: "#1a2e1a",
  palmFrond: "#4d7a3c",
  palmTrunk: "#8a6a44",
  mapleLeaf: "#7a3a26",
  mapleLeafShadow: "#5a2818",
};

// ----- Street furniture / props ---------------------------------------------

function StreetPropMesh({
  prop,
  delay = 0,
}: {
  prop: StreetProp;
  delay?: number;
}) {
  const ref = useFadeIn<THREE.Group>(0.35, delay);
  const config = PROP_MODELS[prop.kind];
  const yawRad = ((prop.yaw ?? 0) * Math.PI) / 180;

  // Generic block fallback so a missing GLB doesn't crash the canvas.
  const fallback = (
    <mesh
      position={[0, config.targetHeightFt / 2, 0]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[1.4, config.targetHeightFt, 1.4]} />
      <meshStandardMaterial color="#5a5a60" roughness={0.85} />
    </mesh>
  );

  return (
    <group ref={ref} position={[prop.x, 0, prop.z]} rotation={[0, yawRad, 0]}>
      <GltfOrFallback
        url={config.url}
        targetSize={config.targetHeightFt}
        axis="y"
        rotateY={config.rotateY}
        scaleBoost={config.scaleBoost}
        fallback={fallback}
      />
    </group>
  );
}

function TreeMesh({ tree, delay = 0 }: { tree: Tree; delay?: number }) {
  const ref = useRef<THREE.Group>(null);
  const t = useRef(0);
  const elapsed = useRef(0);

  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    elapsed.current += dt;
    if (elapsed.current < delay) {
      m.scale.set(0.0001, 0.0001, 0.0001);
      return;
    }
    if (t.current >= 1) return;
    t.current = Math.min(1, t.current + dt / 0.45);
    const e = 1 - Math.pow(1 - t.current, 3);
    const s = Math.max(0.0001, e);
    m.scale.set(s, s, s);
  });

  // Slight per-tree yaw + scale variation so a row of identical GLTFs doesn't
  // read as cloned. Deterministic by position so the plan is reproducible.
  const seed = stallHash(Math.round(tree.x * 7 + tree.z * 13));
  const yaw = seed * Math.PI * 2;
  const sizeJitter = 0.92 + seed * 0.16; // 0.92 - 1.08
  const modelEntry = TREE_MODELS[tree.species];

  const fallback =
    tree.species === "oak" ? <OakTree height={tree.height} /> :
    tree.species === "pine" ? <PineTree height={tree.height} /> :
    tree.species === "palm" ? <PalmTree height={tree.height} /> :
    <MapleTree height={tree.height} />;

  return (
    <group ref={ref} position={[tree.x, 0, tree.z]} rotation={[0, yaw, 0]}>
      <GltfOrFallback
        url={modelEntry.url}
        targetSize={tree.height * sizeJitter}
        axis="y"
        rotateY={modelEntry.rotateY}
        scaleBoost={modelEntry.scaleBoost}
        fallback={fallback}
      />
    </group>
  );
}

function OakTree({ height }: { height: number }) {
  const trunkH = height * 0.35;
  const trunkR = Math.max(0.6, height * 0.05);
  const canopyR = height * 0.42;
  return (
    <group>
      <mesh position={[0, trunkH / 2, 0]} castShadow>
        <cylinderGeometry args={[trunkR, trunkR * 1.15, trunkH, 8]} />
        <meshStandardMaterial color={TREE_COLORS.trunk} roughness={0.95} />
      </mesh>
      <mesh position={[0, trunkH + canopyR * 0.7, 0]} castShadow>
        <sphereGeometry args={[canopyR, 10, 8]} />
        <meshStandardMaterial color={TREE_COLORS.oakLeaf} roughness={0.85} />
      </mesh>
      {/* Asymmetric secondary clump for organic silhouette */}
      <mesh
        position={[canopyR * 0.35, trunkH + canopyR * 0.5, canopyR * 0.2]}
        castShadow
      >
        <sphereGeometry args={[canopyR * 0.55, 8, 6]} />
        <meshStandardMaterial color={TREE_COLORS.oakLeafShadow} roughness={0.85} />
      </mesh>
    </group>
  );
}

function PineTree({ height }: { height: number }) {
  const trunkH = height * 0.18;
  const trunkR = Math.max(0.5, height * 0.04);
  const layers = 3;
  const totalConeH = height - trunkH;
  const baseR = height * 0.3;
  return (
    <group>
      <mesh position={[0, trunkH / 2, 0]} castShadow>
        <cylinderGeometry args={[trunkR, trunkR * 1.1, trunkH, 8]} />
        <meshStandardMaterial color={TREE_COLORS.trunk} roughness={0.95} />
      </mesh>
      {Array.from({ length: layers }).map((_, i) => {
        const layerH = totalConeH / layers;
        const r = baseR * (1 - i * 0.18);
        const y = trunkH + i * layerH * 0.85 + layerH / 2;
        return (
          <mesh key={i} position={[0, y, 0]} castShadow>
            <coneGeometry args={[r, layerH * 1.1, 8]} />
            <meshStandardMaterial
              color={i % 2 === 0 ? TREE_COLORS.pineLeaf : TREE_COLORS.pineLeafShadow}
              roughness={0.9}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function PalmTree({ height }: { height: number }) {
  const trunkH = height * 0.78;
  const trunkR = Math.max(0.5, height * 0.04);
  const frondCount = 7;
  const frondLen = height * 0.32;
  return (
    <group>
      <mesh position={[0, trunkH / 2, 0]} castShadow>
        <cylinderGeometry args={[trunkR * 0.9, trunkR * 1.1, trunkH, 10]} />
        <meshStandardMaterial color={TREE_COLORS.palmTrunk} roughness={0.9} />
      </mesh>
      {Array.from({ length: frondCount }).map((_, i) => {
        const angle = (i / frondCount) * Math.PI * 2;
        const dx = Math.cos(angle) * frondLen * 0.5;
        const dz = Math.sin(angle) * frondLen * 0.5;
        return (
          <mesh
            key={i}
            position={[dx, trunkH + frondLen * 0.15, dz]}
            rotation={[0, -angle, -0.6]}
            castShadow
          >
            <boxGeometry args={[frondLen, 0.4, 1.6]} />
            <meshStandardMaterial color={TREE_COLORS.palmFrond} roughness={0.7} />
          </mesh>
        );
      })}
      {/* Coconut cluster */}
      <mesh position={[0, trunkH + 0.6, 0]} castShadow>
        <sphereGeometry args={[1.2, 6, 5]} />
        <meshStandardMaterial color={TREE_COLORS.palmTrunk} roughness={0.85} />
      </mesh>
    </group>
  );
}

function MapleTree({ height }: { height: number }) {
  const trunkH = height * 0.4;
  const trunkR = Math.max(0.55, height * 0.045);
  const canopyR = height * 0.4;
  return (
    <group>
      <mesh position={[0, trunkH / 2, 0]} castShadow>
        <cylinderGeometry args={[trunkR, trunkR * 1.15, trunkH, 8]} />
        <meshStandardMaterial color={TREE_COLORS.trunk} roughness={0.95} />
      </mesh>
      <mesh position={[0, trunkH + canopyR * 0.6, 0]} castShadow>
        <sphereGeometry args={[canopyR, 10, 8]} />
        <meshStandardMaterial color={TREE_COLORS.mapleLeaf} roughness={0.85} />
      </mesh>
      <mesh
        position={[-canopyR * 0.3, trunkH + canopyR * 0.4, -canopyR * 0.2]}
        castShadow
      >
        <sphereGeometry args={[canopyR * 0.6, 8, 6]} />
        <meshStandardMaterial color={TREE_COLORS.mapleLeafShadow} roughness={0.85} />
      </mesh>
    </group>
  );
}

// ----- Walkways -------------------------------------------------------------

const WALKWAY_COLORS = {
  flagstone: { fill: "#a89a82", edge: "#665a48" },
  concrete: { fill: "#c2bdb2", edge: "#7a766f" },
  asphalt: { fill: "#3a3a3e", edge: "#1a1a1e" },
};

function WalkwayMesh({ walkway, delay = 0 }: { walkway: Walkway; delay?: number }) {
  const ref = useRef<THREE.Group>(null);
  const jointRef = useRef<THREE.Group>(null);
  const t = useRef(0);
  const elapsed = useRef(0);

  useFrame((_, dt) => {
    const m = ref.current;
    if (m) {
      elapsed.current += dt;
      if (elapsed.current < delay) {
        m.scale.set(0.0001, 1, 0.0001);
      } else if (t.current < 1) {
        t.current = Math.min(1, t.current + dt / 0.4);
        const e = 1 - Math.pow(1 - t.current, 3);
        const s = Math.max(0.0001, e);
        m.scale.set(s, 1, s);
      }
    }
    // Hide flagstone joint lines (0.08ft thick) at long camera distance —
    // sub-pixel and shimmery otherwise.
    if (jointRef.current) jointRef.current.visible = !LOD.midFar;
  });

  const { x1, z1, x2, z2, width, material } = walkway;
  const dx = x2 - x1;
  const dz = z2 - z1;
  const length = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx);
  const cx = (x1 + x2) / 2;
  const cz = (z1 + z2) / 2;
  const colors = WALKWAY_COLORS[material];
  // Sit clearly above lot surface (lot top = 0.12, lot border = 0.18). Center
  // at 0.16 with thickness 0.04 → bottom 0.14 (no overlap with lot mesh),
  // top 0.18 (right under the survey-tape border so it reads as ground-flush).
  // polygonOffset pushes the surface forward in the depth buffer to fully kill
  // z-fighting with the lot box even when shadows or fog blur the seam.
  const y = 0.16;
  const thickness = 0.04;

  return (
    <group ref={ref} position={[cx, y, cz]} rotation={[0, -angle, 0]}>
      <mesh receiveShadow>
        <boxGeometry args={[length, thickness, width]} />
        <meshStandardMaterial
          color={colors.fill}
          roughness={0.9}
          metalness={0}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
        <Edges color={colors.edge} lineWidth={0.6} />
      </mesh>
      {/* Flagstone joint pattern: thin perpendicular lines suggest pavers.
          Hidden at long camera distance (sub-pixel → shimmer). */}
      {material === "flagstone" && (
        <group ref={jointRef}>
          {Array.from({ length: Math.max(1, Math.floor(length / 4)) }).map((_, i) => {
            const segL = length / Math.max(1, Math.floor(length / 4));
            const lx = -length / 2 + (i + 0.5) * segL;
            return (
              <mesh key={i} position={[lx, thickness / 2 + 0.008, 0]}>
                <boxGeometry args={[0.08, 0.02, width * 0.95]} />
                <meshStandardMaterial
                  color={colors.edge}
                  roughness={0.8}
                  polygonOffset
                  polygonOffsetFactor={-3}
                  polygonOffsetUnits={-3}
                />
              </mesh>
            );
          })}
        </group>
      )}
    </group>
  );
}

// ----- Fence ----------------------------------------------------------------

const FENCE_COLORS = {
  wood: { post: "#9a7a52", panel: "#c9a878", edge: "#5a3f24" },
  "wrought-iron": { post: "#1a1a20", panel: "#2a2a30", edge: "#080810" },
  hedge: { post: "#2f4a2c", panel: "#3d6b3a", edge: "#1f3220" },
};

// Tiled GLB fence runner along a single side. Tiles are laid along local +X
// from local x=0 to x=length. Each tile is uniform-scaled to the target
// height, then x-stretched ±a few % so the run lands flush at both ends.
function TiledFenceRun({
  url,
  length,
  height,
}: {
  url: string;
  length: number;
  height: number;
}) {
  const { scene } = useGLTF(url);

  const measure = useMemo(() => {
    const probe = scene.clone(true);
    const box = new THREE.Box3().setFromObject(probe);
    const size = box.getSize(new THREE.Vector3());
    const heightScale = size.y > 0 ? height / size.y : 1;
    return {
      heightScale,
      minX: box.min.x * heightScale,
      maxX: box.max.x * heightScale,
      minY: box.min.y * heightScale,
      minZ: box.min.z * heightScale,
      maxZ: box.max.z * heightScale,
    };
  }, [scene, height]);

  const tileLen = Math.max(0.001, measure.maxX - measure.minX);
  const tileCount = Math.max(1, Math.round(length / tileLen));
  const exactLen = length / tileCount;
  const stretchX = exactLen / tileLen;

  const tiles = useMemo(() => {
    return Array.from({ length: tileCount }, (_, i) => {
      const c = scene.clone(true);
      c.scale.set(
        measure.heightScale * stretchX,
        measure.heightScale,
        measure.heightScale
      );
      // Align: left edge at i*exactLen, base on y=0, centered on z.
      c.position.x = i * exactLen - measure.minX * stretchX;
      c.position.y = -measure.minY;
      c.position.z = -(measure.minZ + measure.maxZ) / 2;
      c.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = true;
          m.receiveShadow = true;
        }
      });
      return c;
    });
  }, [scene, tileCount, exactLen, stretchX, measure]);

  return (
    <>
      {tiles.map((t, i) => (
        <primitive key={i} object={t} />
      ))}
    </>
  );
}

function FenceMesh({ lot, fence }: { lot: SitePlan["lot"]; fence: Fence }) {
  // Hedge has no GLB equivalent in the city pack — keep procedural.
  if (fence.style === "hedge") {
    return <ProceduralFenceMesh lot={lot} fence={fence} />;
  }

  const inset = 2;
  const sideConfigs: Record<
    "front" | "back" | "left" | "right",
    { position: [number, number, number]; rotationY: number; length: number }
  > = {
    front: {
      position: [inset, 0, inset],
      rotationY: 0,
      length: lot.width - 2 * inset,
    },
    back: {
      position: [inset, 0, lot.depth - inset],
      rotationY: 0,
      length: lot.width - 2 * inset,
    },
    left: {
      position: [inset, 0, inset],
      rotationY: -Math.PI / 2,
      length: lot.depth - 2 * inset,
    },
    right: {
      position: [lot.width - inset, 0, inset],
      rotationY: -Math.PI / 2,
      length: lot.depth - 2 * inset,
    },
  };

  return (
    <ModelBoundary fallback={<ProceduralFenceMesh lot={lot} fence={fence} />}>
      <group>
        {fence.sides.map((side) => {
          const cfg = sideConfigs[side];
          if (cfg.length <= 0) return null;
          return (
            <group
              key={side}
              position={cfg.position}
              rotation={[0, cfg.rotationY, 0]}
            >
              <TiledFenceRun
                url={FENCE_MODEL.url}
                length={cfg.length}
                height={TARGET_FENCE_HEIGHT_FT}
              />
            </group>
          );
        })}
      </group>
    </ModelBoundary>
  );
}

function ProceduralFenceMesh({ lot, fence }: { lot: SitePlan["lot"]; fence: Fence }) {
  const colors = FENCE_COLORS[fence.style];
  const isHedge = fence.style === "hedge";
  const isIron = fence.style === "wrought-iron";
  const fenceH = isHedge ? 6 : isIron ? 5 : 5.5;
  const panelThickness = isHedge ? 3.5 : isIron ? 0.6 : 0.6;
  const inset = 2; // pull off the lot edge so the survey-tape line stays visible

  // Each side gets one long panel mesh.
  const sideRect = (side: "front" | "back" | "left" | "right") => {
    if (side === "front") {
      return {
        center: [lot.width / 2, fenceH / 2, inset] as [number, number, number],
        size: [lot.width - 2 * inset, fenceH, panelThickness] as [number, number, number],
      };
    }
    if (side === "back") {
      return {
        center: [lot.width / 2, fenceH / 2, lot.depth - inset] as [number, number, number],
        size: [lot.width - 2 * inset, fenceH, panelThickness] as [number, number, number],
      };
    }
    if (side === "left") {
      return {
        center: [inset, fenceH / 2, lot.depth / 2] as [number, number, number],
        size: [panelThickness, fenceH, lot.depth - 2 * inset] as [number, number, number],
      };
    }
    return {
      center: [lot.width - inset, fenceH / 2, lot.depth / 2] as [number, number, number],
      size: [panelThickness, fenceH, lot.depth - 2 * inset] as [number, number, number],
    };
  };

  return (
    <group>
      {fence.sides.map((side) => {
        const { center, size } = sideRect(side);
        return (
          <group key={side}>
            <mesh position={center} castShadow receiveShadow>
              <boxGeometry args={size} />
              <meshStandardMaterial
                color={colors.panel}
                roughness={isHedge ? 0.95 : isIron ? 0.45 : 0.85}
                metalness={isIron ? 0.7 : 0.05}
                transparent={isIron}
                opacity={isIron ? 0.85 : 1}
              />
              <Edges color={colors.edge} lineWidth={1.0} />
            </mesh>
            {/* Post caps every ~12ft on solid fences (not on hedge) */}
            {!isHedge &&
              (() => {
                const isHorizontal = side === "front" || side === "back";
                const span = isHorizontal ? size[0] : size[2];
                const postCount = Math.max(2, Math.floor(span / 12) + 1);
                const postH = fenceH + 0.6;
                return Array.from({ length: postCount }).map((_, i) => {
                  const t = postCount === 1 ? 0.5 : i / (postCount - 1);
                  const along = -span / 2 + t * span;
                  const px = isHorizontal ? center[0] + along : center[0];
                  const pz = isHorizontal ? center[2] : center[2] + along;
                  return (
                    <mesh
                      key={`p-${i}`}
                      position={[px, postH / 2, pz]}
                      castShadow
                    >
                      <boxGeometry args={[0.7, postH, 0.7]} />
                      <meshStandardMaterial
                        color={colors.post}
                        roughness={0.85}
                        metalness={fence.style === "wrought-iron" ? 0.6 : 0}
                      />
                    </mesh>
                  );
                });
              })()}
          </group>
        );
      })}
    </group>
  );
}

function isInsideSetbacks(
  b: NonNullable<SitePlan["buildings"]>[number],
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
    <Html position={[lot.width / 2, 1, lot.depth / 2]} center>
      <div className="whitespace-nowrap rounded bg-red-600 px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-white shadow-md">
        ⚠ setbacks exceed lot — no buildable area
      </div>
    </Html>
  );
}
