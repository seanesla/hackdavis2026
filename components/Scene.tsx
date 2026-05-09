"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Grid, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import SitePlanMesh from "./SitePlanMesh";
import { useStore } from "@/lib/store";
import type { SitePlan } from "@/lib/types";

type Props = { siteplan?: SitePlan | null };

export default function Scene({ siteplan }: Props) {
  const [interacted, setInteracted] = useState(false);

  return (
    <Canvas
      shadows
      gl={{ alpha: true }}
      camera={{ position: [120, 110, 140], fov: 42 }}
      onPointerDown={() => setInteracted(true)}
    >
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[80, 120, 60]}
        intensity={1.1}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-200}
        shadow-camera-right={200}
        shadow-camera-top={200}
        shadow-camera-bottom={-200}
        shadow-camera-near={1}
        shadow-camera-far={400}
      />

      {/* Invisible shadow catcher — lets ContourBackground show through */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.05, 0]}
        receiveShadow
      >
        <planeGeometry args={[1000, 1000]} />
        <shadowMaterial transparent opacity={0.35} />
      </mesh>

      <Grid
        args={[500, 500]}
        position={[0, 0, 0]}
        cellSize={10}
        cellThickness={0.5}
        cellColor="#3f3f46"
        sectionSize={50}
        sectionThickness={1}
        sectionColor="#52525b"
        fadeDistance={500}
        fadeStrength={1.2}
      />

      <SitePlanMesh siteplan={siteplan} />

      <OrbitControls
        makeDefault
        minDistance={20}
        maxDistance={800}
        maxPolarAngle={Math.PI / 2.1}
        target={[0, 0, 0]}
        autoRotate={!interacted}
        autoRotateSpeed={0.4}
        enableDamping
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
