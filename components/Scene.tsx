"use client";
import { Canvas } from "@react-three/fiber";
import { Grid, OrbitControls } from "@react-three/drei";
import SitePlanMesh from "./SitePlanMesh";

export default function Scene() {
  return (
    <Canvas shadows camera={{ position: [120, 120, 120], fov: 45 }}>
      <color attach="background" args={["#f3f4f6"]} />

      <ambientLight intensity={0.4} />
      <directionalLight
        position={[80, 120, 60]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-200}
        shadow-camera-right={200}
        shadow-camera-top={200}
        shadow-camera-bottom={-200}
        shadow-camera-near={1}
        shadow-camera-far={400}
      />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.05, 0]}
        receiveShadow
      >
        <planeGeometry args={[1000, 1000]} />
        <meshStandardMaterial color="#9ca3af" />
      </mesh>

      <Grid
        args={[500, 500]}
        position={[0, 0, 0]}
        cellSize={10}
        cellThickness={0.6}
        cellColor="#6b7280"
        sectionSize={50}
        sectionThickness={1.2}
        sectionColor="#374151"
        fadeDistance={350}
        fadeStrength={1}
      />

      <SitePlanMesh />

      <OrbitControls
        makeDefault
        minDistance={30}
        maxDistance={400}
        maxPolarAngle={Math.PI / 2.1}
        target={[0, 0, 0]}
      />
    </Canvas>
  );
}
