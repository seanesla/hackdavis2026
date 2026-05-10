"use client";
import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  type RefObject,
} from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Center, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { useAccent } from "@/lib/accent";

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInQuad = (t: number) => t * t;
const easeInCubic = (t: number) => t * t * t;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

// Spinner lock-on angle for the forging strike. The X-axis swing only reads
// as a "swing" if the head is OFF the X axis — at rotation.y=0 the head sits
// on the rotation axis and barely moves. -π/4 puts the head at a 3/4 view
// (front-right) so the strike arcs visibly down-and-back, and the directional
// key light (top-front-right) hits the head face for clean contrast.
const FORGING_TARGET_Y = -Math.PI / 4;

// Soft glow halo: stacked inverted hulls. Each hull pushes verts outward
// along the normal by a different distance and is rendered backside-only
// with additive blending. The accumulation of low-alpha layers reads as a
// blurred glow tracing the hammer's silhouette, not a hard outline.
const GLOW_VERT = /* glsl */ `
  uniform float uThickness;
  void main() {
    vec3 displaced = position + normal * uThickness;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const GLOW_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uAlpha;
  void main() {
    gl_FragColor = vec4(uColor * uAlpha, uAlpha);
  }
`;

// Innermost (closest to the mesh) → outermost. Thickness is a multiple of
// the GLB's local maxDim so the glow's world-space size is consistent;
// alpha falls off so the layers fade outward like a real soft halo.
const GLOW_LAYERS = [
  { thicknessFactor: 0.010, alpha: 0.55 },
  { thicknessFactor: 0.022, alpha: 0.30 },
  { thicknessFactor: 0.040, alpha: 0.15 },
  { thicknessFactor: 0.065, alpha: 0.06 },
];

function makeGlowMaterial(thickness: number, alpha: number, hex: string) {
  return new THREE.ShaderMaterial({
    vertexShader: GLOW_VERT,
    fragmentShader: GLOW_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    transparent: true,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uThickness: { value: thickness },
      uAlpha: { value: alpha },
      uColor: { value: new THREE.Color(hex) },
    },
  });
}

type HammerProps = {
  isLoading: boolean;
  forging: boolean;
  interactive: boolean;
  subtle: boolean;
  lightRef: RefObject<THREE.PointLight | null>;
};

