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

export const useCameraView = create<CameraView>((set) => ({
  northAngle: 0,
  distance: 200,
  fov: 38,
  canvasHeight: typeof window !== "undefined" ? window.innerHeight : 900,
  setView: (v) => set(v),
}));
