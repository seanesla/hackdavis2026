"use client";
import { Component, Suspense, useMemo, type ReactNode } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

// Auto-scales the GLTF and re-parents into a fresh group so multiple
// instances at different scales don't fight over the cached scene transform.
//
// Two scaling modes:
//  - axis + targetSize → uniform scale so one chosen axis matches target
//    (used for trees and cars where aspect ratio matters).
//  - targetBox → non-uniform scale to fit a 3D bounding box exactly
//    (used for buildings where the AI specifies w × h × d explicitly).
type Axis = "x" | "y" | "z";

type GltfModelProps = {
  url: string;
  /** Uniform-scale mode: target dimension on the chosen axis. */
  targetSize?: number;
  axis?: Axis;
  /** Box-fit mode: per-axis target dimensions (in feet). Non-uniform scale. */
  targetBox?: { x: number; y: number; z: number };
  /** Extra Y rotation in radians applied after scaling. */
  rotateY?: number;
  /** Multiplier on top of the derived scale. */
  scaleBoost?: number;
  /** Casts shadow on every mesh in the loaded scene. */
  castShadow?: boolean;
  /** Receives shadow on every mesh in the loaded scene. */
  receiveShadow?: boolean;
};

function GltfModel({
  url,
  targetSize,
  axis = "y",
  targetBox,
  rotateY = 0,
  scaleBoost = 1,
  castShadow = true,
  receiveShadow = true,
}: GltfModelProps) {
  const { scene } = useGLTF(url);

  const prepared = useMemo(() => {
    const cloned = scene.clone(true);
    const box = new THREE.Box3().setFromObject(cloned);
    const size = box.getSize(new THREE.Vector3());

    if (targetBox) {
      cloned.scale.set(
        (size.x > 0 ? targetBox.x / size.x : 1) * scaleBoost,
        (size.y > 0 ? targetBox.y / size.y : 1) * scaleBoost,
        (size.z > 0 ? targetBox.z / size.z : 1) * scaleBoost
      );
    } else if (targetSize !== undefined) {
      const dim = size[axis];
      const scale = (dim > 0 ? targetSize / dim : 1) * scaleBoost;
      cloned.scale.setScalar(scale);
    }
    cloned.rotation.y = rotateY;

    // After scaling, recompute bbox so we can drop the model onto y=0
    // (and re-center on X/Z so its footprint sits over the parent's origin).
    cloned.updateMatrixWorld(true);
    const scaledBox = new THREE.Box3().setFromObject(cloned);
    cloned.position.y -= scaledBox.min.y;
    if (targetBox) {
      const cx = (scaledBox.min.x + scaledBox.max.x) / 2;
      const cz = (scaledBox.min.z + scaledBox.max.z) / 2;
      cloned.position.x -= cx;
      cloned.position.z -= cz;
    }

    cloned.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const m = o as THREE.Mesh;
        m.castShadow = castShadow;
        m.receiveShadow = receiveShadow;
      }
    });
    return cloned;
  }, [
    scene,
    targetSize,
    axis,
    targetBox?.x,
    targetBox?.y,
    targetBox?.z,
    rotateY,
    scaleBoost,
    castShadow,
    receiveShadow,
  ]);

  return <primitive object={prepared} />;
}

// Catches errors from the GLTF loader (missing file, bad asset, etc.) and
// renders the procedural fallback in its place. Without this, a missing
// /models/tree-oak.glb would crash the whole canvas.
class ModelErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  componentDidCatch(err: unknown) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn("[GltfOrFallback] using procedural fallback:", err);
    }
  }
  render() {
    return this.state.error ? this.props.fallback : this.props.children;
  }
}

export type GltfOrFallbackProps = GltfModelProps & {
  /** Procedural mesh shown while the GLTF loads, or if it's missing/broken. */
  fallback: ReactNode;
};

export default function GltfOrFallback({
  fallback,
  ...modelProps
}: GltfOrFallbackProps) {
  return (
    <ModelErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <GltfModel {...modelProps} />
      </Suspense>
    </ModelErrorBoundary>
  );
}

// Generic boundary for any custom GLTF-backed renderer (e.g. tiled fences).
export function ModelBoundary({
  fallback,
  children,
}: {
  fallback: ReactNode;
  children: ReactNode;
}) {
  return (
    <ModelErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </ModelErrorBoundary>
  );
}
