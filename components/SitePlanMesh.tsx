"use client";
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Edges, Html as DreiHtml, Line, RoundedBox } from "@react-three/drei";
import type { ComponentProps } from "react";
import * as THREE from "three";

// Drei's <Html> defaults to zIndexRange=[16777271, 0] (yes, 16 million)
// for depth-sorted scene labels. That puts every floating tooltip way
// above the SideRail / SceneTools / Audit panels (z-10). Wrap it with a
// low default range so floating UI panels always render on top, while
// still letting any individual call override via its own zIndexRange.
function Html(props: ComponentProps<typeof DreiHtml>) {
  return <DreiHtml zIndexRange={[5, 0]} {...props} />;
}

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
import { useDebugStore } from "@/lib/debugStore";
import { rectsOverlap, type Rect } from "@/lib/geometry";
import {
  STORY_HEIGHT_FT,
  type BuildingMaterial,
  type Bush,
  type Fence,
  type Pool,
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
import {
  FLOOR_COLORS,
  FURNITURE_CATALOG,
  FURNITURE_COLORS,
  type FurnitureItem,
  type FurnitureKind,
  type Room,
  interiorCacheKey,
} from "@/lib/furniture";

// How far above the lot the upper portion of a building lifts when one of
// its floors is selected. Big enough to clearly expose the floor plan plane
// at the selected level, small enough that the lift reads as the same
// building (not a separate object).
const STORY_LIFT_FT = 14;

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
  const debug = useDebugOverlay();

  // While drafting (plan not yet returned) we used to render an accent-
  // colored placeholder box here. The floating hammer + "drafting…" overlay
  // already convey the loading state, so the empty scene reads cleaner.
  if (!plan || plan.lot.width <= 0 || plan.lot.depth <= 0) {
    return null;
  }

  const { lot, setbacks, buildings, parking, trees, walkways, fences, props, bushes, pools } =
    plan;
  const buildable = isBuildable(lot, setbacks);
  const validBuildings = (buildings ?? []).filter(
    (b) => b.w > 0 && b.d > 0 && b.stories > 0
  );
  const stalls = parking ?? [];

  return (
    <group position={[-lot.width / 2, 0, -lot.depth / 2]}>
      <LODSentinel />
      {/* All ground-plane elements pass through SiteworkLayer so the streetscape
          curb cuts + crosswalks land at the exact same x as the auto walks. */}
      <SiteworkLayer
        lot={lot}
        setbacks={setbacks}
        buildings={validBuildings}
        parking={stalls}
        trees={trees ?? []}
        accent={accent}
        buildable={buildable}
        manualWalkways={walkways}
      />

      {debug && (
        <DebugOverlay
          lot={lot}
          setbacks={setbacks}
          buildings={validBuildings}
          parking={stalls}
          autoPaths={computeAutoPaths(
            lot,
            validBuildings,
            stalls,
            trees ?? [],
            (walkways?.length ?? 0) > 0
          )}
        />
      )}

      {validBuildings.map((b, i) => {
        // The click handler keys on the original index in plan.buildings so
        // it round-trips with the server route, which also reads from the
        // SitePlan by index. Filter above may have dropped invalid entries.
        const buildingIndex = (buildings ?? []).indexOf(b);
        return (
          <Building
            key={`${i}-${b.x}-${b.z}-${b.w}-${b.d}-${b.stories}`}
            building={b}
            buildingIndex={buildingIndex}
            siblings={validBuildings}
            valid={isInsideSetbacks(b, lot, setbacks)}
            accent={accent}
            delay={i * 0.15}
          />
        );
      })}

      {stalls.map((p, i) => (
        <ParkingStall key={`${p.x}-${p.z}-${i}`} index={i} x={p.x} z={p.z} />
      ))}

      {(trees ?? []).map((t, i) => (
        <TreeMesh key={`tr-${i}-${t.x}-${t.z}`} tree={t} delay={i * 0.04} />
      ))}

      {(bushes ?? []).map((b, i) => (
        <BushMesh key={`bu-${i}-${b.x}-${b.z}`} bush={b} delay={0.1 + i * 0.025} />
      ))}

      {(fences ?? []).map((f, i) => (
        <FenceMesh key={`f-${i}-${f.style}-${f.sides.join("|")}`} lot={lot} fence={f} />
      ))}

      {(pools ?? []).map((p, i) => (
        <PoolMesh key={`pool-${i}-${p.x}-${p.z}-${p.shape}`} pool={p} delay={0.4 + i * 0.05} />
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

// Procedural lawn texture — generated once and reused across all lots. Mixes
// warm tan (paper / dry grass) and cool sage (live grass) via perlin-ish
// noise so the lot reads as ground rather than a flat colored panel. Cheap
// (256×256 canvas, generated at module load), no GLTF asset needed.
const LAWN_TEXTURE: THREE.CanvasTexture = (() => {
  const size = 256;
  const canvas =
    typeof document !== "undefined"
      ? document.createElement("canvas")
      : ({} as HTMLCanvasElement);
  if (!("getContext" in canvas)) {
    // SSR or pre-DOM. Return a placeholder that gets replaced once mounted.
    const tex = new THREE.CanvasTexture(new ImageData(2, 2).data as unknown as HTMLCanvasElement);
    return tex;
  }
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  // Warm tan base.
  ctx.fillStyle = "#dcd2bc";
  ctx.fillRect(0, 0, size, size);
  // Layered noise blobs in two greens + a deeper tan for shading.
  const tints = ["#a8b08a", "#8e9a72", "#c2b89c", "#b6c096"];
  for (let layer = 0; layer < 4; layer++) {
    ctx.fillStyle = tints[layer % tints.length];
    ctx.globalAlpha = 0.18 + layer * 0.06;
    for (let i = 0; i < 240; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = 4 + Math.random() * 18;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Fine grass-grain speckle.
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = "#5e6c46";
  for (let i = 0; i < 1500; i++) {
    ctx.fillRect(Math.random() * size, Math.random() * size, 1, 1);
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
})();

// Auto-streetscape — sidewalk + curb + asphalt street + lane stripe + a
// centered crosswalk along the lot's FRONT edge (z = 0 in lot-local space).
// Always rendered when there's a lot. Deterministic — no AI control.
// Single orchestrator for everything that touches the ground plane: streetscape,
// lawn, lot pad, setback envelope, manual walkways, auto walks, stoops.
// Computing paths once here keeps the curb cuts, crosswalks, and walks all
// aligned to identical x positions. No more drifting / mismatched layouts.
// Reads the shared debug state and registers the keyboard shortcut. The
// in-canvas button (DebugToggleButton, rendered by the planner page) flips
// the same store boolean, so button and shortcut stay in sync.
function useDebugOverlay(): boolean {
  const enabled = useDebugStore((s) => s.enabled);
  const toggle = useDebugStore((s) => s.toggle);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.shiftKey && (e.key === "D" || e.key === "d")) {
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === "INPUT" || target.tagName === "TEXTAREA")
        )
          return;
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);
  return enabled;
}

// Floats above the scene with depthTest disabled so labels never get hidden
// behind buildings. Press shift+D to toggle.
function DebugOverlay({
  lot,
  setbacks,
  buildings,
  parking,
  autoPaths,
}: {
  lot: SitePlan["lot"];
  setbacks: SitePlan["setbacks"];
  buildings: NonNullable<SitePlan["buildings"]>;
  parking: NonNullable<SitePlan["parking"]>;
  autoPaths: AutoPath[];
}) {
  const Y = 0.4; // sits just above the lot top, below buildings

  return (
    <group>
      {/* Lot outline (red) */}
      <Line
        points={[
          [0, Y, 0],
          [lot.width, Y, 0],
          [lot.width, Y, lot.depth],
          [0, Y, lot.depth],
          [0, Y, 0],
        ]}
        color="#ff3030"
        lineWidth={1.5}
        depthTest={false}
        renderOrder={999}
      />

      {/* Setback envelope (orange dashed) */}
      <Line
        points={[
          [setbacks.side, Y, setbacks.front],
          [lot.width - setbacks.side, Y, setbacks.front],
          [lot.width - setbacks.side, Y, lot.depth - setbacks.back],
          [setbacks.side, Y, lot.depth - setbacks.back],
          [setbacks.side, Y, setbacks.front],
        ]}
        color="#ff8800"
        lineWidth={1}
        dashed
        dashSize={2}
        gapSize={1.5}
        depthTest={false}
        renderOrder={999}
      />

      {/* Buildings (magenta) with footprint labels + door dot */}
      {buildings.map((b, i) => (
        <group key={`db-${i}`}>
          <Line
            points={[
              [b.x, Y, b.z],
              [b.x + b.w, Y, b.z],
              [b.x + b.w, Y, b.z + b.d],
              [b.x, Y, b.z + b.d],
              [b.x, Y, b.z],
            ]}
            color="#ff00ff"
            lineWidth={1.4}
            depthTest={false}
            renderOrder={999}
          />
          <mesh position={[b.x + b.w / 2, Y, b.z]} renderOrder={1000}>
            <sphereGeometry args={[1.4, 10, 8]} />
            <meshBasicMaterial color="#ff00ff" depthTest={false} />
          </mesh>
          <Html position={[b.x + b.w / 2, Y, b.z + b.d / 2]} center>
            <div className="pointer-events-none whitespace-nowrap rounded bg-fuchsia-700 px-1.5 py-0.5 font-mono text-[10px] uppercase text-white shadow">
              B{i + 1} · ({b.x},{b.z}) · {b.w}×{b.d}×{b.stories}
            </div>
          </Html>
        </group>
      ))}

      {/* Parking stalls (cyan) */}
      {parking.map((s, i) => (
        <Line
          key={`ds-${i}`}
          points={[
            [s.x, Y, s.z],
            [s.x + 9, Y, s.z],
            [s.x + 9, Y, s.z + 18],
            [s.x, Y, s.z + 18],
            [s.x, Y, s.z],
          ]}
          color="#00cccc"
          lineWidth={0.9}
          depthTest={false}
          renderOrder={999}
        />
      ))}
      {parking.length > 0 && (
        <Html
          position={[
            parking[0].x + 4.5,
            Y,
            parking[0].z + 9,
          ]}
          center
        >
          <div className="pointer-events-none whitespace-nowrap rounded bg-cyan-700 px-1.5 py-0.5 font-mono text-[10px] uppercase text-white shadow">
            {parking.length} STALLS
          </div>
        </Html>
      )}

      {/* Auto path centerlines (yellow walks) with labels */}
      {autoPaths.map((p, i) => (
        <group key={`dp-${i}`}>
          <Line
            points={[
              [p.x1, Y, p.z1],
              [p.x2, Y, p.z2],
            ]}
            color="#ffff00"
            lineWidth={2}
            depthTest={false}
            renderOrder={999}
          />
          <Html
            position={[p.x1, Y, (p.z1 + p.z2) / 2]}
            center
          >
            <div className="pointer-events-none whitespace-nowrap rounded bg-yellow-500 px-1.5 py-0.5 font-mono text-[10px] uppercase text-ink shadow">
              {p.kind} · x={p.x1.toFixed(1)} · w={p.width}
            </div>
          </Html>
        </group>
      ))}

      {/* Origin marker (red dot at lot front-left corner) */}
      <mesh position={[0, Y, 0]} renderOrder={1000}>
        <sphereGeometry args={[1.6, 10, 8]} />
        <meshBasicMaterial color="#ff0000" depthTest={false} />
      </mesh>
      <Html position={[0, Y, -2]} center>
        <div className="pointer-events-none whitespace-nowrap rounded bg-red-600 px-1.5 py-0.5 font-mono text-[10px] uppercase text-white shadow">
          ORIGIN (0,0)
        </div>
      </Html>

      {/* Status badge — top-left of scene, mostly hovers in view */}
      <Html
        position={[0, 4, -12]}
        zIndexRange={[1000, 0]}
      >
        <div className="pointer-events-none whitespace-nowrap rounded bg-black/85 px-2 py-1 font-mono text-[10px] uppercase text-white shadow">
          DEBUG · shift+D to hide
        </div>
      </Html>
    </group>
  );
}

function SiteworkLayer({
  lot,
  setbacks,
  buildings,
  parking,
  trees,
  accent,
  buildable,
  manualWalkways,
}: {
  lot: SitePlan["lot"];
  setbacks: SitePlan["setbacks"];
  buildings: NonNullable<SitePlan["buildings"]>;
  parking: NonNullable<SitePlan["parking"]>;
  trees: NonNullable<SitePlan["trees"]>;
  accent: string;
  buildable: boolean;
  manualWalkways?: SitePlan["walkways"];
}) {
  const hasManualWalks = (manualWalkways?.length ?? 0) > 0;
  const autoPaths = useMemo(
    () => computeAutoPaths(lot, buildings, parking, trees, hasManualWalks),
    [lot, buildings, parking, trees, hasManualWalks]
  );

  return (
    <>
      <Streetscape lot={lot} paths={autoPaths} />
      <Lot lot={lot} accent={accent} />
      <Lawn lot={lot} setbacks={setbacks} />
      {buildable ? (
        <SetbackEnvelope lot={lot} setbacks={setbacks} color={accent} />
      ) : (
        <SetbackWarning lot={lot} />
      )}
      {(manualWalkways ?? []).map((w, i) => (
        <WalkwayMesh
          key={`wk-${i}-${w.x1}-${w.z1}-${w.x2}-${w.z2}`}
          walkway={w}
          delay={i * 0.05}
        />
      ))}
      <AutoSitework paths={autoPaths} />
      <Stoops paths={autoPaths} buildings={buildings} />
    </>
  );
}

const STREETSCAPE = {
  sidewalkDepth: 8, // ft, between curb and lot front edge
  streetDepth: 30, // ft, asphalt strip beyond the sidewalk
  overhang: 30, // ft, how far sidewalk + street extend past lot's L/R edges
  curbThickness: 0.4,
  curbHeight: 0.18,
  yLot: 0.04, // sit just below lot top (Y.lotTop = 0.12)
  yStripe: 0.07,
  colors: {
    sidewalk: "#c8c2b0",
    sidewalkEdge: "#8a8470",
    curb: "#6e6a60",
    street: "#3a3a3e",
    streetEdge: "#1a1a1e",
    laneLine: "#e8c84a",
    crosswalk: "#e8e0c8",
  },
};

function Streetscape({
  lot,
  paths,
}: {
  lot: SitePlan["lot"];
  paths: AutoPath[];
}) {
  const c = STREETSCAPE;
  const totalW = lot.width + 2 * c.overhang;
  const sidewalkCenterZ = -c.sidewalkDepth / 2;
  const streetCenterZ = -c.sidewalkDepth - c.streetDepth / 2;
  const cx = lot.width / 2;
  const sidewalkY = c.yLot;

  // Lane stripe segments. Skip a segment when it would cross a path's x range
  // so the dashed line breaks cleanly at curb cuts.
  const segLen = 5;
  const gap = 5;
  const segCount = Math.floor(totalW / (segLen + gap));
  const startX = cx - (segCount * (segLen + gap) - gap) / 2;

  // Per-path geometry for curb cuts and crosswalks. Every path is a front
  // walk now, so each cut also gets a crosswalk across the street.
  const cuts = paths.map((p) => {
    const cutW = p.width + 2; // a little wider than the path itself
    return {
      x: p.x1, // path is straight in z, so x1 == x2
      width: p.width,
      cutW,
    };
  });

  // Crosswalk geometry per front walk
  const crossStripes = 5;
  const crossStripeW = 1.4;
  const crossGap = 0.9;
  const crossSpan =
    crossStripes * crossStripeW + (crossStripes - 1) * crossGap;
  const crossDepth = c.streetDepth - 6;

  // Lane-stripe segment skip test — return true if the segment center is
  // within any cut's x-range (so the line breaks at cuts).
  const insideAnyCut = (segCenterX: number) =>
    cuts.some((cut) => Math.abs(segCenterX - cut.x) < cut.cutW / 2 + 1);

  return (
    <group>
      {/* Sidewalk slab */}
      <mesh position={[cx, sidewalkY, sidewalkCenterZ]} receiveShadow>
        <boxGeometry args={[totalW, 0.08, c.sidewalkDepth]} />
        <meshStandardMaterial
          color={c.colors.sidewalk}
          roughness={0.92}
          metalness={0}
        />
        <Edges color={c.colors.sidewalkEdge} lineWidth={0.5} />
      </mesh>

      {/* Curb — broken by curb cuts at every path x */}
      {(() => {
        // Build curb segments by removing each cut's x-range from the full span
        const curbY = sidewalkY + c.curbHeight / 2;
        const curbZ = -c.sidewalkDepth + c.curbThickness / 2;
        const startXAbs = cx - totalW / 2;
        const endXAbs = cx + totalW / 2;
        // Sort cuts by x, build [start, end] segments excluding cut ranges
        const sortedCuts = [...cuts].sort((a, b) => a.x - b.x);
        const segs: Array<[number, number]> = [];
        let s = startXAbs;
        for (const cut of sortedCuts) {
          const cutStart = cut.x - cut.cutW / 2;
          const cutEnd = cut.x + cut.cutW / 2;
          if (cutStart > s) segs.push([s, cutStart]);
          s = Math.max(s, cutEnd);
        }
        if (s < endXAbs) segs.push([s, endXAbs]);
        return segs.map(([a, b], i) => {
          const w = b - a;
          if (w <= 0.01) return null;
          return (
            <mesh
              key={`curb-${i}`}
              position={[(a + b) / 2, curbY, curbZ]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[w, c.curbHeight, c.curbThickness]} />
              <meshStandardMaterial color={c.colors.curb} roughness={0.9} />
            </mesh>
          );
        });
      })()}

      {/* Asphalt street */}
      <mesh position={[cx, sidewalkY - 0.01, streetCenterZ]} receiveShadow>
        <boxGeometry args={[totalW, 0.08, c.streetDepth]} />
        <meshStandardMaterial
          color={c.colors.street}
          roughness={0.85}
          metalness={0.05}
        />
        <Edges color={c.colors.streetEdge} lineWidth={0.4} />
      </mesh>

      {/* Center lane stripe — segments hidden under any curb cut */}
      {Array.from({ length: segCount }).map((_, i) => {
        const x = startX + i * (segLen + gap) + segLen / 2;
        if (insideAnyCut(x)) return null;
        return (
          <mesh
            key={`ll-${i}`}
            position={[x, c.yStripe, streetCenterZ]}
          >
            <boxGeometry args={[segLen, 0.02, 0.4]} />
            <meshStandardMaterial
              color={c.colors.laneLine}
              roughness={0.5}
              emissive={c.colors.laneLine}
              emissiveIntensity={0.12}
            />
          </mesh>
        );
      })}

      {/* Crosswalks — one per front-walk path, aligned with the actual walk */}
      {cuts.flatMap((cut) =>
        Array.from({ length: crossStripes }).map((_, i) => {
          const offset =
            -crossSpan / 2 + i * (crossStripeW + crossGap) + crossStripeW / 2;
          return (
            <mesh
              key={`cw-${cut.x}-${i}`}
              position={[cut.x + offset, c.yStripe, streetCenterZ]}
            >
              <boxGeometry args={[crossStripeW, 0.02, crossDepth]} />
              <meshStandardMaterial
                color={c.colors.crosswalk}
                roughness={0.6}
                emissive={c.colors.crosswalk}
                emissiveIntensity={0.1}
              />
            </mesh>
          );
        })
      )}
    </group>
  );
}

// Auto-generates a 5ft concrete walk from the curb to each building's front
// door. Routes around buildings, parking stalls, and tree canopies. Skipped
// when the user manually placed any walkway. Hoisted so Streetscape's curb
// cuts can land at the same x as the actual front walks.
type AutoPath = Walkway & { kind: "front_walk"; building?: number };

const STALL_W_FT = 9;
const STALL_D_FT = 18;

// Per-species canopy-radius coefficient. Stays in sync with the renderer +
// place_trees in lib/tools.ts. Used to size the circular tree obstacles
// auto-paths must route around.
const AUTOPATH_CANOPY_R: Record<string, number> = {
  oak: 0.42,
  maple: 0.4,
  pine: 0.3,
  palm: 0.16,
};
// Small buffer between path edge and canopy edge so leaves don't graze the walk.
const TREE_PATH_BUFFER_FT = 1;

// Distance from a circle to an axis-aligned rectangle. Returns true when
// the circle overlaps the rectangle (or sits inside it).
function circleOverlapsRect(
  cx: number,
  cz: number,
  cr: number,
  r: Rect,
): boolean {
  const dx = Math.max(r.x - cx, 0, cx - (r.x + r.w));
  const dz = Math.max(r.z - cz, 0, cz - (r.z + r.d));
  return Math.hypot(dx, dz) < cr;
}

function computeAutoPaths(
  lot: SitePlan["lot"],
  buildings: NonNullable<SitePlan["buildings"]>,
  parking: NonNullable<SitePlan["parking"]>,
  trees: NonNullable<SitePlan["trees"]>,
  hasManualWalks: boolean
): AutoPath[] {
  // Manual walks suppress the auto front-walks — the user/agent has chosen
  // their own pedestrian routing.
  const out: AutoPath[] = [];
  const buildingRects: Rect[] = buildings.map((b) => ({
    x: b.x,
    z: b.z,
    w: b.w,
    d: b.d,
  }));
  const stallRects: Rect[] = parking.map((p) => ({
    x: p.x,
    z: p.z,
    w: STALL_W_FT,
    d: STALL_D_FT,
  }));
  // Trees as circular obstacles so walks don't plow through canopies.
  const treeCircles = trees.map((t) => ({
    x: t.x,
    z: t.z,
    r:
      (AUTOPATH_CANOPY_R[t.species] ?? 0.4) * t.height +
      TREE_PATH_BUFFER_FT,
  }));
  const overlapsAnyTree = (r: Rect): boolean =>
    treeCircles.some((c) => circleOverlapsRect(c.x, c.z, c.r, r));

  // Walks must avoid both buildings and parking stalls — cars block walks.
  const walkObstacles: Rect[] = [...buildingRects, ...stallRects];

  // ── Front walks: curb (z = -8) → each building's door
  // Skipped entirely if the agent placed manual walkways — they take over
  // pedestrian routing.
  if (!hasManualWalks) for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    const doorX = b.x + b.w / 2;
    if (b.z <= 0) continue;
    const walkW = 5;
    const obstacles = walkObstacles;
    // Prefer the centered path; if blocked, slide left or right by up to 12ft
    // in 3ft increments so we still serve a building whose door is partially
    // occluded by parking.
    // Range extended to ±18ft (was ±12ft) — a mature oak has ~10ft canopy
    // radius, so a centered walk needs to slide ~12-15ft to clear it.
    const candidatesX = [
      doorX,
      doorX - 3, doorX + 3,
      doorX - 6, doorX + 6,
      doorX - 9, doorX + 9,
      doorX - 12, doorX + 12,
      doorX - 15, doorX + 15,
      doorX - 18, doorX + 18,
    ];
    // Two-pass selection: prefer the first candidate that's clear of
    // buildings+stalls AND dodges every tree canopy. If no such X exists,
    // fall back to the first building/stall-clear candidate even if it
    // grazes a tree — a walk grazing leaves still beats no walk at all.
    let chosenX: number | null = null;
    let fallbackX: number | null = null;
    for (const tx of candidatesX) {
      if (tx < walkW / 2 || tx > lot.width - walkW / 2) continue;
      const r: Rect = { x: tx - walkW / 2, z: 0, w: walkW, d: b.z };
      // Must avoid OTHER buildings + all stalls; the building's own front
      // face is the destination (we stop at z = b.z).
      const otherObstacles = obstacles.filter((_, idx) => {
        // The first `buildingRects.length` entries are buildings — exclude self
        if (idx < buildingRects.length) return idx !== i;
        return true;
      });
      if (otherObstacles.some((o) => rectsOverlap(r, o))) continue;
      if (fallbackX === null) fallbackX = tx;
      // Prefer a tree-free corridor when one is available.
      if (overlapsAnyTree(r)) continue;
      chosenX = tx;
      break;
    }
    if (chosenX === null) chosenX = fallbackX;
    if (chosenX === null) continue;
    out.push({
      kind: "front_walk",
      building: i,
      x1: chosenX,
      z1: -8,
      x2: chosenX,
      z2: b.z,
      width: walkW,
      material: "concrete",
    });
  }

  // Driveways/curb-cuts into parking are intentionally omitted. Only the
  // main road (Streetscape) and front walkways are emitted as auto-paths.
  return out;
}

// Lawn overlay for setback strips — flat planes at y just above the lot top
// so they cleanly cover the setback areas without z-fighting. Walks render
// at higher Y above this; buildings sit on top.
function Lawn({
  lot,
  setbacks,
}: {
  lot: SitePlan["lot"];
  setbacks: SitePlan["setbacks"];
}) {
  const lawnY = 0.131; // 0.011 above lot top (Y.lotTop = 0.12)
  const color = "#9ab089";
  const edge = "#5e6e54";

  const strips: Array<{ x: number; z: number; w: number; d: number }> = [];
  // Front strip — full width, front-edge to front-setback line
  if (setbacks.front > 0) {
    strips.push({
      x: lot.width / 2,
      z: setbacks.front / 2,
      w: lot.width,
      d: setbacks.front,
    });
  }
  // Back strip
  if (setbacks.back > 0) {
    strips.push({
      x: lot.width / 2,
      z: lot.depth - setbacks.back / 2,
      w: lot.width,
      d: setbacks.back,
    });
  }
  // Side strips — only between front and back setbacks (avoid double-painting corners)
  const sideD = lot.depth - setbacks.front - setbacks.back;
  if (setbacks.side > 0 && sideD > 0) {
    strips.push({
      x: setbacks.side / 2,
      z: setbacks.front + sideD / 2,
      w: setbacks.side,
      d: sideD,
    });
    strips.push({
      x: lot.width - setbacks.side / 2,
      z: setbacks.front + sideD / 2,
      w: setbacks.side,
      d: sideD,
    });
  }

  return (
    <group>
      {strips.map((s, i) => (
        <mesh
          key={i}
          position={[s.x, lawnY, s.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <planeGeometry args={[s.w, s.d]} />
          <meshStandardMaterial
            color={color}
            roughness={0.95}
            metalness={0}
            side={THREE.DoubleSide}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
          />
        </mesh>
      ))}
      {/* Subtle edge line — drafting hairline between yard and lot interior */}
      <Line
        points={[
          [setbacks.side, lawnY + 0.001, setbacks.front],
          [lot.width - setbacks.side, lawnY + 0.001, setbacks.front],
          [lot.width - setbacks.side, lawnY + 0.001, lot.depth - setbacks.back],
          [setbacks.side, lawnY + 0.001, lot.depth - setbacks.back],
          [setbacks.side, lawnY + 0.001, setbacks.front],
        ]}
        color={edge}
        lineWidth={0.5}
        transparent
        opacity={0.4}
      />
    </group>
  );
}

// Small concrete stoop where each front walk meets a building. Anchors the
// walk into the building face so it doesn't look like a strip just butting
// against a wall.
function Stoops({
  paths,
  buildings,
}: {
  paths: AutoPath[];
  buildings: NonNullable<SitePlan["buildings"]>;
}) {
  const stoops = paths
    .filter((p) => p.kind === "front_walk" && p.building !== undefined)
    .map((p) => {
      const b = buildings[p.building!];
      if (!b) return null;
      return {
        key: `stoop-${p.building}`,
        x: b.x + b.w / 2,
        z: b.z + 0.5, // half a foot inside the building face
        w: 7,
        d: 1.6,
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  return (
    <group>
      {stoops.map((s) => (
        <mesh
          key={s.key}
          position={[s.x, 0.18, s.z]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[s.w, 0.36, s.d]} />
          <meshStandardMaterial color="#bdb6a4" roughness={0.92} />
          <Edges color="#5e564b" lineWidth={0.4} />
        </mesh>
      ))}
    </group>
  );
}

function AutoSitework({
  paths,
}: {
  paths: AutoPath[];
}) {
  if (paths.length === 0) return null;
  return (
    <>
      {paths.map((w, i) => (
        <WalkwayMesh
          key={`auto-${i}-${w.x1}-${w.z1}-${w.x2}-${w.z2}`}
          walkway={w}
          delay={0.4 + i * 0.05}
        />
      ))}
    </>
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

  // Tile the procedural lawn at ~one repeat per 80ft so a typical lot shows
  // 2–6 visible patches and big lots tile naturally instead of stretching.
  const lawn = useMemo(() => {
    const t = LAWN_TEXTURE.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(Math.max(1, w / 80), Math.max(1, d / 80));
    t.needsUpdate = true;
    return t;
  }, [w, d]);

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
          map={lawn}
          color={COLORS.lotFill}
          roughness={0.94}
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

// Drop curve: quadratic-accelerating fall (gravity feel) followed by two
// dampened squash-bounces. Bounces are intentionally subtle — a full ease-out-
// bounce sends a 30ft building 22ft back up, which reads as "floating".
function easeOutDrop(t: number): number {
  if (t < 0.6) {
    const u = t / 0.6;
    return u * u;
  }
  if (t < 0.85) {
    const u = (t - 0.6) / 0.25;
    return 1 - Math.sin(u * Math.PI) * 0.12;
  }
  const u = (t - 0.85) / 0.15;
  return 1 - Math.sin(u * Math.PI) * 0.04;
}

// Drop-and-bounce reveal. Buildings fall from above the lot and bounce to
// rest. The caller passes the explicit rest Y so we never read it back from
// the live position (which would capture the dropped value on Strict Mode's
// double-effect or any prop-driven re-render, leaving the building floating).
// Anchored at the base means no z-fighting with the lot during landing.
const DROP_HEIGHT_FT = 90;
function useGrowUp<T extends THREE.Object3D>(
  durationS = 1.0,
  delay = 0,
  restY = Y.lotTop
) {
  const ref = useRef<T>(null);
  const t = useRef(0);
  const elapsed = useRef(0);

  // Lift the group up before first paint so we don't flash one frame at
  // ground level. Hidden until delay elapses so staggered siblings don't
  // hover visibly.
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    m.position.y = restY + DROP_HEIGHT_FT;
    if (delay > 0) m.visible = false;
  }, [delay, restY]);

  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;

    elapsed.current += dt;
    if (elapsed.current < delay) {
      m.visible = false;
      m.position.y = restY + DROP_HEIGHT_FT;
      return;
    }
    if (!m.visible) m.visible = true;
    if (t.current >= 1) {
      m.position.y = restY;
      return;
    }
    t.current = Math.min(1, t.current + dt / durationS);
    const e = easeOutDrop(t.current);
    m.position.y = restY + (1 - e) * DROP_HEIGHT_FT;
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
            occupancySeed={windowSeed(storyIndex, x, "n")}
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
            occupancySeed={windowSeed(storyIndex, x, "s")}
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
            occupancySeed={windowSeed(storyIndex, z, "e")}
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
            occupancySeed={windowSeed(storyIndex, z, "w")}
          />
        )
      )}
    </group>
  );
}

// Stable [0,1) hash so the same window keeps the same brightness across
// re-renders (occupancy doesn't flicker as the camera moves).
function windowSeed(storyIndex: number, along: number, face: string): number {
  const faceCode = face.charCodeAt(0);
  const k = storyIndex * 17.31 + along * 4.137 + faceCode * 91.7;
  return ((Math.sin(k * 12.9898) * 43758.5453) % 1 + 1) % 1;
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
  occupancySeed = 0.5,
}: {
  position: [number, number, number];
  rotationY: number;
  winW: number;
  winH: number;
  isGlass: boolean;
  preset: MaterialPreset;
  accent: string;
  occupancySeed?: number;
}) {
  const trimColor = preset.floorLine; // matches the cornice trim
  const recessColor = "#0a0a10";
  const glassEmissive = preset.windowEmissive ?? accent;
  // Per-window emissive multiplier — gives the building a "lived in" look
  // (some units bright, some dim, a few essentially dark) instead of the
  // uniform glow that screams "rendered building." Glass curtain walls stay
  // more uniform because real glass towers light evenly at night.
  const emissiveMul = isGlass
    ? 0.7 + occupancySeed * 0.6 // 0.7 - 1.3 (gentle variation)
    : occupancySeed < 0.18
    ? 0.05 // dark unit (~18% of windows)
    : occupancySeed < 0.45
    ? 0.35 + (occupancySeed - 0.18) * 1.0 // dim
    : 0.7 + (occupancySeed - 0.45) * 1.4; // lit, with brighter outliers

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
      {/* Glass — emissive panel sitting cleanly in front of the recess.
          emissiveIntensity scaled by the per-window occupancy seed so the
          building reads as occupied rather than uniformly lit. */}
      <mesh position={[0, 0, 0.01]}>
        <planeGeometry args={[winW, winH]} />
        <meshStandardMaterial
          color="#0a0a10"
          emissive={glassEmissive}
          emissiveIntensity={preset.windowIntensity * emissiveMul}
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
  buildingIndex: number;
  siblings: NonNullable<SitePlan["buildings"]>;
  valid: boolean;
  accent: string;
  delay?: number;
};

// Dispatcher — routes to specialized renderers when structure_type calls for
// a non-standard shape (open parking decks, transparent greenhouse, open
// pavilion). Anything else falls through to the standard massing renderer.
// Also overlays per-story click planes that drive the in-model floor reveal.
function Building(props: BuildingProps) {
  const t: StructureType | undefined = props.building.structure_type;
  let rendered: React.ReactNode;
  if (props.valid) {
    if (t === "parking_garage") rendered = <ParkingGarageBuilding {...props} />;
    else if (t === "greenhouse") rendered = <GreenhouseBuilding {...props} />;
    else if (t === "pavilion") rendered = <PavilionBuilding {...props} />;
    else if (t === "garage") rendered = <GarageBuilding {...props} />;
    else if (t === "warehouse") rendered = <WarehouseBuilding {...props} />;
    else if (t === "house") rendered = <HouseBuilding {...props} />;
    else if (t === "apartment") rendered = <ApartmentBuilding {...props} />;
    else rendered = <DefaultBuilding {...props} />;
  } else {
    rendered = <DefaultBuilding {...props} />;
  }
  return (
    <>
      {rendered}
      {props.valid && (
        <FloorClickPlanes
          building={props.building}
          buildingIndex={props.buildingIndex}
          accent={props.accent}
        />
      )}
    </>
  );
}

// Invisible per-story boxes that capture pointer events. A clicked story
// dispatches the selection into Zustand; DefaultBuilding reacts by lifting
// its upper portion and fading in the nano-banana floor plan on the cut
// surface. Click the same floor again (or empty canvas / Escape) to close.
// Hover paints a subtle ring so the user can see which floor they're aiming at.
function FloorClickPlanes({
  building,
  buildingIndex,
  accent,
}: {
  building: NonNullable<SitePlan["buildings"]>[number];
  buildingIndex: number;
  accent: string;
}) {
  const cx = building.x + building.w / 2;
  const cz = building.z + building.d / 2;
  const selectFloor = useStore((s) => s.selectFloor);
  const selectedFloor = useStore((s) => s.selectedFloor);
  const [hoveredStory, setHoveredStory] = useState<number | null>(null);

  return (
    <group position={[cx, Y.lotTop, cz]}>
      {Array.from({ length: building.stories }).map((_, i) => {
        const isSelected =
          selectedFloor?.buildingIndex === buildingIndex &&
          selectedFloor?.storyIndex === i;
        const isHovered = hoveredStory === i;
        return (
          <group
            key={`fp-${i}`}
            position={[0, i * STORY_HEIGHT_FT + STORY_HEIGHT_FT / 2, 0]}
          >
            <mesh
              onClick={(e) => {
                e.stopPropagation();
                if (isSelected) selectFloor(null);
                else selectFloor({ buildingIndex, storyIndex: i });
              }}
              onPointerOver={(e) => {
                e.stopPropagation();
                setHoveredStory(i);
                document.body.style.cursor = "pointer";
              }}
              onPointerOut={() => {
                setHoveredStory((s) => (s === i ? null : s));
                document.body.style.cursor = "";
              }}
            >
              <boxGeometry
                args={[building.w + 0.4, STORY_HEIGHT_FT, building.d + 0.4]}
              />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            {(isHovered || isSelected) && (
              <mesh>
                <boxGeometry
                  args={[
                    building.w + 0.6,
                    STORY_HEIGHT_FT * 0.95,
                    building.d + 0.6,
                  ]}
                />
                <meshBasicMaterial
                  color={isSelected ? accent : "#ffffff"}
                  transparent
                  opacity={isSelected ? 0.18 : 0.08}
                  depthWrite={false}
                />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
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
  const ref = useGrowUp<THREE.Group>(1.0, delay);

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
  const ref = useGrowUp<THREE.Group>(1.0, delay);

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
  const ref = useGrowUp<THREE.Group>(1.0, delay);

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

// ── WarehouseBuilding ─────────────────────────────────────────────────────
// Tall industrial shed: tilt-up concrete panels with vertical reveal joints,
// roll-up loading dock doors on the back face, a clerestory window strip on
// the side faces, and a flat metal roof. Skips the floor-reveal mechanic by
// design — warehouses are typically a single open volume.
function WarehouseBuilding({
  building,
  valid,
  delay = 0.1,
}: BuildingProps) {
  const w = building.w;
  const d = building.d;
  const stories = Math.max(1, building.stories);
  const height = stories * STORY_HEIGHT_FT;
  const cx = building.x + w / 2;
  const cz = building.z + d / 2;
  const ref = useGrowUp<THREE.Group>(1.0, delay);

  // Tilt-up concrete by default; if the user picked steel/glass we tint.
  const preset = presetFor(building.material);
  const bodyColor = valid ? preset.body : COLORS.buildingInvalid;
  const edgeColor = valid ? preset.edge : COLORS.buildingInvalid;
  const dockColor = "#2a2a2e";
  const dockSlat = "#4a4a4e";
  const roofColor = "#1f242b";

  // Vertical tilt-up panel reveals: every ~15ft.
  const panelXs = useMemo(() => {
    const n = Math.max(2, Math.round(w / 15));
    return Array.from({ length: n - 1 }, (_, i) => -w / 2 + ((i + 1) * w) / n);
  }, [w]);
  const panelZs = useMemo(() => {
    const n = Math.max(2, Math.round(d / 15));
    return Array.from({ length: n - 1 }, (_, i) => -d / 2 + ((i + 1) * d) / n);
  }, [d]);

  // Roll-up loading docks on the back (+z) face.
  const dockW = 10;
  const dockH = Math.min(11, height - 2);
  const dockGap = 4;
  const dockCount = Math.max(
    2,
    Math.min(4, Math.floor((w - 12) / (dockW + dockGap)))
  );
  const dockTotalW = dockCount * dockW + (dockCount - 1) * dockGap;
  const dockStartX = -dockTotalW / 2;
  const slatLines = 6; // suggestive, not literal — keeps geometry light

  // Clerestory window band high on the side (±x) faces.
  const clerestoryY = Math.max(height - 4, height * 0.7);
  const clerestoryH = 2.5;

  // Personnel door on the front (-z) face.
  const personnelDoorW = 3.5;
  const personnelDoorH = 7;

  return (
    <group ref={ref} position={[cx, Y.lotTop, cz]}>
      {/* Main mass */}
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, height, d]} />
        <meshStandardMaterial color={bodyColor} roughness={0.92} metalness={0.04} />
        <Edges color={edgeColor} lineWidth={0.6} />
      </mesh>

      {/* Vertical tilt-up panel reveal joints — one set per face */}
      {panelXs.map((x, i) => (
        <Fragment key={`pj-w-${i}`}>
          <mesh position={[x, height / 2, -d / 2 - 0.02]}>
            <planeGeometry args={[0.18, height]} />
            <meshBasicMaterial color={edgeColor} />
          </mesh>
          <mesh position={[x, height / 2, d / 2 + 0.02]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[0.18, height]} />
            <meshBasicMaterial color={edgeColor} />
          </mesh>
        </Fragment>
      ))}
      {panelZs.map((z, i) => (
        <Fragment key={`pj-d-${i}`}>
          <mesh position={[-w / 2 - 0.02, height / 2, z]} rotation={[0, -Math.PI / 2, 0]}>
            <planeGeometry args={[0.18, height]} />
            <meshBasicMaterial color={edgeColor} />
          </mesh>
          <mesh position={[w / 2 + 0.02, height / 2, z]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[0.18, height]} />
            <meshBasicMaterial color={edgeColor} />
          </mesh>
        </Fragment>
      ))}

      {/* Loading dock doors on back face */}
      {Array.from({ length: dockCount }).map((_, i) => {
        const x = dockStartX + i * (dockW + dockGap) + dockW / 2;
        return (
          <Fragment key={`dock-${i}`}>
            {/* Recessed door panel */}
            <mesh position={[x, dockH / 2 + 0.6, d / 2 + 0.02]}>
              <boxGeometry args={[dockW, dockH, 0.2]} />
              <meshStandardMaterial color={dockColor} roughness={0.7} />
              <Edges color="#0c0c0e" lineWidth={0.5} />
            </mesh>
            {/* Suggestive horizontal slat lines */}
            {Array.from({ length: slatLines }).map((_, j) => (
              <mesh
                key={`slat-${j}`}
                position={[
                  x,
                  0.6 + ((j + 1) * dockH) / (slatLines + 1),
                  d / 2 + 0.13,
                ]}
              >
                <planeGeometry args={[dockW - 0.4, 0.08]} />
                <meshBasicMaterial color={dockSlat} />
              </mesh>
            ))}
            {/* Concrete dock platform / bumper sitting outside the wall */}
            <mesh
              position={[x, 0.55, d / 2 + 1.6]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[dockW + 1.5, 1.1, 3]} />
              <meshStandardMaterial color={"#7a7a72"} roughness={0.95} />
              <Edges color={"#3e3e3a"} lineWidth={0.4} />
            </mesh>
          </Fragment>
        );
      })}

      {/* Clerestory window band on side faces */}
      {[1, -1].map((sign) => (
        <mesh
          key={`cl-${sign > 0 ? "r" : "l"}`}
          position={[(sign * w) / 2 + sign * 0.04, clerestoryY, 0]}
          rotation={[0, sign > 0 ? Math.PI / 2 : -Math.PI / 2, 0]}
        >
          <planeGeometry args={[Math.max(4, d - 8), clerestoryH]} />
          <meshStandardMaterial
            color={"#7a9bb0"}
            emissive={"#5a8baf"}
            emissiveIntensity={0.35}
            roughness={0.2}
            metalness={0.6}
          />
        </mesh>
      ))}

      {/* Personnel front door */}
      <mesh position={[0, personnelDoorH / 2 + 0.05, -d / 2 - 0.04]}>
        <planeGeometry args={[personnelDoorW, personnelDoorH]} />
        <meshStandardMaterial color={"#1f1f22"} roughness={0.7} />
      </mesh>
      {/* Door frame edge */}
      <mesh position={[0, personnelDoorH / 2 + 0.05, -d / 2 - 0.05]}>
        <planeGeometry args={[personnelDoorW + 0.4, personnelDoorH + 0.2]} />
        <meshBasicMaterial color={edgeColor} />
      </mesh>

      {/* Flat parapet roof */}
      <mesh position={[0, height + 0.6, 0]} castShadow receiveShadow>
        <boxGeometry args={[w + 0.3, 1.2, d + 0.3]} />
        <meshStandardMaterial color={roofColor} roughness={0.85} metalness={0.15} />
        <Edges color={edgeColor} lineWidth={0.5} />
      </mesh>

      {/* Rooftop HVAC */}
      <RooftopHVAC w={w} d={d} baseY={height + 1.2} />

      <Html position={[0, height + 6, 0]} center>
        <div className="whitespace-nowrap rounded bg-paper px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-ink shadow-md">
          {Math.round(w)}×{Math.round(d)} ft · warehouse
        </div>
      </Html>
    </group>
  );
}

// ── GarageBuilding ────────────────────────────────────────────────────────
// Small RESIDENTIAL garage (1-2 cars). Single-story flat-roofed box with one
// big roll-up overhead door on the front face and a single small side window.
// Distinct from `parking_garage` (multi-level public deck).
function GarageBuilding({ building, valid, delay = 0.1 }: BuildingProps) {
  const w = building.w;
  const d = building.d;
  // Garages are always 1 story regardless of what the agent passed; they
  // shouldn't punch through to a 30ft tower.
  const height = STORY_HEIGHT_FT;
  const cx = building.x + w / 2;
  const cz = building.z + d / 2;
  const ref = useGrowUp<THREE.Group>(1.0, delay);

  const preset = presetFor(building.material);
  const bodyColor = valid ? preset.body : COLORS.buildingInvalid;
  const edgeColor = valid ? preset.edge : COLORS.buildingInvalid;
  const doorColor = "#2d2d31";
  const slatColor = "#4a4a4e";
  const trimColor = "#1f1f22";
  const roofColor = preset.roof;

  // Overhead door is sized to the building's car-count: a 22ft-wide garage =
  // double car (16ft door); narrower = single (8ft door).
  const isDouble = w >= 18;
  const doorW = isDouble ? Math.min(w - 4, 16) : Math.min(w - 4, 8);
  const doorH = Math.min(8, height - 1.5);
  const slats = 8;

  return (
    <group ref={ref} position={[cx, Y.lotTop, cz]}>
      {/* Main mass */}
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, height, d]} />
        <meshStandardMaterial color={bodyColor} roughness={0.9} metalness={0.02} />
        <Edges color={edgeColor} lineWidth={0.6} />
      </mesh>

      {/* Roll-up overhead door on the front face (-z) */}
      <mesh position={[0, doorH / 2 + 0.4, -d / 2 + 0.04]}>
        <boxGeometry args={[doorW, doorH, 0.18]} />
        <meshStandardMaterial color={doorColor} roughness={0.6} />
        <Edges color={trimColor} lineWidth={0.5} />
      </mesh>
      {/* Suggestive horizontal slat lines on the door */}
      {Array.from({ length: slats }).map((_, j) => (
        <mesh
          key={`slat-${j}`}
          position={[0, 0.4 + ((j + 1) * doorH) / (slats + 1), -d / 2 - 0.06]}
        >
          <planeGeometry args={[doorW - 0.4, 0.06]} />
          <meshBasicMaterial color={slatColor} />
        </mesh>
      ))}
      {/* Door frame trim */}
      <mesh position={[0, doorH / 2 + 0.4, -d / 2 - 0.05]}>
        <planeGeometry args={[doorW + 0.6, doorH + 0.5]} />
        <meshBasicMaterial color={trimColor} />
      </mesh>

      {/* One small side window (right face) */}
      <mesh
        position={[w / 2 + 0.04, height * 0.65, 0]}
        rotation={[0, Math.PI / 2, 0]}
      >
        <planeGeometry args={[2.2, 1.4]} />
        <meshStandardMaterial
          color={"#7a9bb0"}
          emissive={"#5a8baf"}
          emissiveIntensity={0.25}
          roughness={0.25}
        />
      </mesh>

      {/* Flat roof slab */}
      <mesh position={[0, height + 0.25, 0]} castShadow receiveShadow>
        <boxGeometry args={[w + 0.4, 0.5, d + 0.4]} />
        <meshStandardMaterial color={roofColor} roughness={0.85} />
        <Edges color={edgeColor} lineWidth={0.5} />
      </mesh>

      <Html position={[0, height + 4, 0]} center>
        <div className="whitespace-nowrap rounded bg-paper px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-ink shadow-md">
          {Math.round(w)}×{Math.round(d)} ft · {isDouble ? "2-car garage" : "garage"}
        </div>
      </Html>
    </group>
  );
}

// ── HouseBuilding ─────────────────────────────────────────────────────────
// Wraps DefaultBuilding (which already does gable roofs and proper windows)
// and adds residential signature features the default massing can't express:
// front porch with posts + porch roof, and a small chimney on the roof for
// low-rise houses. Inherits the floor-reveal interaction from DefaultBuilding
// (the overlay sits at ground level so it doesn't need to lift with floors).
function HouseBuilding(props: BuildingProps) {
  return (
    <>
      <DefaultBuilding {...props} />
      {props.valid && <HouseOverlay {...props} />}
    </>
  );
}

function HouseOverlay({ building, delay = 0.1 }: BuildingProps) {
  const cx = building.x + building.w / 2;
  const cz = building.z + building.d / 2;
  const ref = useGrowUp<THREE.Group>(1.0, delay);

  // Porch sits on the front face (-z in local coords). Scale to building size
  // so a tiny ADU gets a tiny stoop, not a wraparound veranda.
  const porchD = Math.min(7, Math.max(3.5, building.d * 0.14));
  const porchW = Math.min(building.w * 0.55, 18);
  const slabH = 0.6;
  const postH = 8.4;
  const postW = 0.6;
  const porchFrontZ = -building.d / 2 - porchD;

  return (
    <group ref={ref} position={[cx, Y.lotTop, cz]}>
      {/* Porch slab */}
      <mesh
        position={[0, slabH / 2, -building.d / 2 - porchD / 2]}
        receiveShadow
      >
        <boxGeometry args={[porchW, slabH, porchD]} />
        <meshStandardMaterial color={"#bdb3a2"} roughness={0.95} />
        <Edges color={"#5a5045"} lineWidth={0.4} />
      </mesh>

      {/* Steps in front of the porch — two thin slabs */}
      {[0, 1].map((i) => (
        <mesh
          key={`step-${i}`}
          position={[0, slabH * (0.66 - i * 0.33), porchFrontZ - 0.4 - i * 0.6]}
          receiveShadow
        >
          <boxGeometry args={[porchW * 0.55, slabH * 0.5, 1.1]} />
          <meshStandardMaterial color={"#a89a86"} roughness={0.95} />
          <Edges color={"#4a423a"} lineWidth={0.3} />
        </mesh>
      ))}

      {/* Porch posts */}
      {[-porchW / 2 + 0.7, porchW / 2 - 0.7].map((px, i) => (
        <mesh
          key={`post-${i}`}
          position={[px, slabH + postH / 2, porchFrontZ + 0.5]}
          castShadow
        >
          <boxGeometry args={[postW, postH, postW]} />
          <meshStandardMaterial color={"#5a4029"} roughness={0.85} />
        </mesh>
      ))}

      {/* Porch roof slab (overhang) */}
      <mesh
        position={[
          0,
          slabH + postH + 0.3,
          -building.d / 2 - porchD / 2 + 0.4,
        ]}
        castShadow
      >
        <boxGeometry args={[porchW + 0.6, 0.55, porchD - 0.4]} />
        <meshStandardMaterial color={"#3d2418"} roughness={0.85} />
        <Edges color={"#1f140c"} lineWidth={0.4} />
      </mesh>

      {/* Chimney — only for low-rise houses where the gable roof is rendered */}
      {building.stories <= 2 && (() => {
        const chimneyW = 1.6;
        const chimneyD = 1.2;
        const chimneyBase = building.stories * STORY_HEIGHT_FT;
        const chimneyH = 5;
        // Push it off-center toward the back-side so it doesn't clash with
        // the door / front face.
        const chimneyX = building.w * 0.25;
        const chimneyZ = building.d * 0.15;
        return (
          <mesh
            position={[chimneyX, chimneyBase + chimneyH / 2 + 1.5, chimneyZ]}
            castShadow
          >
            <boxGeometry args={[chimneyW, chimneyH, chimneyD]} />
            <meshStandardMaterial color={"#6b4a35"} roughness={0.95} />
            <Edges color={"#2a1a14"} lineWidth={0.4} />
          </mesh>
        );
      })()}
    </group>
  );
}

// ── ApartmentBuilding ─────────────────────────────────────────────────────
// Wraps DefaultBuilding and adds the visual signature of a multi-unit res
// building: a lobby canopy at the front entrance and small balcony platforms
// with railings on each upper floor's front-center.
function ApartmentBuilding(props: BuildingProps) {
  return (
    <>
      <DefaultBuilding {...props} />
      {props.valid && <ApartmentOverlay {...props} />}
    </>
  );
}

function ApartmentOverlay({ building, delay = 0.1 }: BuildingProps) {
  const cx = building.x + building.w / 2;
  const cz = building.z + building.d / 2;
  const ref = useGrowUp<THREE.Group>(1.0, delay);
  const stories = building.stories;

  // Lobby canopy — modest overhang at the front-center entrance
  const canopyW = Math.min(building.w * 0.28, 14);
  const canopyD = 4.5;
  const canopyY = 9.3;
  const canopyT = 0.4;

  // Balcony platform per upper story (skip ground floor)
  const balW = Math.min(building.w * 0.18, 9);
  const balD = 3.2;

  return (
    <group ref={ref} position={[cx, Y.lotTop, cz]}>
      {/* Lobby canopy */}
      <mesh
        position={[0, canopyY, -building.d / 2 - canopyD / 2 + 0.2]}
        castShadow
      >
        <boxGeometry args={[canopyW, canopyT, canopyD]} />
        <meshStandardMaterial
          color={"#2a2a2e"}
          roughness={0.45}
          metalness={0.45}
        />
        <Edges color={"#0a0a0a"} lineWidth={0.4} />
      </mesh>
      {/* Two thin canopy support rods */}
      {[-canopyW / 2 + 0.6, canopyW / 2 - 0.6].map((rx, i) => (
        <mesh
          key={`rod-${i}`}
          position={[
            rx,
            canopyY / 2 + 0.5,
            -building.d / 2 - canopyD + 0.4,
          ]}
          castShadow
        >
          <boxGeometry args={[0.18, canopyY - 0.5, 0.18]} />
          <meshStandardMaterial color={"#1a1a1c"} roughness={0.4} metalness={0.7} />
        </mesh>
      ))}

      {/* Balconies on upper floors */}
      {Array.from({ length: Math.max(0, stories - 1) }).map((_, i) => {
        const story = i + 1;
        const y = story * STORY_HEIGHT_FT + 0.3;
        return (
          <Fragment key={`bal-${story}`}>
            {/* Platform */}
            <mesh
              position={[0, y, -building.d / 2 - balD / 2]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[balW, 0.3, balD]} />
              <meshStandardMaterial color={"#bdb6a4"} roughness={0.92} />
              <Edges color={"#5a544a"} lineWidth={0.3} />
            </mesh>
            {/* Railing — front bar */}
            <mesh
              position={[0, y + 1.6, -building.d / 2 - balD]}
              castShadow
            >
              <boxGeometry args={[balW, 3.2, 0.1]} />
              <meshStandardMaterial
                color={"#1f2228"}
                roughness={0.4}
                metalness={0.55}
              />
            </mesh>
            {/* Railing — left side bar */}
            <mesh
              position={[-balW / 2, y + 1.6, -building.d / 2 - balD / 2]}
            >
              <boxGeometry args={[0.1, 3.2, balD]} />
              <meshStandardMaterial
                color={"#1f2228"}
                roughness={0.4}
                metalness={0.55}
              />
            </mesh>
            {/* Railing — right side bar */}
            <mesh
              position={[balW / 2, y + 1.6, -building.d / 2 - balD / 2]}
            >
              <boxGeometry args={[0.1, 3.2, balD]} />
              <meshStandardMaterial
                color={"#1f2228"}
                roughness={0.4}
                metalness={0.55}
              />
            </mesh>
          </Fragment>
        );
      })}
    </group>
  );
}

// One LLM-placed piece of furniture rendered as a small set of colored boxes.
// We special-case a handful of kinds to add recognizable details (pillows on
// beds, tank on toilets, foliage on plants) without going overboard.
// Coordinates are building-local (front-left origin); the parent InteriorScene
// applies the front-left → center shift, so the item uses item.x / item.z raw.
function FurnitureItemMesh({ item }: { item: FurnitureItem }) {
  const spec = FURNITURE_CATALOG[item.kind];
  const color = FURNITURE_COLORS[item.kind];
  const yaw = (item.yaw ?? 0) * (Math.PI / 180);
  const detail = renderKindDetail(item.kind, spec, color);

  return (
    <group position={[item.x, 0, item.z]} rotation={[0, -yaw, 0]}>
      {detail ?? (
        <mesh position={[0, spec.h / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[spec.w, spec.h, spec.d]} />
          <meshStandardMaterial color={color} roughness={0.7} metalness={0.05} />
        </mesh>
      )}
    </group>
  );
}

function renderKindDetail(
  kind: FurnitureKind,
  spec: { w: number; d: number; h: number },
  color: string
): React.ReactNode | null {
  switch (kind) {
    case "sofa": {
      // Seat (lower main body) + back (taller slab along the +z edge).
      const seatH = 1.4;
      const backH = spec.h;
      const backD = 0.5;
      return (
        <>
          <mesh position={[0, seatH / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[spec.w, seatH, spec.d]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
          <mesh
            position={[0, backH / 2, spec.d / 2 - backD / 2]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[spec.w, backH, backD]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
        </>
      );
    }
    case "armchair": {
      const seatH = 1.4;
      const backH = spec.h;
      return (
        <>
          <mesh position={[0, seatH / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[spec.w, seatH, spec.d]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
          <mesh
            position={[0, backH / 2, spec.d / 2 - 0.25]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[spec.w, backH, 0.5]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
        </>
      );
    }
    case "bed": {
      // Mattress + duvet color + 2 pillows at the head (+z edge).
      const mattressH = spec.h * 0.8;
      const pillowW = spec.w * 0.42;
      const pillowD = 1.2;
      const pillowH = 0.4;
      const headZ = spec.d / 2 - pillowD / 2 - 0.2;
      return (
        <>
          <mesh position={[0, mattressH / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[spec.w, mattressH, spec.d]} />
            <meshStandardMaterial color="#cdb89a" roughness={0.8} />
          </mesh>
          <mesh
            position={[0, mattressH + 0.05, 0]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[spec.w * 0.98, 0.1, spec.d * 0.98]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
          <mesh
            position={[-spec.w * 0.22, mattressH + 0.25, headZ]}
            castShadow
          >
            <boxGeometry args={[pillowW, pillowH, pillowD]} />
            <meshStandardMaterial color="#fbf6ec" roughness={0.95} />
          </mesh>
          <mesh
            position={[+spec.w * 0.22, mattressH + 0.25, headZ]}
            castShadow
          >
            <boxGeometry args={[pillowW, pillowH, pillowD]} />
            <meshStandardMaterial color="#fbf6ec" roughness={0.95} />
          </mesh>
        </>
      );
    }
    case "toilet": {
      // Bowl (front) + tank (back, taller).
      const bowlD = spec.d * 0.55;
      const tankD = spec.d * 0.4;
      const bowlH = 1.4;
      return (
        <>
          <mesh
            position={[0, bowlH / 2, -spec.d / 2 + bowlD / 2]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[spec.w, bowlH, bowlD]} />
            <meshStandardMaterial color={color} roughness={0.4} />
          </mesh>
          <mesh
            position={[0, spec.h / 2, spec.d / 2 - tankD / 2]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[spec.w, spec.h, tankD]} />
            <meshStandardMaterial color={color} roughness={0.4} />
          </mesh>
        </>
      );
    }
    case "plant": {
      // Pot + foliage sphere.
      const potH = 1.2;
      const folRadius = spec.w * 0.7;
      return (
        <>
          <mesh position={[0, potH / 2, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[spec.w / 2, spec.w / 2 * 0.85, potH, 16]} />
            <meshStandardMaterial color="#7a4a2e" roughness={0.8} />
          </mesh>
          <mesh position={[0, potH + folRadius * 0.7, 0]} castShadow>
            <sphereGeometry args={[folRadius, 14, 10]} />
            <meshStandardMaterial color={color} roughness={0.8} />
          </mesh>
        </>
      );
    }
    case "lamp": {
      // Thin pole + glowing top sphere.
      return (
        <>
          <mesh position={[0, spec.h / 2, 0]} castShadow>
            <cylinderGeometry args={[0.08, 0.12, spec.h, 8]} />
            <meshStandardMaterial color={color} roughness={0.6} />
          </mesh>
          <mesh position={[0, spec.h - 0.4, 0]}>
            <sphereGeometry args={[0.6, 12, 8]} />
            <meshStandardMaterial
              color="#fff4dc"
              emissive="#fff4dc"
              emissiveIntensity={0.6}
              roughness={0.3}
            />
          </mesh>
        </>
      );
    }
    case "office_chair":
    case "dining_chair": {
      // Seat + slim back.
      const seatH = 1.5;
      return (
        <>
          <mesh position={[0, seatH / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[spec.w, seatH, spec.d]} />
            <meshStandardMaterial color={color} roughness={0.7} />
          </mesh>
          <mesh
            position={[0, spec.h / 2 + seatH / 2, spec.d / 2 - 0.15]}
            castShadow
          >
            <boxGeometry args={[spec.w * 0.9, spec.h - seatH, 0.3]} />
            <meshStandardMaterial color={color} roughness={0.7} />
          </mesh>
        </>
      );
    }
    case "tv_stand": {
      // Console + thin black TV slab on top.
      return (
        <>
          <mesh position={[0, spec.h / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[spec.w, spec.h, spec.d]} />
            <meshStandardMaterial color={color} roughness={0.6} />
          </mesh>
          <mesh
            position={[0, spec.h + 1.6, -spec.d / 2 + 0.15]}
            castShadow
          >
            <boxGeometry args={[spec.w * 0.9, 2.4, 0.2]} />
            <meshStandardMaterial color="#0a0a0d" roughness={0.4} />
          </mesh>
        </>
      );
    }
    default:
      return null;
  }
}

// Wall geometry. Walls run between rooms and stop short of full story height
// so the lifted upper mass can show the cutaway clearly. A 3ft door opening
// is cut from any wall segment between two rooms (auto-derived shared edge).
const WALL_HEIGHT_FT = 9;
const WALL_THICKNESS_FT = 0.4;
const DOOR_WIDTH_FT = 3;
const DOOR_HEIGHT_FT = 7;
const WALL_COLOR = "#f0e9da";
const WALL_TRIM_COLOR = "#d8ceb8";

type WallSeg = {
  // World-axis aligned. axis === "x" means the wall runs along x (its long
  // dimension is x-aligned, normal points in z). "z" is the opposite.
  axis: "x" | "z";
  // Center of the wall segment in building-local coordinates.
  cx: number;
  cz: number;
  // Wall length along its long axis.
  length: number;
  // True if a door opening should be cut at the segment's midpoint.
  hasDoor: boolean;
};

// Auto-derive interior walls from the room rectangles. For every pair of
// rooms that share an edge segment (same x or z line, with overlap on the
// perpendicular axis), produce a wall along the overlap and stamp a door
// in the middle. This keeps the LLM contract narrow (it just lays out
// rectangles) while the renderer handles the geometry.
function deriveWalls(
  rooms: Room[],
  buildingW: number,
  buildingD: number
): WallSeg[] {
  const walls: WallSeg[] = [];
  const eps = 0.5;
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i];
      const b = rooms[j];
      // Vertical shared edge (constant x, runs along z): a's east face meets b's west face (or vice versa).
      if (Math.abs(a.x + a.w - b.x) < eps || Math.abs(b.x + b.w - a.x) < eps) {
        const sharedX = Math.abs(a.x + a.w - b.x) < eps ? a.x + a.w : b.x + b.w;
        const z0 = Math.max(a.z, b.z);
        const z1 = Math.min(a.z + a.d, b.z + b.d);
        if (z1 - z0 > 1) {
          walls.push({
            axis: "z",
            cx: sharedX,
            cz: (z0 + z1) / 2,
            length: z1 - z0,
            hasDoor: z1 - z0 >= DOOR_WIDTH_FT + 1,
          });
        }
      }
      // Horizontal shared edge (constant z, runs along x).
      if (Math.abs(a.z + a.d - b.z) < eps || Math.abs(b.z + b.d - a.z) < eps) {
        const sharedZ = Math.abs(a.z + a.d - b.z) < eps ? a.z + a.d : b.z + b.d;
        const x0 = Math.max(a.x, b.x);
        const x1 = Math.min(a.x + a.w, b.x + b.w);
        if (x1 - x0 > 1) {
          walls.push({
            axis: "x",
            cx: (x0 + x1) / 2,
            cz: sharedZ,
            length: x1 - x0,
            hasDoor: x1 - x0 >= DOOR_WIDTH_FT + 1,
          });
        }
      }
    }
  }

  // Also draw walls along room edges that face open void inside the building
  // (i.e. the LLM left a gap between rooms instead of tiling). Treat any
  // room-edge segment that's NOT on the building exterior AND NOT shared
  // with another room as a wall facing the void. For the demo scope we keep
  // this simple: just check each of the 4 edges of each room for the
  // exterior-vs-shared cases. Anything else gets a wall, no door.
  for (const r of rooms) {
    // North edge (z = r.z + r.d), runs along x.
    addEdgeIfFacingVoid(r, "north", rooms, walls, buildingW, buildingD);
    addEdgeIfFacingVoid(r, "south", rooms, walls, buildingW, buildingD);
    addEdgeIfFacingVoid(r, "east", rooms, walls, buildingW, buildingD);
    addEdgeIfFacingVoid(r, "west", rooms, walls, buildingW, buildingD);
  }

  return walls;
}

function addEdgeIfFacingVoid(
  r: Room,
  side: "north" | "south" | "east" | "west",
  rooms: Room[],
  walls: WallSeg[],
  bw: number,
  bd: number
) {
  const eps = 0.5;
  if (side === "north" || side === "south") {
    const z = side === "north" ? r.z + r.d : r.z;
    // On building exterior — exterior wall already drawn by the building shell.
    if (z < eps || z > bd - eps) return;
    // Find x-overlap with neighbors on the same z-line.
    const segs: Array<[number, number]> = [[r.x, r.x + r.w]];
    for (const o of rooms) {
      if (o === r) continue;
      const oZ = side === "north" ? o.z : o.z + o.d;
      if (Math.abs(oZ - z) > eps) continue;
      const ox0 = o.x;
      const ox1 = o.x + o.w;
      // Subtract overlap from segs.
      const next: Array<[number, number]> = [];
      for (const [a, b] of segs) {
        if (ox1 <= a || ox0 >= b) {
          next.push([a, b]);
          continue;
        }
        if (ox0 > a) next.push([a, ox0]);
        if (ox1 < b) next.push([ox1, b]);
      }
      segs.length = 0;
      segs.push(...next);
    }
    for (const [a, b] of segs) {
      if (b - a < 1) continue;
      walls.push({
        axis: "x",
        cx: (a + b) / 2,
        cz: z,
        length: b - a,
        hasDoor: false,
      });
    }
  } else {
    const x = side === "east" ? r.x + r.w : r.x;
    if (x < eps || x > bw - eps) return;
    const segs: Array<[number, number]> = [[r.z, r.z + r.d]];
    for (const o of rooms) {
      if (o === r) continue;
      const oX = side === "east" ? o.x : o.x + o.w;
      if (Math.abs(oX - x) > eps) continue;
      const oz0 = o.z;
      const oz1 = o.z + o.d;
      const next: Array<[number, number]> = [];
      for (const [a, b] of segs) {
        if (oz1 <= a || oz0 >= b) {
          next.push([a, b]);
          continue;
        }
        if (oz0 > a) next.push([a, oz0]);
        if (oz1 < b) next.push([oz1, b]);
      }
      segs.length = 0;
      segs.push(...next);
    }
    for (const [a, b] of segs) {
      if (b - a < 1) continue;
      walls.push({
        axis: "z",
        cx: x,
        cz: (a + b) / 2,
        length: b - a,
        hasDoor: false,
      });
    }
  }
}

function WallSegment({ wall }: { wall: WallSeg }) {
  // For walls without doors, render one solid box.
  // For walls with doors, split into two segments leaving a 3ft gap centered.
  const longAxisLen = wall.length;
  const door = wall.hasDoor ? DOOR_WIDTH_FT : 0;
  const sideLen = (longAxisLen - door) / 2;

  const segs: Array<{
    cx: number;
    cz: number;
    sizeX: number;
    sizeZ: number;
  }> = [];

  if (!wall.hasDoor || sideLen <= 0) {
    if (wall.axis === "x") {
      segs.push({ cx: wall.cx, cz: wall.cz, sizeX: longAxisLen, sizeZ: WALL_THICKNESS_FT });
    } else {
      segs.push({ cx: wall.cx, cz: wall.cz, sizeX: WALL_THICKNESS_FT, sizeZ: longAxisLen });
    }
  } else if (wall.axis === "x") {
    segs.push({
      cx: wall.cx - door / 2 - sideLen / 2,
      cz: wall.cz,
      sizeX: sideLen,
      sizeZ: WALL_THICKNESS_FT,
    });
    segs.push({
      cx: wall.cx + door / 2 + sideLen / 2,
      cz: wall.cz,
      sizeX: sideLen,
      sizeZ: WALL_THICKNESS_FT,
    });
    // Header (above the door opening) so the wall reads as a doorway, not a gap.
    segs.push({
      cx: wall.cx,
      cz: wall.cz,
      sizeX: door,
      sizeZ: WALL_THICKNESS_FT,
    });
  } else {
    segs.push({
      cx: wall.cx,
      cz: wall.cz - door / 2 - sideLen / 2,
      sizeX: WALL_THICKNESS_FT,
      sizeZ: sideLen,
    });
    segs.push({
      cx: wall.cx,
      cz: wall.cz + door / 2 + sideLen / 2,
      sizeX: WALL_THICKNESS_FT,
      sizeZ: sideLen,
    });
    segs.push({
      cx: wall.cx,
      cz: wall.cz,
      sizeX: WALL_THICKNESS_FT,
      sizeZ: door,
    });
  }

  return (
    <>
      {segs.map((s, i) => {
        // The third segment (when it exists) is the door header — render
        // shorter and starting above the door height.
        const isHeader = wall.hasDoor && i === 2;
        const h = isHeader ? WALL_HEIGHT_FT - DOOR_HEIGHT_FT : WALL_HEIGHT_FT;
        const yCenter = isHeader
          ? DOOR_HEIGHT_FT + h / 2
          : h / 2;
        return (
          <mesh
            key={`wseg-${i}`}
            position={[s.cx, yCenter, s.cz]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[s.sizeX, h, s.sizeZ]} />
            <meshStandardMaterial
              color={WALL_COLOR}
              roughness={0.85}
              metalness={0}
            />
          </mesh>
        );
      })}
    </>
  );
}

function RoomFloor({ room }: { room: Room }) {
  const cx = room.x + room.w / 2;
  const cz = room.z + room.d / 2;
  const color = FLOOR_COLORS[room.floor] ?? "#dcd0b8";
  return (
    <group position={[cx, 0, cz]}>
      <mesh
        position={[0, 0.05, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[room.w - 0.05, room.d - 0.05]} />
        <meshStandardMaterial
          color={color}
          roughness={0.65}
          metalness={0}
        />
      </mesh>
      {/* Thin trim strip around the room perimeter — adds the architectural
          "baseboard" read so floor patches don't look like flat color blocks. */}
      <mesh position={[0, 0.06, -room.d / 2 + 0.08]}>
        <boxGeometry args={[room.w, 0.12, 0.08]} />
        <meshBasicMaterial color={WALL_TRIM_COLOR} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.06, room.d / 2 - 0.08]}>
        <boxGeometry args={[room.w, 0.12, 0.08]} />
        <meshBasicMaterial color={WALL_TRIM_COLOR} toneMapped={false} />
      </mesh>
      <mesh position={[-room.w / 2 + 0.08, 0.06, 0]}>
        <boxGeometry args={[0.08, 0.12, room.d]} />
        <meshBasicMaterial color={WALL_TRIM_COLOR} toneMapped={false} />
      </mesh>
      <mesh position={[room.w / 2 - 0.08, 0.06, 0]}>
        <boxGeometry args={[0.08, 0.12, room.d]} />
        <meshBasicMaterial color={WALL_TRIM_COLOR} toneMapped={false} />
      </mesh>
    </group>
  );
}

function InteriorScene({
  rooms,
  furniture,
  buildingW,
  buildingD,
  groupRef,
}: {
  rooms: Room[];
  furniture: FurnitureItem[];
  buildingW: number;
  buildingD: number;
  groupRef: React.RefObject<THREE.Group | null>;
}) {
  const walls = useMemo(
    () => deriveWalls(rooms, buildingW, buildingD),
    [rooms, buildingW, buildingD]
  );
  // All rooms are positioned in building-local coords (front-left origin), so
  // the InteriorScene group is shifted to the building's center-relative frame.
  const offset: [number, number, number] = [-buildingW / 2, 0, -buildingD / 2];

  return (
    <group ref={groupRef} scale={[1, 0.0001, 1]} position={offset}>
      {rooms.map((r, i) => (
        <RoomFloor key={`room-${i}-${r.name}`} room={r} />
      ))}
      {walls.map((w, i) => (
        <WallSegment key={`wall-${i}-${w.axis}-${w.cx.toFixed(1)}-${w.cz.toFixed(1)}`} wall={w} />
      ))}
      {furniture.map((item, i) => (
        <FurnitureItemMesh
          key={`f-${item.kind}-${i}-${item.x.toFixed(1)}-${item.z.toFixed(1)}`}
          item={item}
        />
      ))}
    </group>
  );
}

function DefaultBuilding({
  building,
  buildingIndex,
  siblings,
  valid,
  accent,
  delay = 0.1,
}: BuildingProps) {
  const height = building.stories * STORY_HEIGHT_FT;
  const cx = building.x + building.w / 2;
  const cz = building.z + building.d / 2;

  // Anchor at the base so growth scales upward from the lot, not the center.
  const ref = useGrowUp<THREE.Group>(1.0, delay);
  const preset = presetFor(building.material);

  // ── Floor reveal: when a story of THIS building is selected, the body is
  // split at that story's floor line and everything from the selected story
  // up lifts away to expose the nano-banana floor plan on the cut surface.
  // ──
  const selectedFloor = useStore((s) => s.selectedFloor);
  const isSelected = selectedFloor?.buildingIndex === buildingIndex;
  const selectedStory = isSelected ? selectedFloor!.storyIndex : null;
  // Linger after deselection so the lower-down animation can play out before
  // we collapse back to the unsplit single-mass body.
  const [activeSplit, setActiveSplit] = useState<number | null>(null);
  useEffect(() => {
    if (selectedStory !== null) {
      setActiveSplit(selectedStory);
      return;
    }
    const t = setTimeout(() => setActiveSplit(null), 700);
    return () => clearTimeout(t);
  }, [selectedStory]);

  const upperRef = useRef<THREE.Group>(null);
  const liftValRef = useRef(0);
  const interiorGroupRef = useRef<THREE.Group | null>(null);

  const interiors = useStore((s) => s.interiors);
  const interiorRecord =
    activeSplit !== null
      ? interiors[
          interiorCacheKey({
            w: Math.round(building.w),
            d: Math.round(building.d),
            stories: building.stories,
            storyIndex: activeSplit,
            structureType: building.structure_type ?? "office",
            material: building.material ?? "concrete",
            program: building.program,
          })
        ]
      : undefined;

  useFrame((_, dt) => {
    const target = selectedStory !== null ? STORY_LIFT_FT : 0;
    const k = Math.min(1, dt * 4.5);
    liftValRef.current += (target - liftValRef.current) * k;
    if (upperRef.current) upperRef.current.position.y = liftValRef.current;
    // Interior scene grows out of the floor as the lift progresses, so the
    // floor populates beneath the rising upper mass instead of popping in
    // suddenly. Hide immediately on deselect so the descending upper mass
    // doesn't pass through the full-height walls / furniture.
    if (interiorGroupRef.current) {
      const liftProgress = liftValRef.current / STORY_LIFT_FT;
      const target =
        selectedStory !== null ? Math.min(1, Math.max(0, liftProgress)) : 0;
      const cur = interiorGroupRef.current.scale.y;
      const next = cur + (target - cur) * Math.min(1, dt * 6);
      interiorGroupRef.current.scale.y = Math.max(0.0001, next);
    }
  });

  const split = activeSplit;
  const lowerH = split !== null ? split * STORY_HEIGHT_FT : 0;
  const upperH = split !== null ? height - lowerH : height;
  // Plinth top sits ~0.7ft up; clear it for the ground-floor case so the
  // plane doesn't z-fight with the trim.
  const planeY = split !== null ? Math.max(lowerH, 0.78) + 0.04 : 0;

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

      {/* Lower mass — only the portion below the cut. With no selection the
          full body lives in the upper group as one unsplit volume. */}
      {split !== null && split > 0 && (
        <mesh position={[0, lowerH / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[building.w, lowerH, building.d]} />
          <meshStandardMaterial
            color={bodyColor}
            roughness={preset.roughness}
            metalness={preset.metalness}
          />
          <Edges color={edgeColor} lineWidth={1.0} threshold={20} />
        </mesh>
      )}

      {/* Lower-mass windows */}
      {valid &&
        split !== null &&
        Array.from({ length: split }).map((_, i) => (
          <StoryWindows
            key={`win-low-${i}`}
            storyIndex={i}
            w={building.w}
            d={building.d}
            accent={accent}
            preset={preset}
            occluded={occluded}
          />
        ))}

      {/* Lower-mass cornices */}
      {split !== null &&
        Array.from({ length: Math.max(0, split - 1) }).map((_, i) => {
          const y = (i + 1) * STORY_HEIGHT_FT - 0.125;
          return (
            <mesh
              key={`fl-low-${i}`}
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

      {/* Front entrance — anchored to ground; doesn't ride the lift. */}
      {valid && (
        <FrontDoor
          d={building.d}
          accent={accent}
          preset={preset}
          occludedSouth={occluded.s}
        />
      )}

      {/* Floor plan reveal — sits on the cut surface, fades in as the upper
          mass lifts away. Plate is a paper-toned base that the nano-banana
          line drawing replaces once the texture arrives. Thin accent outline
          frames the footprint. Loading is invisible by design — prefetch
          starts the moment the plan settles, so the texture is usually
          already in cache by the time the user clicks. */}
      {split !== null && (
        <group position={[0, planeY, 0]}>
          {/* Real 3D interior — colored room floors, auto-derived walls
              with door cutouts between adjacent rooms, and furniture inside
              each room. The whole scene grows up out of the cut surface as
              the upper mass lifts. */}
          {selectedStory !== null &&
            interiorRecord?.status === "ready" &&
            interiorRecord.rooms &&
            interiorRecord.furniture && (
              <InteriorScene
                rooms={interiorRecord.rooms}
                furniture={interiorRecord.furniture}
                buildingW={building.w}
                buildingD={building.d}
                groupRef={interiorGroupRef}
              />
            )}

          {interiorRecord?.status === "error" && (
            <Html position={[0, 0.5, 0]} center>
              <div className="pointer-events-none whitespace-nowrap rounded bg-paper/95 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-rose-700 shadow-sm">
                interior generation failed
              </div>
            </Html>
          )}
        </group>
      )}

      {/* ─── Upper group — lifts when a floor is selected. Holds the body
          (or its upper portion when split), windows above the cut, upper
          cornices, and the roof. ─── */}
      <group ref={upperRef}>
        {split === null ? (
          <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[building.w, height, building.d]} />
            <meshStandardMaterial
              color={bodyColor}
              roughness={preset.roughness}
              metalness={preset.metalness}
            />
            <Edges color={edgeColor} lineWidth={1.0} threshold={20} />
          </mesh>
        ) : (
          <mesh
            position={[0, lowerH + upperH / 2, 0]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[building.w, upperH, building.d]} />
            <meshStandardMaterial
              color={bodyColor}
              roughness={preset.roughness}
              metalness={preset.metalness}
            />
            <Edges color={edgeColor} lineWidth={1.0} threshold={20} />
          </mesh>
        )}

        {/* Upper-mass windows — story i where i >= split (or all if no split) */}
        {valid &&
          Array.from({ length: building.stories }).map((_, i) => {
            if (split !== null && i < split) return null;
            return (
              <StoryWindows
                key={`win-up-${i}`}
                storyIndex={i}
                w={building.w}
                d={building.d}
                accent={accent}
                preset={preset}
                occluded={occluded}
              />
            );
          })}

        {/* Upper-mass cornices — cornice i is between story i and i+1; goes
            with upper when i >= split - 1. */}
        {Array.from({ length: Math.max(0, building.stories - 1) }).map(
          (_, i) => {
            if (split !== null && i < split - 1) return null;
            const y = (i + 1) * STORY_HEIGHT_FT - 0.125;
            return (
              <mesh
                key={`fl-up-${i}`}
                position={[0, y, 0]}
                castShadow
                receiveShadow
              >
                <boxGeometry
                  args={[building.w + 0.3, 0.25, building.d + 0.3]}
                />
                <meshStandardMaterial
                  color={preset.floorLine}
                  roughness={0.55}
                  metalness={preset.metalness * 0.4}
                />
              </mesh>
            );
          }
        )}

        {/* Roof — gable for low-rise residential, flat parapet otherwise. */}
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
            <mesh position={[0, height + 0.4, 0]} castShadow>
              <boxGeometry args={[building.w + 0.3, 0.8, building.d + 0.3]} />
              <meshStandardMaterial
                color={roofColor}
                roughness={preset.roughness}
                metalness={preset.metalness * 0.6}
              />
            </mesh>
            <mesh position={[0, height + 0.85, 0]}>
              <boxGeometry
                args={[building.w + 0.34, 0.15, building.d + 0.34]}
              />
              <meshStandardMaterial
                color={valid ? accent : COLORS.buildingInvalid}
                emissive={valid ? accent : COLORS.buildingInvalid}
                emissiveIntensity={valid ? 0.45 : 0.2}
                roughness={0.4}
                metalness={0.1}
              />
            </mesh>
            {valid && (
              <RooftopHVAC w={building.w} d={building.d} baseY={height + 0.95} />
            )}
          </>
        )}
      </group>

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

// ----- Bushes ---------------------------------------------------------------

const BUSH_PALETTE = {
  boxwood: { primary: "#3f6840", shadow: "#2c4a2d" },
  hedge_round: { primary: "#4a7548", shadow: "#345134" },
  flowering: {
    primary: "#5b8a4d",
    shadow: "#3d6234",
    flower: ["#d76b8a", "#e8a55c", "#e2d56a"],
  },
};

function BushMesh({ bush, delay = 0 }: { bush: Bush; delay?: number }) {
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
    t.current = Math.min(1, t.current + dt / 0.4);
    const e = 1 - Math.pow(1 - t.current, 3);
    const s = Math.max(0.0001, e);
    m.scale.set(s, s, s);
  });

  // Stable jitter so the same bush always looks identical between renders.
  const seed = stallHash(Math.round(bush.x * 11 + bush.z * 17));
  const yaw = seed * Math.PI * 2;
  const sizeJitter = 0.92 + seed * 0.16;

  const r = (bush.size / 2) * sizeJitter;
  const variety = bush.variety;
  const palette = BUSH_PALETTE[variety];

  return (
    <group ref={ref} position={[bush.x, 0, bush.z]} rotation={[0, yaw, 0]}>
      {variety === "boxwood" && (
        // Tighter, more formal: a low rounded rectangle with subtle clumps.
        <group>
          <mesh position={[0, r * 0.55, 0]} castShadow>
            <boxGeometry args={[r * 1.7, r * 1.1, r * 1.7]} />
            <meshStandardMaterial color={palette.primary} roughness={0.85} />
          </mesh>
          <mesh position={[r * 0.3, r * 0.85, r * 0.2]} castShadow>
            <sphereGeometry args={[r * 0.5, 8, 6]} />
            <meshStandardMaterial color={palette.shadow} roughness={0.9} />
          </mesh>
          <mesh position={[-r * 0.4, r * 0.8, -r * 0.15]} castShadow>
            <sphereGeometry args={[r * 0.45, 8, 6]} />
            <meshStandardMaterial color={palette.primary} roughness={0.85} />
          </mesh>
        </group>
      )}
      {variety === "hedge_round" && (
        // Big rounded mound made of overlapping spheres.
        <group>
          <mesh position={[0, r * 0.7, 0]} castShadow>
            <sphereGeometry args={[r, 12, 8]} />
            <meshStandardMaterial color={palette.primary} roughness={0.88} />
          </mesh>
          <mesh position={[r * 0.45, r * 0.55, r * 0.3]} castShadow>
            <sphereGeometry args={[r * 0.65, 8, 6]} />
            <meshStandardMaterial color={palette.shadow} roughness={0.9} />
          </mesh>
          <mesh position={[-r * 0.4, r * 0.6, -r * 0.35]} castShadow>
            <sphereGeometry args={[r * 0.6, 8, 6]} />
            <meshStandardMaterial color={palette.primary} roughness={0.88} />
          </mesh>
        </group>
      )}
      {variety === "flowering" && (
        // Greenery + a few colorful flower puffs on top.
        <group>
          <mesh position={[0, r * 0.65, 0]} castShadow>
            <sphereGeometry args={[r * 0.95, 10, 8]} />
            <meshStandardMaterial color={palette.primary} roughness={0.88} />
          </mesh>
          <mesh position={[r * 0.35, r * 0.55, r * 0.25]} castShadow>
            <sphereGeometry args={[r * 0.55, 8, 6]} />
            <meshStandardMaterial color={palette.shadow} roughness={0.9} />
          </mesh>
          {/* Flowers — three small bright puffs across the top */}
          {BUSH_PALETTE.flowering.flower.map((c, i) => {
            const a = (i / 3) * Math.PI * 2 + seed * 5;
            const fx = Math.cos(a) * r * 0.55;
            const fz = Math.sin(a) * r * 0.55;
            return (
              <mesh
                key={`fl-${i}`}
                position={[fx, r * 1.0, fz]}
                castShadow
              >
                <sphereGeometry args={[r * 0.18, 6, 5]} />
                <meshStandardMaterial
                  color={c}
                  emissive={c}
                  emissiveIntensity={0.18}
                  roughness={0.7}
                />
              </mesh>
            );
          })}
        </group>
      )}
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

// Pool — recessed water surface in the lot with a thin coping border. Uses
// SiteworkLayer's coordinate frame: lot origin sits at (-w/2, 0, -d/2) of
// the parent group, so we shift by the pool's front-left corner here.
function PoolMesh({ pool, delay = 0 }: { pool: Pool; delay?: number }) {
  const { x, z, w, d, shape } = pool;
  const cx = x + w / 2;
  const cz = z + d / 2;
  const ref = useFadeIn<THREE.Group>(0.4, delay);

  // Y stack:
  //   lotTop = 0.12, copingTop = lotTop + 0.05, waterY = lotTop - 0.04
  // (water surface sits below the coping, suggesting a recessed pool)
  const copingT = 0.18;
  const copingY = Y.lotTop + copingT / 2 + 0.005;
  const waterY = Y.lotTop - 0.05;
  const copingW = 1.2;

  const waterColor = "#2c8fb8";
  const waterEmissive = "#65b8d8";
  const copingColor = "#e2dccb";
  const copingEdge = "#8a8470";

  return (
    <group ref={ref} position={[cx, 0, cz]}>
      {shape === "round" ? (
        <>
          {/* Coping ring */}
          <mesh position={[0, copingY, 0]} receiveShadow>
            <ringGeometry args={[Math.min(w, d) / 2 - 0.02, Math.min(w, d) / 2 + copingW, 48]} />
            <meshStandardMaterial color={copingColor} roughness={0.9} side={THREE.DoubleSide} />
          </mesh>
          {/* Water disc */}
          <mesh position={[0, waterY, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <circleGeometry args={[Math.min(w, d) / 2 - 0.02, 48]} />
            <meshStandardMaterial
              color={waterColor}
              emissive={waterEmissive}
              emissiveIntensity={0.18}
              roughness={0.18}
              metalness={0.25}
            />
          </mesh>
        </>
      ) : (
        <>
          {/* Coping frame — four thin slabs around the pool perimeter */}
          {/* North (front, -z) */}
          <mesh position={[0, copingY, -d / 2 - copingW / 2 + 0.02]} receiveShadow>
            <boxGeometry args={[w + copingW * 2, copingT, copingW]} />
            <meshStandardMaterial color={copingColor} roughness={0.9} />
            <Edges color={copingEdge} lineWidth={0.3} />
          </mesh>
          {/* South (back, +z) */}
          <mesh position={[0, copingY, d / 2 + copingW / 2 - 0.02]} receiveShadow>
            <boxGeometry args={[w + copingW * 2, copingT, copingW]} />
            <meshStandardMaterial color={copingColor} roughness={0.9} />
            <Edges color={copingEdge} lineWidth={0.3} />
          </mesh>
          {/* East (right, +x) */}
          <mesh position={[w / 2 + copingW / 2 - 0.02, copingY, 0]} receiveShadow>
            <boxGeometry args={[copingW, copingT, d]} />
            <meshStandardMaterial color={copingColor} roughness={0.9} />
            <Edges color={copingEdge} lineWidth={0.3} />
          </mesh>
          {/* West (left, -x) */}
          <mesh position={[-w / 2 - copingW / 2 + 0.02, copingY, 0]} receiveShadow>
            <boxGeometry args={[copingW, copingT, d]} />
            <meshStandardMaterial color={copingColor} roughness={0.9} />
            <Edges color={copingEdge} lineWidth={0.3} />
          </mesh>
          {/* Water surface */}
          <mesh
            position={[0, waterY, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow
          >
            <planeGeometry args={[w - 0.04, d - 0.04]} />
            <meshStandardMaterial
              color={waterColor}
              emissive={waterEmissive}
              emissiveIntensity={0.18}
              roughness={0.18}
              metalness={0.25}
            />
          </mesh>
        </>
      )}
    </group>
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
