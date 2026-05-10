"use client";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { useStore } from "@/lib/store";

const Hammer3D = dynamic(() => import("./Hammer3D"), { ssr: false });

const SIZE = 384;
const CENTER_SCALE = 320 / SIZE;
const SIDEBAR_SCALE = 1;

type Slot = "center" | "sidebar" | "hidden";

export default function FloatingHammer() {
  const loading = useStore((s) => s.loading);
  const running = useStore((s) => s.running);
  const pathname = usePathname();

  const [vw, setVw] = useState(0);
  const [vh, setVh] = useState(0);

  useEffect(() => {
    const update = () => {
      setVw((prev) =>
        prev !== window.innerWidth ? window.innerWidth : prev,
      );
      setVh((prev) =>
        prev !== window.innerHeight ? window.innerHeight : prev,
      );
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const slot: Slot = useMemo(() => {
    if (loading || running) return "center";
    if (pathname?.startsWith("/plan")) return "sidebar";
    return "hidden";
  }, [loading, running, pathname]);

  const { centerX, centerY } = useMemo(
    () => ({
      centerX: vw / 2 - (SIZE * CENTER_SCALE) / 2,
      centerY: vh / 2 - (SIZE * CENTER_SCALE) / 2,
    }),
    [vw, vh],
  );

  const target = useMemo(() => {
    switch (slot) {
      case "center":
        return { x: centerX, y: centerY, scale: CENTER_SCALE, opacity: 1 };
      case "sidebar":
        return { x: 24, y: 64, scale: SIDEBAR_SCALE, opacity: 1 };
      case "hidden":
      default:
        return { x: centerX, y: centerY, scale: CENTER_SCALE, opacity: 0 };
    }
  }, [slot, centerX, centerY]);

  if (vw === 0) return null;

  return (
    <motion.div
      className="fixed pointer-events-none z-[90]"
      style={{
        top: 0,
        left: 0,
        width: SIZE,
        height: SIZE,
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
        isLoading={loading || running}
        subtle={slot === "sidebar"}
        interactive={slot === "sidebar"}
      />
    </motion.div>
  );
}
