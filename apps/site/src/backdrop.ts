// The studio backdrop as `scene.background`: a soft radial gradient (a lit cyclorama falling off
// to the edges), drawn once per look into a small canvas. Opaque, so ambient occlusion and the
// contact shadow land on it the way they would on a real sweep.

import { CanvasTexture, Color, LinearFilter, SRGBColorSpace, type Texture } from 'three';
import type { Look } from './look.ts';

const cache = new Map<string, Texture>();

/** ±1 LSB of hashed noise so an 8-bit gradient this smooth does not band into rings. */
function dither(g: CanvasRenderingContext2D, w: number, h: number): void {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
    x ^= x >>> 13;
    const n = ((x >>> 0) % 3) - 1;
    d[i] = (d[i] ?? 0) + n;
    d[i + 1] = (d[i + 1] ?? 0) + n;
    d[i + 2] = (d[i + 2] ?? 0) + n;
  }
  g.putImageData(img, 0, 0);
}

function mixHex(a: string, b: string, t: number): string {
  const ca = new Color(a);
  return `#${ca.lerp(new Color(b), t).getHexString()}`;
}

export function backdrop(look: Look): Texture {
  const [hi, lo] = look.backdrop;
  const key = `${hi}${lo}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 320;
  const g = canvas.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(256, 125, 10, 256, 140, 360);
    // Smoothstep falloff in eight stops: linear segments with one knee read as a ring.
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      grad.addColorStop(t, mixHex(hi, lo, t * t * (3 - 2 * t)));
    }
    g.fillStyle = grad;
    g.fillRect(0, 0, canvas.width, canvas.height);
    dither(g, canvas.width, canvas.height);
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearFilter;
  tex.generateMipmaps = false;
  cache.set(key, tex);
  return tex;
}
