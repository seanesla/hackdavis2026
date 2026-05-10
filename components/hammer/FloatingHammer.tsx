"use client";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { useStore } from "@/lib/store";

const Hammer3D = dynamic(() => import("./Hammer3D"), { ssr: false });

// Hammer in center pose is shown a little smaller than its natural size so
// it doesn't dominate the landing page; the GPU transform handles the visual
// shrink while the underlying R3F canvas stays at slot dimensions (no resize
// thrash, fire planes stay frustum-fit).
const CENTER_SCALE = 0.83;
const SIDEBAR_SCALE = 1;

// Used while the sidebar compartment hasn't mounted yet (e.g. on the landing
// page, or the first frame after navigating to /plan). Matches the
// `h-[260px]` div in `components/plan/SideRail.tsx` so the canvas size is
// stable across slots.
const FALLBACK_W = 400;
const FALLBACK_H = 260;

// Horizontal nudge applied to the center pose on /plan, so the drafting
// hammer reads as centered within the *visible scene area* (right of the
// SideRail) instead of within the whole viewport. The SideRail occupies
// `left-4 w-[400px]` = 16+400 = 416px on the left; half that is 208.
const PLAN_CENTER_NUDGE_X = 208;

type Slot = "center" | "sidebar" | "hidden";

type Rect = { x: number; y: number; w: number; h: number };

export default function FloatingHammer() {
  const loading = useStore((s) => s.loading);
  const running = useStore((s) => s.running);
  const plan = useStore((s) => s.plan);
  const pathname = usePathname();

  const waiting = (loading || running) && plan === null;
  const forging = running && plan !== null;

  const [vw, setVw] = useState(0);
  const [vh, setVh] = useState(0);
  const [slotRect, setSlotRect] = useState<Rect>({
    x: 0,
    y: 0,
    w: FALLBACK_W,
    h: FALLBACK_H,
  });

  useEffect(() => {
    const updateViewport = () => {
      setVw(window.innerWidth);
      setVh(window.innerHeight);
    };
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  // Track the SideRail's hammer compartment. The SideRail slides in over
  // 600ms via a CSS transform, which moves the slot's screen position every
  // frame without firing any layout/resize events — so we poll on rAF for
  // the first second to follow it, then stop. ResizeObserver wouldn't help
  // here because transforms don't change the layout box.
  // When we leave /plan, reset slotRect to the fallback so the centered
  // hammer always returns to the exact same spot regardless of what the
  // sidebar last measured. Otherwise centerX = (vw - slotRect.w * scale)/2
  // would drift between visits as the sidebar's measured width changes.
  useEffect(() => {
    if (!pathname?.startsWith("/plan")) {
      setSlotRect({ x: 0, y: 0, w: FALLBACK_W, h: FALLBACK_H });
      return;
    }

    const measure = () => {
      const el = document.getElementById("hammer-slot");
      if (!el) return;
      const r = el.getBoundingClientRect();
      setSlotRect((prev) =>
        prev.x === r.left && prev.y === r.top &&
        prev.w === r.width && prev.h === r.height
          ? prev
          : { x: r.left, y: r.top, w: r.width, h: r.height },
      );
    };

    const startTime = performance.now();
    let rafId = 0;
    const pollFrame = () => {
      measure();
      if (performance.now() - startTime < 1000) {
        rafId = requestAnimationFrame(pollFrame);
      }
    };
    rafId = requestAnimationFrame(pollFrame);

    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", measure);
    };
  }, [pathname]);

  const slot: Slot = useMemo(() => {
    if (waiting) return "center";
    if (pathname?.startsWith("/plan")) return "sidebar";
    return "hidden";
  }, [waiting, pathname]);

  const onPlan = pathname?.startsWith("/plan") ?? false;

  const { centerX, centerY } = useMemo(
    () => ({
      centerX:
        (vw - slotRect.w * CENTER_SCALE) / 2 +
        (onPlan ? PLAN_CENTER_NUDGE_X : 0),
      centerY: (vh - slotRect.h * CENTER_SCALE) / 2,
    }),
    [vw, vh, slotRect.w, slotRect.h, onPlan],
  );

  const target = useMemo(() => {
    switch (slot) {
      case "center":
        return { x: centerX, y: centerY, scale: CENTER_SCALE, opacity: 1 };
      case "sidebar":
        return {
          x: slotRect.x,
          y: slotRect.y,
          scale: SIDEBAR_SCALE,
          opacity: 1,
        };
      case "hidden":
      default:
        return { x: centerX, y: centerY, scale: CENTER_SCALE, opacity: 0 };
    }
  }, [slot, centerX, centerY, slotRect.x, slotRect.y]);

  if (vw === 0) return null;

  // r3f's <canvas> defaults to pointer-events: auto, which would block
  // clicks underneath the floating hammer (the parent's pointer-events:
  // none doesn't propagate, since pointer-events isn't inherited). Force
  // it off unless the hammer is in interactive sidebar mode.
  const canvasInteractive = slot === "sidebar";

  return (
    <motion.div
      className={`fixed pointer-events-none z-[90] [&_canvas]:!w-full [&_canvas]:!h-full ${
        canvasInteractive ? "" : "[&_*]:!pointer-events-none"
      }`}
      style={{
        top: 0,
        left: 0,
        width: slotRect.w,
        height: slotRect.h,
        transformOrigin: "top left",
      }}
      initial={{
        x: centerX,
        y: -(vh * 1.1),
        scale: CENTER_SCALE,
        opacity: 0,
        rotate: -10,
      }}
      animate={{
        x: target.x,
        y: target.y,
        scale: target.scale,
        opacity: target.opacity,
        rotate: 0,
      }}
      transition={{
        x: { type: "tween", duration: 0.75, ease: [0.22, 1, 0.36, 1] },
        y: { type: "tween", duration: 0.75, ease: [0.22, 1, 0.36, 1] },
        scale: { type: "tween", duration: 0.75, ease: [0.22, 1, 0.36, 1] },
        opacity: { duration: 0.4 },
        rotate: { type: "tween", duration: 0.75, ease: [0.22, 1, 0.36, 1] },
      }}
    >
      <Hammer3D
        isLoading={waiting}
        forging={forging}
        subtle={slot === "sidebar"}
        interactive={slot === "sidebar"}
      />
    </motion.div>
  );
}
