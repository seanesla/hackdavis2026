"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Grid, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import SitePlanMesh from "./SitePlanMesh";
import { useStore } from "@/lib/store";
import { useAccent } from "@/lib/accent";
import type { SitePlan } from "@/lib/types";

type Props = { siteplan?: SitePlan | null };

export default function Scene({ siteplan }: Props) {
  const [interacted, setInteracted] = useState(false);
  const accent = useAccent((s) => s.accent.hex);

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
        maxPolarAngle={Math.PI / 2.05}
        target={[0, 0, 0]}
        autoRotate={!interacted}
        autoRotateSpeed={0.35}
        enableDamping
        dampingFactor={0.08}
      />
      <CameraRig siteplan={siteplan} />
    </Canvas>
  );
}

function CameraRig({ siteplan }: { siteplan?: SitePlan | null }) {
  const storePlan = useStore((s) => s.plan);
  const plan = siteplan !== undefined ? siteplan : storePlan;

  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as
    | { target: THREE.Vector3; update: () => void }
    | null;

  const targetPos = useMemo(() => {
    if (!plan || plan.lot.width <= 0 || plan.lot.depth <= 0) {
      return new THREE.Vector3(120, 110, 140);
    }
    const span = Math.max(plan.lot.width, plan.lot.depth, 40);
    const d = span * 1.3;
    return new THREE.Vector3(d, d * 0.85, d);
  }, [plan?.lot.width, plan?.lot.depth]);

  const remaining = useRef(0);

  useEffect(() => {
    remaining.current = 1.2;
  }, [targetPos]);

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
