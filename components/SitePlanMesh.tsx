"use client";
import { useStore } from "@/lib/store";
import { useAccent } from "@/lib/accent";

export default function SitePlanMesh() {
  const plan = useStore((s) => s.plan);
  const accent = useAccent((s) => s.accent.hex);
  if (!plan) return null;

  const { lot, building, parking } = plan;

  return (
    <group>
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[lot.width, 0.1, lot.depth]} />
        <meshStandardMaterial color="#f5f5f4" roughness={0.95} />
      </mesh>

      {building && (
        <group position={[building.x, 0, building.z]}>
          <mesh position={[0, (building.stories * 12) / 2, 0]}>
            <boxGeometry args={[building.w, building.stories * 12, building.d]} />
            <meshStandardMaterial color="#1f1f23" roughness={0.6} />
          </mesh>
          <mesh position={[0, building.stories * 12 + 0.4, 0]}>
            <boxGeometry args={[building.w + 0.2, 0.6, building.d + 0.2]} />
            <meshStandardMaterial
              color={accent}
              emissive={accent}
              emissiveIntensity={0.4}
              roughness={0.4}
            />
          </mesh>
        </group>
      )}

      {parking?.map((p, i) => (
        <mesh key={i} position={[p.x, 0.11, p.z]}>
          <boxGeometry args={[9, 0.1, 18]} />
          <meshStandardMaterial color="#27272a" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}
