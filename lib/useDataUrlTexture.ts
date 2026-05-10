"use client";
import { useEffect, useState } from "react";
import * as THREE from "three";

// Loads a base64 data URL into a THREE.Texture. Returns null while no URL is
// supplied or the texture is still decoding. The texture is configured for
// orthographic display of a floor-plan image — sRGB colorspace, mip chain
// disabled (the image is already large), high-quality filtering.
export function useDataUrlTexture(dataUrl: string | undefined) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!dataUrl) {
      setTexture(null);
      return;
    }
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.load(
      dataUrl,
      (tex) => {
        if (cancelled) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        setTexture(tex);
      },
      undefined,
      () => {
        if (!cancelled) setTexture(null);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [dataUrl]);

  // Dispose old texture when the URL changes or the component unmounts.
  useEffect(() => {
    return () => {
      texture?.dispose();
    };
  }, [texture]);

  return texture;
}
