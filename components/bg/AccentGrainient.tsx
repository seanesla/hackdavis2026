"use client";
import { useAccent } from "@/lib/accent";
import Grainient from "./Grainient";

const toHex = (r: number, g: number, b: number) => {
  const h = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n * 255)))
      .toString(16)
      .padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
};

export default function AccentGrainient() {
  const accent = useAccent((s) => s.accent);
  const [r, g, b] = accent.rgb;
  const bright = toHex(r * 0.55, g * 0.55, b * 0.55);
  const mid = toHex(r * 0.18 + 0.03, g * 0.18 + 0.03, b * 0.18 + 0.03);
  const dark = "#0b0b0c";

  return (
    <div className="fixed inset-0 -z-10 pointer-events-none">
      <Grainient
        color1={bright}
        color2={mid}
        color3={dark}
        timeSpeed={0.2}
        warpStrength={1.0}
        warpAmplitude={60}
        blendSoftness={0.1}
        contrast={1.1}
        gamma={1.0}
        saturation={0.85}
        zoom={1.1}
        grainAmount={0.08}
      />
      <div className="absolute inset-0 bg-ink/55" />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 0%, rgba(11,11,12,0.55) 80%)",
        }}
      />
    </div>
  );
}
