"use client";
import { useEffect } from "react";
import { useAccent } from "@/lib/accent";

export default function AccentApplier() {
  const accent = useAccent((s) => s.accent);
  useEffect(() => {
    document.documentElement.style.setProperty("--color-accent", accent.hex);
    document.documentElement.style.setProperty(
      "--color-accent-soft",
      accent.soft
    );
  }, [accent]);
  return null;
}
