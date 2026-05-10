"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  ContactShadows,
  Environment,
  Grid,
  OrbitControls,
} from "@react-three/drei";
import * as THREE from "three";
import SitePlanMesh from "./SitePlanMesh";
import { useStore } from "@/lib/store";
import { useAccent } from "@/lib/accent";
import { useViewControls } from "@/lib/viewControls";
import type { SitePlan } from "@/lib/types";

type Props = { siteplan?: SitePlan | null };

export default function Scene({ siteplan }: Props) {
  const [interacted, setInteracted] = useState(false);
  const accent = useAccent((s) => s.accent.hex);
  const selectFloor = useStore((s) => s.selectFloor);
  const autoRotate = useViewControls((s) => s.autoRotate);
  const grid = useViewControls((s) => s.grid);

  // Re-enabling auto-rotate from the toolbar should also clear the
  // "user interacted" gate, otherwise the rotation would refuse to start.
  useEffect(() => {
    if (autoRotate) setInteracted(false);
  }, [autoRotate]);

  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      gl={{
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
        // Needed for the screenshot toolbar action — without preserve, the
        // back buffer is cleared by the browser before toDataURL() runs.
        preserveDrawingBuffer: true,
        // Logarithmic depth distribution — kills z-fighting on layered window
        // trim/glass/mullion planes at long camera distances. At ~zero cost
        // for our geometry budget. Pairs with a tighter near/far range
        // (5/1500) to give the depth buffer enough precision to distinguish
        // the fractional-foot offsets in window/door details.
        logarithmicDepthBuffer: true,
      }}
      camera={{ position: [120, 110, 140], fov: 38, near: 5, far: 1500 }}
      onPointerDown={() => {
        setInteracted(true);
        // First user interaction also pauses the toolbar's auto-rotate flag
        // so the in-Scene OrbitControls and the toolbar agree on state.
        useViewControls.getState().setAutoRotate(false);
      }}
      onPointerMissed={() => selectFloor(null)}
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
      {/* HDRI environment — image-based lighting only (no visible background).
          Glass and steel buildings pick up sky reflections; brick / wood get
          warmer ambient tones than the bare hemisphere light could provide. */}
      <Environment preset="city" background={false} environmentIntensity={0.55} />

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

      {/* Drafting grid — subtle, sits just below lot to avoid z-fight.
          Toggleable from the view-controls toolbar. */}
      {grid && (
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
      )}

      <SitePlanMesh siteplan={siteplan} />

      <OrbitControls
        makeDefault
        minDistance={20}
        maxDistance={800}
        maxPolarAngle={Math.PI / 2.05}
        target={[0, 0, 0]}
        autoRotate={autoRotate && !interacted}
        autoRotateSpeed={0.35}
        enableDamping
        dampingFactor={0.08}
      />
      <CameraRig siteplan={siteplan} />
      <SceneActions siteplan={siteplan} />
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

// Bridges the toolbar (out-of-Canvas) to the camera + controls + renderer.
// Toolbar buttons call into the registered actions; each action sets an
// animation target eased in over a few frames so transitions feel cohesive.
function SceneActions({ siteplan }: { siteplan?: SitePlan | null }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const controls = useThree((s) => s.controls) as
    | {
        target: THREE.Vector3;
        update: () => void;
        minDistance: number;
        maxDistance: number;
      }
    | null;
  const storePlan = useStore((s) => s.plan);
  const plan = siteplan !== undefined ? siteplan : storePlan;
  const registerActions = useViewControls((s) => s.registerActions);

  const animTarget = useRef<{
    pos: THREE.Vector3;
    look: THREE.Vector3;
    t: number;
  } | null>(null);

  const defaultPos = useMemo(() => {
    if (!plan || plan.lot.width <= 0 || plan.lot.depth <= 0) {
      return new THREE.Vector3(120, 110, 140);
    }
    const span = Math.max(plan.lot.width, plan.lot.depth, 40);
    const d = span * 1.3;
    return new THREE.Vector3(d, d * 0.85, d);
  }, [plan?.lot.width, plan?.lot.depth]);

  useFrame((_, dt) => {
    if (!animTarget.current) return;
    animTarget.current.t -= dt;
    const k = 1 - Math.exp(-dt * 5);
    camera.position.lerp(animTarget.current.pos, k);
    if (controls?.target) {
      controls.target.lerp(animTarget.current.look, k);
      controls.update();
    }
    if (animTarget.current.t <= 0) animTarget.current = null;
  });

  useEffect(() => {
    const dolly = (factor: number) => {
      if (!controls) return;
      const dir = camera.position.clone().sub(controls.target);
      const dist = dir.length();
      const next = THREE.MathUtils.clamp(
        dist * factor,
        controls.minDistance,
        controls.maxDistance,
      );
      dir.setLength(next);
      animTarget.current = {
        pos: controls.target.clone().add(dir),
        look: controls.target.clone(),
        t: 0.4,
      };
    };

    registerActions({
      zoomIn: () => dolly(0.7),
      zoomOut: () => dolly(1.4),
      reset: () => {
        animTarget.current = {
          pos: defaultPos.clone(),
          look: new THREE.Vector3(0, 0, 0),
          t: 0.7,
        };
      },
      topDown: () => {
        const span = Math.max(
          plan?.lot.width ?? 80,
          plan?.lot.depth ?? 80,
          40,
        );
        animTarget.current = {
          // Tiny offset so OrbitControls doesn't gimbal-lock at the exact pole.
          pos: new THREE.Vector3(0.01, span * 1.6, 0.01),
          look: new THREE.Vector3(0, 0, 0),
          t: 0.7,
        };
      },
      isometric: () => {
        const span = Math.max(
          plan?.lot.width ?? 80,
          plan?.lot.depth ?? 80,
          40,
        );
        const d = span * 1.2;
        animTarget.current = {
          pos: new THREE.Vector3(d, d, d),
          look: new THREE.Vector3(0, 0, 0),
          t: 0.7,
        };
      },
      screenshot: () => {
        gl.render(scene, camera);
        const url = gl.domElement.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = url;
        a.download = `siteplan-${Date.now()}.png`;
        a.click();
      },
    });
  }, [registerActions, camera, controls, gl, scene, defaultPos, plan]);

  return null;
}
