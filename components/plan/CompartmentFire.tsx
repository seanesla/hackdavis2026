"use client";
import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import HammerFire from "@/components/hammer/HammerFire";
import { useAccent } from "@/lib/accent";
import { useStore } from "@/lib/store";

// Approximate fly-in duration (ms) of the FloatingHammer arriving at the
// sidebar slot. Match the longest tween in FloatingHammer.tsx + a small
// buffer so the flame only appears after the hammer has visually settled.
const HAMMER_ARRIVAL_DELAY = 850;

/**
 * Sidebar-compartment flame. Lives inside the SideRail's hammer slot, so it
 * stays put no matter what the FloatingHammer is doing — the hammer flies
 * over from the center pose and arrives ON TOP of this fire (the floating
 * hammer is fixed-positioned at z-90; this canvas sits inside the sidebar
 * at z-10).
 *
 * Lights only while the agent is actively building (running && plan !== null)
 * — i.e., during the chop animation. Goes out the moment the plan finalizes,
 * matching the forging metaphor: heat during the hammering, not after.
 */
export default function CompartmentFire() {
  const running = useStore((s) => s.running);
  const plan = useStore((s) => s.plan);
  const accent = useAccent((s) => s.accent.hex);

  // Compute forging as a boolean OUTSIDE the effect. The store's `plan`
  // reference changes on every stage replay (every ~800ms), so depending on
  // `plan` directly would clear and restart the 850ms timer between every
  // stage — and the timer would never get to fire. The boolean only flips
  // when forging actually starts or stops, so the effect only re-runs then.
  const forging = running && plan !== null;

  const [active, setActive] = useState(false);

  useEffect(() => {
    if (forging) {
      // Wait for the hammer to finish flying into the sidebar before lighting
      // up — otherwise the fire flashes inside an empty compartment.
      const t = window.setTimeout(() => setActive(true), HAMMER_ARRIVAL_DELAY);
      return () => window.clearTimeout(t);
    }
    setActive(false);
  }, [forging]);

  return (
    <div className="absolute inset-0 pointer-events-none">
      <Canvas
        camera={{ position: [0, 0, 4.5], fov: 40 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <HammerFire active={active} accent={accent} />
      </Canvas>
    </div>
  );
}
