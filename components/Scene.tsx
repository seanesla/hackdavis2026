"use client";
import { Canvas } from "@react-three/fiber";
import { Grid, OrbitControls } from "@react-three/drei";
import SitePlanMesh from "./SitePlanMesh";

export default function Scene() {
  return (
    <Canvas camera={{ position: [120, 120, 120], fov: 45 }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[50, 100, 50]} intensity={1} />
      <Grid
        args={[400, 400]}
        cellSize={10}
        cellThickness={0.6}
        cellColor="#9ca3af"
        sectionSize={50}
        sectionThickness={1.2}
        sectionColor="#4b5563"
        infiniteGrid
        fadeDistance={400}
      />
      <SitePlanMesh />
      <OrbitControls makeDefault />
    </Canvas>
  );
}
