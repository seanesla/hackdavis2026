"use client";
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  ContactShadows,
  Environment,
  Grid,
  OrbitControls,
} from "@react-three/drei";
import * as THREE from "three";
import SitePlanMesh from "./SitePlanMesh";
import { useStore } from "@/lib/store";
import { useAccent } from "@/lib/accent";
import type { SitePlan } from "@/lib/types";
import { registerScene, unregisterScene } from "@/lib/sceneControls";

type Props = { siteplan?: SitePlan | null };

export default function Scene({ siteplan }: Props) {
  const accent = useAccent((s) => s.accent.hex);
  const selectFloor = useStore((s) => s.selectFloor);
  const autoRotate = useStore((s) => s.autoRotate);
  const setAutoRotate = useStore((s) => s.setAutoRotate);
  const gridVisible = useStore((s) => s.gridVisible);

  return (
    <Canvas
      id="plan-canvas"
      shadows
      dpr={[1, 1.5]}
      gl={{
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
        // Required so canvas.toDataURL() returns a non-blank PNG for the
        // NFT-mint screenshot. Minor perf cost on some drivers; negligible here.
        preserveDrawingBuffer: true,
        // Logarithmic depth distribution — kills z-fighting on layered window
        // trim/glass/mullion planes at long camera distances. At ~zero cost
        // for our geometry budget. Pairs with a tighter near/far range
        // (5/1500) to give the depth buffer enough precision to distinguish
        // the fractional-foot offsets in window/door details.
        logarithmicDepthBuffer: true,
      }}
      camera={{ position: [120, 110, 140], fov: 38, near: 5, far: 1500 }}
      onPointerDown={() => {
        // First user drag stops the intro auto-rotate. The toolbar can turn
        // it back on later — that's why this lives in the store now.
        if (autoRotate) setAutoRotate(false);
      }}
      onPointerMissed={() => selectFloor(null)}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        // Try to recover when WebGL context is lost (GPU memory pressure, tab switch, etc.)
        const canvas = gl.domElement;
        canvas.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          console.warn("WebGL context lost — will attempt restore");
        });
      }}
    >
      {/* HDRI environment — image-based lighting only (no visible background).
          Glass and steel buildings pick up sky reflections; brick / wood get
          warmer ambient tones than the bare hemisphere light could provide. */}
      <Environment preset="city" background={false} environmentIntensity={0.55} />

      {/* Hemisphere — sky tint above, inky bounce below. Matches contour bg. */}
      <hemisphereLight args={["#e6dec8", "#0b0b0c", 0.55]} />

      {/* Key light — warm, top-right, casts the architectural shadow. */}
      <directionalLight
        position={[90, 150, 70]}
        intensity={1.35}
        color="#fff4dc"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-220}
        shadow-camera-right={220}
        shadow-camera-top={220}
        shadow-camera-bottom={-220}
        shadow-camera-near={1}
        shadow-camera-far={500}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      {/* Cool fill — opposite side, no shadow, lifts the dark face. */}
      <directionalLight
        position={[-110, 80, -70]}
        intensity={0.35}
        color="#9bb8d8"
      />
      {/* Accent rim — picks up the roof plate from below */}
      <pointLight position={[0, 8, 0]} intensity={0.15} color={accent} distance={120} />

      {/* Soft ground contact — replaces hard shadow plane, stays soft over contour bg. */}
      <ContactShadows
        position={[0, 0.02, 0]}
        opacity={0.55}
        scale={420}
        blur={2.6}
        far={120}
        resolution={1024}
        color="#000000"
        frames={1}
      />

      {/* Drafting grid — subtle, sits just below lot to avoid z-fight.
          Toggled off via SceneTools so screenshots can be lot-only. */}
      {gridVisible && (
        <Grid
          args={[600, 600]}
          position={[0, -0.02, 0]}
          cellSize={10}
          cellThickness={0.9}
          cellColor="#4a4a55"
          sectionSize={50}
          sectionThickness={1.6}
          sectionColor="#7a7a88"
          fadeDistance={520}
          fadeStrength={0.9}
        />
      )}

      <SitePlanMesh siteplan={siteplan} />

      <OrbitControls
        makeDefault
        minDistance={20}
        maxDistance={800}
        maxPolarAngle={Math.PI / 2.05}
        target={[0, 0, 0]}
        autoRotate={autoRotate}
        autoRotateSpeed={0.35}
        enableDamping
        dampingFactor={0.08}
      />
      <CameraRig siteplan={siteplan} />
      <SceneControlsBridge />
    </Canvas>
  );
}

// Lives inside the Canvas so it can read the camera + OrbitControls via
// useThree, then publishes them to the lib/sceneControls singleton so the
// floating toolbar (rendered outside the Canvas) can drive zoom and
// screenshots programmatically. The renderer + scene are needed for the
// render-on-demand screenshot path.
function SceneControlsBridge() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const controls = useThree((s) => s.controls) as
    | {
        target: THREE.Vector3;
        minDistance: number;
        maxDistance: number;
        update: () => void;
      }
    | null;

  useEffect(() => {
    if (!controls) return;
    registerScene(camera, controls, gl, scene);
    return () => unregisterScene();
  }, [camera, controls, gl, scene]);

  return null;
}

function CameraRig({ siteplan }: { siteplan?: SitePlan | null }) {
  const storePlan = useStore((s) => s.plan);
  const resetTick = useStore((s) => s.resetTick);
  const viewMode = useStore((s) => s.viewMode);
  const plan = siteplan !== undefined ? siteplan : storePlan;

  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as
    | { target: THREE.Vector3; update: () => void }
    | null;

  const targetPos = useMemo(() => {
    const fallbackSpan = 100;
    const span = plan && plan.lot.width > 0 && plan.lot.depth > 0
      ? Math.max(plan.lot.width, plan.lot.depth, 40)
      : fallbackSpan;
    const d = span * 1.3;
    if (viewMode === "top") {
      // Pure overhead. Tiny z offset prevents gimbal weirdness when
      // OrbitControls evaluates the up vector at polar angle ≈ 0.
      return new THREE.Vector3(0, d * 1.4, 0.01);
    }
    return new THREE.Vector3(d, d * 0.85, d);
  }, [plan?.lot.width, plan?.lot.depth, viewMode]);

  const remaining = useRef(0);

  useEffect(() => {
    remaining.current = 1.2;
  }, [targetPos, resetTick]);

  useFrame((_, dt) => {
    if (remaining.current <= 0) return;
    remaining.current -= dt;
    const k = 1 - Math.exp(-dt * 4);
    camera.position.lerp(targetPos, k);
    if (controls?.target) {
      controls.target.lerp(new THREE.Vector3(0, 0, 0), k);
      controls.update();
    }
  });

  return null;
}
