"use client";
import { Canvas } from "@react-three/fiber";
import { Grid, OrbitControls } from "@react-three/drei";
import { useState } from "react";
import SitePlanMesh from "./SitePlanMesh";

export default function Scene() {
  const [interacted, setInteracted] = useState(false);

  return (
    <Canvas
      camera={{ position: [120, 110, 140], fov: 42 }}
      onPointerDown={() => setInteracted(true)}
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[60, 120, 40]} intensity={1.1} />
      <Grid
        args={[500, 500]}
        cellSize={10}
        cellThickness={0.5}
        cellColor="#3f3f46"
        sectionSize={50}
        sectionThickness={1}
        sectionColor="#52525b"
        infiniteGrid
        fadeDistance={500}
        fadeStrength={1.2}
      />
      <SitePlanMesh />
      <OrbitControls
        makeDefault
        autoRotate={!interacted}
        autoRotateSpeed={0.4}
        enableDamping
      />
    </Canvas>
  );
}
