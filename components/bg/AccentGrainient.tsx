"use client";
import { useAccent } from "@/lib/accent";
import Grainient from "./Grainient";

// HSL helpers so we can derive vivid complementary shades from a single accent.
const hexToHsl = (hex: string): [number, number, number] => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return [0, 0, 0];
  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h * 360, s, l];
};

const hslToHex = (h: number, s: number, l: number): string => {
  h = ((h % 360) + 360) % 360 / 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (n: number) =>
    Math.round(n * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

export default function AccentGrainient({ subtle = false }: { subtle?: boolean }) {
  const accent = useAccent((s) => s.accent);
  const [h, s] = hexToHsl(accent.hex);

  // Three vivid, hue-related shades — like the original demo's pink/violet/lavender,
  // but rooted in the user's accent so switching the picker changes the whole mood.
  const color1 = hslToHex(
    h + 15,
    subtle ? Math.max(0, s - 0.1) : Math.min(1, s + 0.1),
    subtle ? 0.55 : 0.72,
  );
  const color2 = hslToHex(
    h - 35,
    subtle ? Math.max(0, s - 0.05) : Math.min(1, s + 0.05),
    subtle ? 0.35 : 0.42,
  );
  const color3 = hslToHex(
    h + 30,
    subtle ? Math.max(0, s - 0.1) : Math.min(1, s + 0.05),
    subtle ? 0.48 : 0.62,
  );

  return (
    <div className="fixed inset-0 -z-10 pointer-events-none">
      <Grainient
        color1={color1}
        color2={color2}
        color3={color3}
        timeSpeed={subtle ? 0.15 : 0.25}
        warpStrength={subtle ? 0.8 : 1.0}
        warpAmplitude={subtle ? 40 : 50}
        blendSoftness={0.05}
        contrast={subtle ? 1.3 : 1.5}
        gamma={1.0}
        saturation={subtle ? 0.85 : 1.0}
        zoom={0.9}
        grainAmount={0.1}
      />
      <div
        className="absolute inset-0"
        style={{
          background: subtle
            ? "radial-gradient(ellipse 75% 55% at 50% 30%, rgba(11,11,12,0.15) 0%, rgba(11,11,12,0.4) 55%, rgba(11,11,12,0.75) 100%)"
            : "radial-gradient(ellipse 75% 55% at 50% 30%, rgba(11,11,12,0.0) 0%, rgba(11,11,12,0.25) 55%, rgba(11,11,12,0.65) 100%)",
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-[55%]"
        style={{
          background:
            "linear-gradient(to bottom, rgba(11,11,12,0.0) 0%, rgba(11,11,12,0.55) 60%, rgba(11,11,12,0.85) 100%)",
        }}
      />
    </div>
  );
}
