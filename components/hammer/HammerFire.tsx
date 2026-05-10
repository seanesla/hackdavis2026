"use client";
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// FBM-noise driven flame shader. The "volumetric" feel comes from:
// - Two layered planes at different z depths with different noise speeds
//   (see Fire below — this material is used for both, with uOffset / uSpeed
//   shifting the plume so the eye reads parallax).
// - Vertical domain warp (UV swirl) that drags noise upward, creating
//   licking flame tongues.
// - Hot-core to accent to fade color ramp on the noise value, so brighter
//   regions punch through as the "front" of the volume.
const FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uIntensity;
  uniform float uSpeed;
  uniform float uScale;
  uniform float uOffset;
  uniform vec3 uAccent;
  uniform vec3 uHot;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * vnoise(p);
      p *= 2.02;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = vUv;
    float t = uTime * uSpeed;

    // Domain warp: drag the noise upward over time + horizontal sway.
    vec2 p = vec2((uv.x - 0.5) * 2.0, uv.y) * uScale;
    p.y -= t * 1.6;
    p.x += sin(uv.y * 5.0 + t * 0.7 + uOffset) * 0.35;

    float n = fbm(p + uOffset);
    n = smoothstep(0.22, 0.92, n);

    // Full-compartment fill with a radial center bias. The 5% soft edge
    // keeps the flame from getting hard-cut at the canvas border; the
    // center bias pins the flame's bright core to the middle of the
    // compartment so it always reads as centered on the hammer instead of
    // drifting wherever the noise happens to be loudest.
    float edgeFalloff = 0.05;
    float xMask = smoothstep(0.0, edgeFalloff, uv.x) *
                  (1.0 - smoothstep(1.0 - edgeFalloff, 1.0, uv.x));
    float yMask = smoothstep(0.0, edgeFalloff, uv.y) *
                  (1.0 - smoothstep(1.0 - edgeFalloff, 1.0, uv.y));
    float distFromCenter = length(uv - vec2(0.5, 0.5));
    float centerCore     = 1.0 - smoothstep(0.10, 0.65, distFromCenter);
    float centerBias     = mix(0.35, 1.25, centerCore);
    // Slow secondary noise breaks the silhouette into flame tongues so the
    // edges don't read as a clean rectangle.
    float edge = 0.55 + 0.45 * fbm(uv * 4.0 + vec2(uOffset, -t * 0.4));
    float mask = xMask * yMask * edge * centerBias;

    float flame = n * mask;

    // Color ramp: deep accent at edges → accent core → hot near the base.
    vec3 col = mix(uAccent * 0.45, uAccent, smoothstep(0.0, 0.55, flame));
    col      = mix(col, uHot,       smoothstep(0.55, 0.95, flame));

    float alpha = flame * uIntensity;
    // Premultiply so additive blending reads the brightness, not the alpha.
    gl_FragColor = vec4(col * alpha, alpha);
  }
`;

type Props = {
  /** Whether the fire should be visible. Internally lerped for a soft fade. */
  active: boolean;
  /** Accent color hex (CSS) for the outer flame. */
  accent: string;
};

function flamePlane(z: number, speed: number, scale: number, offset: number) {
  return { z, speed, scale, offset };
}

export default function HammerFire({ active, accent }: Props) {
  const accentColor = useMemo(() => new THREE.Color(accent), [accent]);
  const hotColor = useMemo(() => new THREE.Color("#fff5d8"), []);

  // Two layered planes at different depths with offset noise — parallax sells
  // the volume. Front plane is the hot crisp flames; back plane is a slower,
  // softer haze so the fire reads big without losing detail.
  const planes = useMemo(
    () => [
      flamePlane(-1.4, 1.0, 1.6, 0.0),
      flamePlane(-2.4, 0.6, 2.6, 13.7),
    ],
    [],
  );

  const refs = useRef<Array<THREE.ShaderMaterial | null>>([]);
  const meshRefs = useRef<Array<THREE.Mesh | null>>([]);
  const intensity = useRef(0);

  // Frustum-fit each plane so it perfectly covers the visible canvas at its
  // own Z depth — no pixel of the compartment is left empty, no flame is
  // wasted off-screen. We do this every frame because the canvas can resize
  // (window resize, slot rect change). It's two scalars per plane; cheap.
  useFrame(({ clock, camera, size }) => {
    const t = clock.elapsedTime;
    const target = active ? 1 : 0;
    intensity.current = intensity.current + (target - intensity.current) * 0.06;

    const persp = camera as THREE.PerspectiveCamera;
    const fovRad = (persp.fov * Math.PI) / 180;
    const aspect = size.width / Math.max(1, size.height);

    refs.current.forEach((m, i) => {
      if (!m) return;
      m.uniforms.uTime.value = t;
      m.uniforms.uIntensity.value = intensity.current;
      m.uniforms.uAccent.value = accentColor;
      m.uniforms.uSpeed.value = planes[i].speed;
      m.uniforms.uScale.value = planes[i].scale;
      m.uniforms.uOffset.value = planes[i].offset;
    });

    // Overscan slightly past the camera frustum so the shader's 5% UV soft
    // edge falloff lands OFF-canvas — the visible flame extends edge-to-edge
    // with no perceptible cropping at the compartment border.
    const OVERSCAN = 1.18;
    meshRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const distance = Math.abs(camera.position.z - planes[i].z);
      const visibleH = 2 * distance * Math.tan(fovRad / 2);
      const visibleW = visibleH * aspect;
      mesh.scale.set(visibleW * OVERSCAN, visibleH * OVERSCAN, 1);
    });
  });

  return (
    <group>
      {planes.map((p, i) => (
        <mesh
          key={i}
          ref={(mesh) => {
            meshRefs.current[i] = mesh;
          }}
          // y nudged down so the flame's visual center sits where the
          // hammer's visual mass sits (the head + upper handle), matching
          // the alignment from before the outline rework.
          position={[0, -0.1, p.z]}
          renderOrder={-1}
        >
          <planeGeometry args={[1, 1, 1, 1]} />
          <shaderMaterial
            ref={(m) => {
              refs.current[i] = m;
            }}
            vertexShader={VERT}
            fragmentShader={FRAG}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            uniforms={{
              uTime: { value: 0 },
              uIntensity: { value: 0 },
              uSpeed: { value: p.speed },
              uScale: { value: p.scale },
              uOffset: { value: p.offset },
              uAccent: { value: accentColor },
              uHot: { value: hotColor },
            }}
          />
        </mesh>
      ))}
    </group>
  );
}
