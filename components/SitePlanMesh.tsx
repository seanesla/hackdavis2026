"use client";
import { useStore } from "@/lib/store";
import { STORY_HEIGHT_FT } from "@/lib/types";

const SCAFFOLD_BOX = { w: 30, d: 30, h: 24 };

export default function SitePlanMesh() {
  const plan = useStore((s) => s.plan);

  if (!plan) {
    return (
      <mesh
        position={[0, SCAFFOLD_BOX.h / 2, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[SCAFFOLD_BOX.w, SCAFFOLD_BOX.h, SCAFFOLD_BOX.d]} />
        <meshStandardMaterial color="#22c55e" />
      </mesh>
    );
  }

  const { lot, building, parking } = plan;

  return (
    <group position={[-lot.width / 2, 0, -lot.depth / 2]}>
      <mesh position={[lot.width / 2, 0.05, lot.depth / 2]} receiveShadow>
        <boxGeometry args={[lot.width, 0.1, lot.depth]} />
        <meshStandardMaterial color="#dcfce7" />
      </mesh>

      {building && (
        <mesh
          position={[
            building.x + building.w / 2,
            (building.stories * STORY_HEIGHT_FT) / 2,
            building.z + building.d / 2,
          ]}
          castShadow
          receiveShadow
        >
          <boxGeometry
            args={[building.w, building.stories * STORY_HEIGHT_FT, building.d]}
          />
          <meshStandardMaterial color="#60a5fa" />
        </mesh>
      )}

      {parking?.map((p, i) => (
        <mesh
          key={i}
          position={[p.x + 4.5, 0.11, p.z + 9]}
          receiveShadow
        >
          <boxGeometry args={[9, 0.1, 18]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
      ))}
    </group>
  );
}
