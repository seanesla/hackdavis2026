"use client";
import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  type RefObject,
} from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { useAccent } from "@/lib/accent";

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

type HammerProps = {
  isLoading: boolean;
  interactive: boolean;
  subtle: boolean;
  lightRef: RefObject<THREE.PointLight | null>;
};

function Hammer({ isLoading, interactive, subtle, lightRef }: HammerProps) {
  const lift = useRef<THREE.Group>(null);
  const strike = useRef<THREE.Group>(null);
  const spinner = useRef<THREE.Group>(null);
  const drift = useRef<THREE.Group>(null);

  const reduced = useRef(false);
  const hovered = useRef(false);
  const submitStart = useRef<number | null>(null);
  const baseSpin = subtle ? 0.002 : 0.005;
  const spinVel = useRef(baseSpin);

  const { scene } = useGLTF("/models/hammer.glb");

  const { centeredScene, scale } = useMemo(() => {
    const cloned = scene.clone(true);
    cloned.updateMatrixWorld(true);

    const centroid = new THREE.Vector3();
    const tmp = new THREE.Vector3();
    let count = 0;
    cloned.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const pos = mesh.geometry.getAttribute("position");
      if (!pos) return;
      for (let i = 0; i < pos.count; i++) {
        tmp.fromBufferAttribute(pos, i);
        tmp.applyMatrix4(mesh.matrixWorld);
        centroid.add(tmp);
        count++;
      }
    });
    if (count > 0) centroid.divideScalar(count);

    const box = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    box.getSize(size);

    cloned.position.sub(centroid);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    return { centeredScene: cloned, scale: 2.6 / maxDim };
  }, [scene]);

  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduced.current = m.matches;
    const onChange = () => (reduced.current = m.matches);
    m.addEventListener("change", onChange);
    return () => m.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    submitStart.current = isLoading ? performance.now() : null;
  }, [isLoading]);

  useFrame((_, delta) => {
    const t = performance.now() / 1000;
    const dt60 = Math.min(delta * 60, 3);
    const submitElapsed = submitStart.current
      ? (performance.now() - submitStart.current) / 1000
      : -1;
    const submitting = isLoading;

    if (lift.current) {
      const liftActive =
        interactive && hovered.current && !submitting && !reduced.current;
      const targetZ = liftActive ? 0.15 : 0;
      const targetScale = liftActive ? 1.02 : 1.0;
      lift.current.position.z = lerp(lift.current.position.z, targetZ, 0.12);
      const s = lerp(lift.current.scale.x, targetScale, 0.12);
      lift.current.scale.set(s, s, s);
    }

    if (strike.current) {
      let targetX = 0;
      if (submitting && submitElapsed >= 0 && !reduced.current) {
        if (submitElapsed < 0.25) {
          targetX = lerp(0, 1.0, easeOutCubic(submitElapsed / 0.25));
        } else if (submitElapsed < 0.35) {
          targetX = lerp(1.0, 0.85, (submitElapsed - 0.25) / 0.1);
        } else {
          targetX = 0.6;
        }
      }
      strike.current.rotation.x = lerp(strike.current.rotation.x, targetX, 0.18);
    }

    const peakSpin = subtle ? 0.04 : 0.06;
    let targetSpin = baseSpin;
    if (submitting && submitElapsed >= 0.35 && !reduced.current) {
      const ramp = clamp01((submitElapsed - 0.35) / 0.4);
      targetSpin = lerp(baseSpin, peakSpin, easeOutCubic(ramp));
    }
    spinVel.current = lerp(spinVel.current, targetSpin, 0.1);
    if (spinner.current && !reduced.current) {
      spinner.current.rotation.y += spinVel.current * dt60;
    }

    if (drift.current) {
      const bobAmp = subtle ? 0.02 : 0.06;
      const tiltAmp = subtle ? 0.015 : 0.04;
      const bobActive = !reduced.current && !submitting;
      const targetBob = bobActive ? Math.sin(t * 1.2) * bobAmp : 0;
      const targetTilt = bobActive ? Math.sin(t * 0.7 + 0.5) * tiltAmp : 0;
      drift.current.position.y = lerp(drift.current.position.y, targetBob, 0.15);
      drift.current.rotation.z = lerp(
        drift.current.rotation.z,
        targetTilt,
        0.15,
      );
    }

    if (lightRef.current) {
      const idle = subtle ? 0.6 : 0.9;
      const hover = subtle ? 1.2 : 1.4;
      const loading = subtle ? 1.8 : 2.4;
      const target = submitting ? loading : hovered.current ? hover : idle;
      lightRef.current.intensity = lerp(
        lightRef.current.intensity,
        target,
        0.1,
      );
    }
  });

  const pointerHandlers = interactive
    ? {
        onPointerOver: (e: { stopPropagation: () => void }) => {
          e.stopPropagation();
          hovered.current = true;
          document.body.style.cursor = "pointer";
        },
        onPointerOut: () => {
          hovered.current = false;
          document.body.style.cursor = "";
        },
      }
    : {};

  return (
    <group ref={lift} {...pointerHandlers}>
      <group ref={drift}>
        <group ref={strike}>
          <group ref={spinner} scale={scale}>
            <group rotation={[0, 0, -Math.PI / 2]}>
              <primitive object={centeredScene} />
            </group>
          </group>
        </group>
      </group>
      {interactive && (
        <mesh>
          <boxGeometry args={[1.6, 2.0, 1.6]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

useGLTF.preload("/models/hammer.glb");

type Props = {
  isLoading?: boolean;
  interactive?: boolean;
  subtle?: boolean;
  className?: string;
};

export default function Hammer3D({
  isLoading = false,
  interactive = false,
  subtle = false,
  className,
}: Props) {
  const accent = useAccent((s) => s.accent.hex);
  const lightRef = useRef<THREE.PointLight>(null);

  return (
    <div className={className} style={{ width: "100%", height: "100%" }}>
      <Canvas
        camera={{ position: [0, 0, 4.5], fov: 40 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={subtle ? 0.7 : 0.9} />
        <directionalLight position={[5, 5, 5]} intensity={subtle ? 1.2 : 1.6} />
        <pointLight
          ref={lightRef}
          position={[-3, 2, 4]}
          intensity={subtle ? 0.6 : 0.9}
          color={accent}
        />
        <Suspense fallback={null}>
          <Hammer
            isLoading={isLoading}
            interactive={interactive}
            subtle={subtle}
            lightRef={lightRef}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
