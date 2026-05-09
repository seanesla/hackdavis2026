"use client";
import { useStore } from "@/lib/store";

export default function SitePlanMesh() {
  const plan = useStore((s) => s.plan);
  if (!plan) return null;

  const { lot, building, parking } = plan;

  return (
    <group>
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[lot.width, 0.1, lot.depth]} />
        <meshStandardMaterial color="#86efac" />
      </mesh>

      {building && (
        <mesh
          position={[building.x, (building.stories * 12) / 2, building.z]}
        >
          <boxGeometry
            args={[building.w, building.stories * 12, building.d]}
          />
          <meshStandardMaterial color="#60a5fa" />
        </mesh>
      )}

      {parking?.map((p, i) => (
        <mesh key={i} position={[p.x, 0.11, p.z]}>
          <boxGeometry args={[9, 0.1, 18]} />
          <meshStandardMaterial color="#374151" />
        </mesh>
      ))}
    </group>
  );
}
