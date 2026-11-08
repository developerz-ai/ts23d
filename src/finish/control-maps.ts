// Control views as files an image model (ComfyUI / diffusers with ControlNet depth + normal) reads:
// per view depth.png (white = near, the ControlNet convention), normal.png (view space: R right,
// G up, B toward the camera), normal_world.png, part.png (a stable colour per part name, legend in
// legend.json), uv.png (atlas U → R, V → G), albedo.png (unlit base colour), beauty.png (when
// rendered); plus cameras.json. Byte-deterministic.

import { encodePng } from '../core/index.ts';
import type { ControlView, ControlViews } from './types.ts';

/** Stable '#rrggbb' per part name (FNV-1a), bumped on collision so the legend stays one-to-one. */
export function partColours(names: readonly string[]): string[] {
  const used = new Set<number>();
  return names.map((name) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 0x01000193) >>> 0;
    let c = (h & 0xffffff) | 0x404040; // never near-black: black is the background
    while (used.has(c)) c = ((c + 0x1f3d5b) & 0xffffff) | 0x404040;
    used.add(c);
    return `#${c.toString(16).padStart(6, '0')}`;
  });
}

const rgbaOf = (v: ControlView, px: (i: number, o: Uint8Array, at: number) => void): Uint8Array => {
  const out = new Uint8Array(v.width * v.height * 4);
  for (let i = 0; i < v.width * v.height; i++) {
    if ((v.part[i] ?? -1) < 0) continue;
    px(i, out, i * 4);
    out[i * 4 + 3] = 255;
  }
  return out;
};

const byte = (x: number): number => Math.max(0, Math.min(255, Math.round(x)));

function depthPng(v: ControlView): Uint8Array {
  let lo = Infinity;
  let hi = -Infinity;
  for (const d of v.depth)
    if (Number.isFinite(d)) {
      lo = Math.min(lo, d);
      hi = Math.max(hi, d);
    }
  const span = Math.max(hi - lo, 1e-6);
  return encodePng(
    v.width,
    v.height,
    rgbaOf(v, (i, o, at) => {
      const g = byte(255 - (((v.depth[i] ?? hi) - lo) / span) * 215);
      o.set([g, g, g], at);
    }),
  );
}

function normalPng(v: ControlView, view: boolean): Uint8Array {
  const { r, u, f } = v.camera;
  return encodePng(
    v.width,
    v.height,
    rgbaOf(v, (i, o, at) => {
      const n = [v.normal[i * 3] ?? 0, v.normal[i * 3 + 1] ?? 0, v.normal[i * 3 + 2] ?? 0];
      const dot = (a: readonly number[]): number =>
        (n[0] ?? 0) * (a[0] ?? 0) + (n[1] ?? 0) * (a[1] ?? 0) + (n[2] ?? 0) * (a[2] ?? 0);
      const c = view ? [dot(r), dot(u), -dot(f)] : n;
      o.set(
        c.map((x) => byte((x * 0.5 + 0.5) * 255)),
        at,
      );
    }),
  );
}

export interface ControlMaps {
  /** Relative path → bytes: `<view>/<map>.png`, `legend.json`, `cameras.json`. */
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly legend: Readonly<Record<string, string>>;
}

export function exportControlMaps(cv: ControlViews): ControlMaps {
  const colours = partColours(cv.parts);
  const rgb = colours.map((c) => [1, 3, 5].map((k) => Number.parseInt(c.slice(k, k + 2), 16)));
  const files = new Map<string, Uint8Array>();
  const text = (s: unknown): Uint8Array =>
    new TextEncoder().encode(`${JSON.stringify(s, null, 2)}\n`);
  for (const v of cv.views) {
    const at = (m: string): string => `${v.name}/${m}.png`;
    files.set(at('depth'), depthPng(v));
    files.set(at('normal'), normalPng(v, true));
    files.set(at('normal_world'), normalPng(v, false));
    files.set(
      at('part'),
      encodePng(
        v.width,
        v.height,
        rgbaOf(v, (i, o, a) => o.set(rgb[v.part[i] ?? 0] ?? [0, 0, 0], a)),
      ),
    );
    files.set(
      at('uv'),
      encodePng(
        v.width,
        v.height,
        rgbaOf(v, (i, o, a) => {
          const u = v.uv[i * 2] ?? -1;
          o.set(u < 0 ? [0, 0, 0] : [byte(u * 255), byte((v.uv[i * 2 + 1] ?? 0) * 255), 128], a);
        }),
      ),
    );
    files.set(at('albedo'), encodePng(v.width, v.height, v.albedo));
    if (v.beauty) files.set(at('beauty'), encodePng(v.width, v.height, v.beauty));
  }
  const legend = Object.fromEntries(cv.parts.map((p, i) => [p, colours[i] ?? '#000000']));
  files.set(
    'legend.json',
    text({
      asset: cv.asset,
      background: '#000000',
      parts: legend,
      finishable: cv.parts.filter((_, i) => cv.finishable[i]),
    }),
  );
  files.set(
    'cameras.json',
    text({
      hash: cv.hash,
      convention:
        'Z up, metres; screen = (cx + (d·r / d·f)·focal, cy − (d·u / d·f)·focal), d = p − eye',
      views: cv.views.map((v) => ({ name: v.name, azDeg: v.azDeg, elDeg: v.elDeg, ...v.camera })),
    }),
  );
  return { files, legend };
}
