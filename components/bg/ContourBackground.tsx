"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { useRef, useMemo } from "react";
import * as THREE from "three";
import { useAccent } from "@/lib/accent";

const vert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const frag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uRes;
  uniform vec3 uAccent;

  // hash-based noise
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i + vec2(0.0,0.0)), hash(i + vec2(1.0,0.0)), u.x),
      mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x),
      u.y
    );
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.0;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = vUv;
    vec2 p = uv * vec2(uRes.x / uRes.y, 1.0) * 2.0;
    p += vec2(uTime * 0.012, uTime * 0.006);

    float h = fbm(p * 1.4);
    // Concentric contour bands: extract contour lines from height field
    float bands = abs(fract(h * 9.0) - 0.5);
    float lines = smoothstep(0.02, 0.0, bands);

    vec3 ink = vec3(0.043, 0.043, 0.047);
    vec3 col = mix(ink, uAccent * 0.35, lines * 0.35);

    // subtle vignette
    float vig = smoothstep(1.2, 0.3, length(vUv - 0.5));
    col *= mix(0.7, 1.0, vig);

    gl_FragColor = vec4(col, 1.0);
  }
`;

function ContourPlane() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const accent = useAccent((s) => s.accent);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uAccent: { value: new THREE.Vector3(...accent.rgb) },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useFrame((state) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = state.clock.elapsedTime;
      const { width, height } = state.size;
      matRef.current.uniforms.uRes.value.set(width, height);
      matRef.current.uniforms.uAccent.value.set(
        accent.rgb[0],
        accent.rgb[1],
        accent.rgb[2]
      );
    }
  });

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={vert}
        fragmentShader={frag}
        uniforms={uniforms}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}

export default function ContourBackground() {
  return (
    <div className="fixed inset-0 -z-10 pointer-events-none">
      <Canvas
        orthographic
        dpr={[1, 1.5]}
        gl={{ antialias: false, alpha: false }}
        camera={{ position: [0, 0, 1] }}
      >
        <ContourPlane />
      </Canvas>
    </div>
  );
}
