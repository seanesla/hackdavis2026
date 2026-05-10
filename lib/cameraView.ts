"use client";
import { create } from "zustand";

// HUD-side camera state. Updated every frame from inside the R3F canvas
// by CameraBroadcaster; consumed by 2D overlays (NorthArrow, ScaleBar,
// TitleBlock).
type CameraView = {
  northAngle: number;   // radians, screen-space rotation for the N arrow
  distance: number;     // camera distance from orbit target, in feet
  fov: number;          // perspective fov in degrees
  canvasHeight: number; // canvas pixel height — used to convert ft → px
  setView: (v: Partial<Omit<CameraView, "setView">>) => void;
};

// Initial canvasHeight is a stable placeholder (NOT window.innerHeight) so
// SSR and the first client render compute the same px-per-foot conversion
// — otherwise the ScaleBar's SVG `width` attribute diverges between server
// and client, throwing a React hydration mismatch. The first frame inside
// the R3F canvas updates this with the real `size.height` (see Scene.tsx),
// so the placeholder lives only for one render cycle on the client.
export const useCameraView = create<CameraView>((set) => ({
  northAngle: 0,
  distance: 200,
  fov: 38,
  canvasHeight: 900,
  setView: (v) => set(v),
}));