function Hammer({ isLoading, forging, interactive, subtle, lightRef }: HammerProps) {
  const lift = useRef<THREE.Group>(null);
  const strike = useRef<THREE.Group>(null);
  const spinner = useRef<THREE.Group>(null);
  const drift = useRef<THREE.Group>(null);

  const reduced = useRef(false);
  const hovered = useRef(false);
  const submitStart = useRef<number | null>(null);
  const baseSpin = subtle ? 0.002 : 0.005;
  const spinVel = useRef(baseSpin);

  const accent = useAccent((s) => s.accent.hex);
  const glowMatsRef = useRef<THREE.ShaderMaterial[] | null>(null);

  const { scene } = useGLTF("/models/hammer.glb");

  const { centeredScene, scale } = useMemo(() => {
    const cloned = scene.clone(true);
    cloned.updateMatrixWorld(true);

    // Don't center the cloned scene's position manually — drei's <Center>
    // wrapper does that at render time using the precise bbox of the model
    // as it actually appears in the scene graph (after our outline children
    // have been attached). That avoids the off-by-N issues that came from
    // computing centroid vs bbox in different ways and getting them slightly
    // out of sync with the visible silhouette.
    const box = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;

    // Build / reuse one ShaderMaterial per glow layer. Local thicknesses are
    // scaled with maxDim so world-space glow size is stable regardless of
    // GLB units (the spinner group's 2.6/maxDim scale cancels the maxDim).
    if (!glowMatsRef.current) {
      glowMatsRef.current = GLOW_LAYERS.map((l) =>
        makeGlowMaterial(maxDim * l.thicknessFactor, l.alpha, accent),
      );
    } else {
      glowMatsRef.current.forEach((m, i) => {
        m.uniforms.uThickness.value = maxDim * GLOW_LAYERS[i].thicknessFactor;
        m.uniforms.uAlpha.value = GLOW_LAYERS[i].alpha;
      });
    }
    const glowMats = glowMatsRef.current;

    // Attach one glow hull per layer to every visible mesh. Collect meshes
    // first and attach AFTER the traversal — adding meshes mid-traverse
    // would make traverse visit them recursively forever.
    const meshes: THREE.Mesh[] = [];
    cloned.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && !mesh.userData.isGlow) meshes.push(mesh);
    });
    for (const mesh of meshes) {
      // Render outermost hull first so additive layers stack from dim → bright.
      for (let i = glowMats.length - 1; i >= 0; i--) {
        const hull = new THREE.Mesh(mesh.geometry, glowMats[i]);
        hull.userData.isGlow = true;
        hull.renderOrder = -1;
        mesh.add(hull);
      }
    }

    // Scale tuned for the 400×260 sidebar slot — fills ~88% of the (shorter)
    // vertical axis so the hammer feels prominent in the wider-than-tall
    // canvas instead of being a small silhouette with empty side margins.
    return { centeredScene: cloned, scale: 2.9 / maxDim };
  }, [scene, accent]);

  // Keep the glow color tracking the accent picker live without rebuilding
  // the scene.
  useEffect(() => {
    if (!glowMatsRef.current) return;
    for (const m of glowMatsRef.current) {
      m.uniforms.uColor.value.set(accent);
    }
  }, [accent]);

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
      // The inner reorient was removed so the GLB sits with its handle along
      // world +Y (head at top, claw at bottom — the GLB's natural pose).
      // Rotating strike around its X axis swings the head through the YZ
      // plane: up → forward → down. That's a real hammer slam — no sideways
      // arc, no barrel-roll, head goes from top of screen toward the camera
      // and continues to bottom of screen.
      let targetX = 0;

      if (forging && !reduced.current) {
        // Realistic hammer dynamics: anticipation lean-back → fast accelerating
        // strike → recoil bounce off the work → slow recovery to neutral.
        // Asymmetric phase weights make the impact moment feel like an impact
        // instead of a sine wave: most of the cycle is the slow recovery so
        // each strike reads as a deliberate, weighted blow.
        const cycle = (t * 1.4) % 1;
        const raised = 0.15; // neutral pose
        const peak = -0.30; // wind-up apex (head leaned BACK / up)
        const struck = 1.10; // strike apex (head fully down)
        const recoil = 0.55; // bounce-off position after impact

        if (cycle < 0.20) {
          // 0-20% — wind-up: slow lean back. easeIn so it accelerates as it
          // reaches the apex, telegraphing the incoming strike.
          targetX = lerp(raised, peak, easeInQuad(cycle / 0.20));
        } else if (cycle < 0.32) {
          // 20-32% — STRIKE: fast accelerating downward swing. easeInCubic
          // so the head whips through the bottom of the arc.
          targetX = lerp(peak, struck, easeInCubic((cycle - 0.20) / 0.12));
        } else if (cycle < 0.45) {
          // 32-45% — recoil: quick bounce off the work. easeOut so the
          // bounce is sharp at impact and decays.
          targetX = lerp(struck, recoil, easeOutCubic((cycle - 0.32) / 0.13));
        } else {
          // 45-100% — recovery: slow settle back to neutral, ready for the
          // next swing. Long phase so the strike feels weighted, not frantic.
          targetX = lerp(recoil, raised, easeOutCubic((cycle - 0.45) / 0.55));
        }
      }
      // No submit/draft tilt animation. The hammer stays at the rest pose
      // (head straight up) during loading, navigation, and the fly into
      // the sidebar. Forward tilt only happens once forging starts (which
      // FloatingHammer gates by `settled` — i.e., once the fly animation
      // is fully complete), so nothing reads as "hitting" before then.

      // Clear the leftover Z rotation from the previous fix so it doesn't
      // hold the hammer at a tilted rest pose.
      strike.current.rotation.z = 0;
      // Higher damping during forging so the strike accel/recoil shape
      // actually reads — more damping would smear the impact moment into
      // a smooth sine wave again.
      const k = forging ? 0.45 : 0.18;
      strike.current.rotation.x = lerp(strike.current.rotation.x, targetX, k);
    }

    const peakSpin = subtle ? 0.04 : 0.06;
    let targetSpin = baseSpin;
    if (submitting && submitElapsed >= 0.35 && !reduced.current && !forging) {
      const ramp = clamp01((submitElapsed - 0.35) / 0.4);
      targetSpin = lerp(baseSpin, peakSpin, easeOutCubic(ramp));
    }
    spinVel.current = lerp(spinVel.current, targetSpin, 0.1);
    if (spinner.current) {
      if (forging && !reduced.current) {
        // Forging spin lock — when hammering, snap the head to FORGING_TARGET_Y
        // along the SHORTEST arc, so the strike is always seen from the same
        // 3/4 angle. Without this, the strike fires off at whatever random
        // accumulated rotation the idle spin happened to be at (often hiding
        // the head behind the handle).
        const cur = spinner.current.rotation.y;
        const TWO_PI = Math.PI * 2;
        const winds = Math.round((cur - FORGING_TARGET_Y) / TWO_PI);
        const target = FORGING_TARGET_Y + winds * TWO_PI;
        spinner.current.rotation.y = lerp(cur, target, 0.18);
      } else if (!reduced.current) {
        // Continuous Y spin for both idle and the waiting / "planning…"
        // state. spinVel ramps up to peakSpin while submitting (computed
        // above) so the rotation visibly accelerates while the agent is
        // working, then settles back to baseSpin when idle.
        spinner.current.rotation.y += spinVel.current * dt60;
      }
    }

    if (drift.current) {
      const bobAmp = subtle ? 0.02 : 0.06;
      const tiltAmp = subtle ? 0.015 : 0.04;
      const bobActive = !reduced.current && !submitting && !forging;
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
      const target =
        submitting || forging ? loading : hovered.current ? hover : idle;
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
        <group ref={spinner} scale={scale}>
          <group ref={strike}>
            {/* The GLB ships with the handle along world X with the head at
                its -X end. Rotating -π/2 around Z lifts the head to +Y, so
                the hammer stands up at rest with the head at the top.
                Strike then rotates around X, swinging the head through the
                YZ plane — a clean forward chop, no sideways arc. drei's
                <Center> centers the bbox on origin so the pivot is the
                hammer's geometric center. */}
            <group rotation={[0, 0, -Math.PI / 2]}>
              <Center precise>
                <primitive object={centeredScene} />
              </Center>
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
  forging?: boolean;
  interactive?: boolean;
  subtle?: boolean;
  className?: string;
};

export default function Hammer3D({
  isLoading = false,
  forging = false,
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
            forging={forging}
            interactive={interactive}
            subtle={subtle}
            lightRef={lightRef}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
