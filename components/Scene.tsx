"use client";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { useViewerStore } from "@/lib/viewerStore";
import type { SitePlan } from "@/lib/types";

type Props = { siteplan?: SitePlan | null };

export default function Scene({ siteplan }: Props) {
  const [interacted, setInteracted] = useState(false);
  const accent = useAccent((s) => s.accent.hex);
  const selectFloor = useStore((s) => s.selectFloor);
  const sunTime = useViewerStore((s) => s.sunTime);
  const topDown = useViewerStore((s) => s.topDown);

  // Sun arc: morning (east) → noon (overhead) → evening (west). +z bias so
  // shadows fall mostly toward the front (street) for a recognizable
  // mid-day rendering at sunTime=0.5.
  const sunPos = useMemo<[number, number, number]>(() => {
    const theta = sunTime * Math.PI;
    const r = 200;
    return [r * Math.cos(theta), r * Math.sin(theta) + 30, 60];
  }, [sunTime]);

  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      gl={{
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
        // Logarithmic depth distribution — kills z-fighting on layered window
        // trim/glass/mullion planes at long camera distances. At ~zero cost
        // for our geometry budget. Pairs with a tighter near/far range
        // (5/1500) to give the depth buffer enough precision to distinguish
        // the fractional-foot offsets in window/door details.
        logarithmicDepthBuffer: true,
      }}
      camera={{ position: [120, 110, 140], fov: 38, near: 5, far: 1500 }}
      onPointerDown={() => setInteracted(true)}
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

      {/* Key light — driven by the sun slider in viewerStore. */}
      <directionalLight
        position={sunPos}
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

      {/* Drafting grid — subtle, sits just below lot to avoid z-fight. */}
      <Grid
        args={[600, 600]}
        position={[0, -0.02, 0]}
        cellSize={10}
        cellThickness={0.4}
        cellColor="#23232a"
        sectionSize={50}
        sectionThickness={0.8}
        sectionColor="#3a3a44"
        fadeDistance={420}
        fadeStrength={1.4}
      />

      <SitePlanMesh siteplan={siteplan} />

      <OrbitControls
        makeDefault
        minDistance={20}
        maxDistance={800}
        // When top-down is on, lock the polar angle to ~straight-down so the
        // user can pan/zoom but can't tilt out of plan view.
        minPolarAngle={topDown ? 0 : 0}
        maxPolarAngle={topDown ? 0.05 : Math.PI / 2.05}
        target={[0, 0, 0]}
        autoRotate={!interacted && !topDown}
        autoRotateSpeed={0.35}
        enableDamping
        dampingFactor={0.08}
      />
      <CameraRig siteplan={siteplan} topDown={topDown} />
    </Canvas>
  );
}

function CameraRig({
  siteplan,
  topDown,
}: {
  siteplan?: SitePlan | null;
  topDown: boolean;
}) {
  const storePlan = useStore((s) => s.plan);
  const plan = siteplan !== undefined ? siteplan : storePlan;

  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as
    | { target: THREE.Vector3; update: () => void }
    | null;

  const targetPos = useMemo(() => {
    if (!plan || plan.lot.width <= 0 || plan.lot.depth <= 0) {
      return topDown
        ? new THREE.Vector3(0, 220, 0.001)
        : new THREE.Vector3(120, 110, 140);
    }
    const span = Math.max(plan.lot.width, plan.lot.depth, 40);
    if (topDown) {
      // Position high above the lot center; slight z offset prevents the
      // OrbitControls "look-down" singularity.
      return new THREE.Vector3(0, span * 1.6, 0.001);
    }
    const d = span * 1.3;
    return new THREE.Vector3(d, d * 0.85, d);
  }, [plan?.lot.width, plan?.lot.depth, topDown]);

  // Tighter FOV in top-down mode → reads more like an orthographic plan view
  // (less perspective foreshortening). Wider FOV in perspective for context.
  const targetFov = topDown ? 18 : 38;

  const animationLeft = useRef(0);

  useEffect(() => {
    // Re-arm the animation whenever target changes (lot resize, mode switch)
    animationLeft.current = 1.4;
  }, [targetPos, targetFov]);

  useFrame((_, dt) => {
    if (animationLeft.current <= 0) return;
    animationLeft.current -= dt;
    const k = 1 - Math.exp(-dt * 4);
    camera.position.lerp(targetPos, k);
    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, k);
    camera.updateProjectionMatrix();
    if (controls?.target) {
      controls.target.lerp(new THREE.Vector3(0, 0, 0), k);
      controls.update();
    }
  });

  return null;
}
