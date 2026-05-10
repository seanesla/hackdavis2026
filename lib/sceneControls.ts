// Module-level bridge between R3F's <Canvas> (where the OrbitControls live)
// and React UI rendered outside the canvas (the floating toolbar). The
// canvas registers its camera + controls here on mount; the toolbar reads
// `isReady` to enable its buttons and calls the helpers to drive them.

import * as THREE from "three";

type OrbitLike = {
  target: THREE.Vector3;
  minDistance: number;
  maxDistance: number;
  update: () => void;
};

let cameraRef: THREE.PerspectiveCamera | null = null;
let controlsRef: OrbitLike | null = null;
let glRef: THREE.WebGLRenderer | null = null;
let sceneRef: THREE.Scene | null = null;
const readyListeners = new Set<() => void>();

export function registerScene(
  camera: THREE.PerspectiveCamera,
  controls: OrbitLike,
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
): void {
  cameraRef = camera;
  controlsRef = controls;
  glRef = gl;
  sceneRef = scene;
  readyListeners.forEach((fn) => fn());
}

export function unregisterScene(): void {
  cameraRef = null;
  controlsRef = null;
  glRef = null;
  sceneRef = null;
  readyListeners.forEach((fn) => fn());
}

export function isSceneReady(): boolean {
  return !!cameraRef && !!controlsRef;
}

export function subscribeReady(fn: () => void): () => void {
  readyListeners.add(fn);
  return () => {
    readyListeners.delete(fn);
  };
}

// Dolly along the camera→target axis without leaving OrbitControls' min/max
// distance band. Step uses a multiplicative factor so each click feels the
// same regardless of current zoom level.
function dollyBy(factor: number): void {
  if (!cameraRef || !controlsRef) return;
  const offset = cameraRef.position.clone().sub(controlsRef.target);
  const dist = offset.length();
  if (dist === 0) return;
  const next = Math.max(
    controlsRef.minDistance,
    Math.min(controlsRef.maxDistance, dist * factor),
  );
  offset.setLength(next);
  cameraRef.position.copy(controlsRef.target).add(offset);
  controlsRef.update();
}

export function zoomIn(): void {
  dollyBy(1 / 1.25);
}

export function zoomOut(): void {
  dollyBy(1.25);
}

// Render-on-demand to PNG. Avoids needing `preserveDrawingBuffer: true` on
// the renderer (which carries a perf cost on every frame); instead we force
// a single render right before reading the buffer, while it's still valid.
export function takeScreenshot(filename = "siteplan.png"): boolean {
  if (!glRef || !sceneRef || !cameraRef) return false;
  glRef.render(sceneRef, cameraRef);
  const url = glRef.domElement.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return true;
}

