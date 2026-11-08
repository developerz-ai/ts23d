// Bust skin: a sculpt meshed, with a hand-painted look driven by the field itself — the
// texture artist's curvature + occlusion bake, done per vertex: crevices darker and more
// saturated, convex ridges lifted and warmed (brow, cheekbone, knuckles of the face), warm tops,
// cool undersides, a low-frequency mottle so the green never reads as one digital flat, and fine
// skin irregularity (pores/bumps) displaced into the surface at LOD0.

import {
  type Field,
  type Mesh,
  type Rng,
  type SculptEdit,
  sculptField,
  sdf,
  valueNoise,
} from '@developerz.ai/ts23d';
import type { V } from './kit.ts';

const clamp = (v: number): number => Math.min(Math.max(v, 0), 1);
const mix = (a: V, b: V, t: number): V => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** The painter's skin palette: base, warm tops/ridges, cool undersides, crevice colour. */
export interface SkinTone {
  readonly skin: V;
  readonly warm: V;
  readonly cool: V;
  readonly cavity: V;
}

export interface SkinOptions {
  readonly rng: Rng;
  readonly tone: SkinTone;
  /** Skin bump amplitude, metres (0 = smooth). */
  readonly bumps?: number;
  /** Base colour of edits that give none. */
  readonly color?: V;
  /** Mirror the edits across y = 0 (default true). */
  readonly mirror?: boolean;
  /** Keep only where clip ≤ 0 (split one sculpt into parts at a hidden seam). */
  readonly clip?: Field;
  /** Mesh only inside this box (intersected with the edits' bounds): a split part's region. */
  readonly within?: readonly [V, V];
}

export function skinMesh(edits: readonly SculptEdit[], cell: number, o: SkinOptions): Mesh {
  const sym = o.mirror ?? true;
  const s = sculptField(edits, {
    color: o.color ?? o.tone.skin,
    ...(sym ? { mirror: 'y' as const } : {}),
  });
  const fine = valueNoise(o.rng.fork('pores'), { scale: 0.011, octaves: 2 });
  const mottle = valueNoise(o.rng.fork('mottle'), { scale: 0.045, octaves: 3 });
  const amp = o.bumps ?? 0;
  const T = o.tone;
  const q: [number, number, number] = [0, 0, 0];
  // Skin irregularity, symmetric (|y|) like the sculpt; the colour mottle is not.
  const clip = o.clip;
  const raw =
    amp > 0
      ? (p: V): number => {
          q[0] = p[0];
          q[1] = Math.abs(p[1]);
          q[2] = p[2];
          return s.field(p) + amp * fine(q);
        }
      : s.field;
  const field = clip ? (p: V): number => Math.max(raw(p), clip(p)) : raw;
  const e = 0.004;
  const reach = 0.02;
  const paint = (p: V): V => {
    const base = s.colorAt(p);
    const [x, y, z] = p;
    const f0 = raw(p);
    // Six axis samples give both the gradient (normal) and the Laplacian (mean curvature).
    const xp = raw([x + e, y, z]);
    const xm = raw([x - e, y, z]);
    const yp = raw([x, y + e, z]);
    const ym = raw([x, y - e, z]);
    const zp = raw([x, y, z + e]);
    const zm = raw([x, y, z - e]);
    const gx = xp - xm;
    const gy = yp - ym;
    const gz = zp - zm;
    const gl = Math.hypot(gx, gy, gz) || 1;
    const n: V = [gx / gl, gy / gl, gz / gl];
    // Mean curvature from the Laplacian: > 0 convex (ridges), < 0 concave (creases).
    const lap = (xp + xm + yp + ym + zp + zm - 6 * f0) / (e * e);
    const curv = Math.max(-1, Math.min(1, lap * 0.012));
    // Cavity: walk out along the normal; a crevice brings other surface closer than the walk.
    let occ = 0;
    for (let i = 1; i <= 3; i++) {
      const t = (reach * i) / 3;
      occ += Math.max(0, t - raw([x + n[0] * t, y + n[1] * t, z + n[2] * t])) / t / i;
    }
    const cav = clamp(occ * 1.6 + Math.max(0, -curv) * 0.6);
    // Skin-ness: only the skin takes the warm/cool/mottle painting (bone, paint keep theirs).
    const dSkin = Math.abs(base[0] - T.skin[0]) + Math.abs(base[1] - T.skin[1]);
    const isSkin = clamp(1 - dSkin * 12);
    let c = base;
    if (isSkin > 0) {
      const up = n[2];
      const warm = mix(c, T.warm, clamp(up * 0.55 + Math.max(0, curv) * 0.6) * isSkin);
      c = mix(warm, T.cool, clamp(-up * 0.6) * isSkin);
      const m = mottle(p);
      c = mix(c, m > 0 ? T.warm : T.cool, Math.abs(m) * 0.35 * isSkin);
    }
    // Crevices: darker, deeper olive; ridges catch a little light on everything.
    c = mix(c, mix(T.cavity, c, 0.35), cav * 0.75);
    const lift = 1 + Math.max(0, curv) * 0.18;
    return [clamp(c[0] * lift), clamp(c[1] * lift), clamp(c[2] * lift)];
  };
  return sdf({
    field,
    bounds: o.within
      ? [
          [
            Math.max(s.bounds[0][0], o.within[0][0]),
            Math.max(s.bounds[0][1], o.within[0][1]),
            Math.max(s.bounds[0][2], o.within[0][2]),
          ],
          [
            Math.min(s.bounds[1][0], o.within[1][0]),
            Math.min(s.bounds[1][1], o.within[1][1]),
            Math.min(s.bounds[1][2], o.within[1][2]),
          ],
        ]
      : s.bounds,
    resolution: cell,
    color: paint,
    ...(sym ? { symmetry: 'y' as const } : {}),
    ...(amp > 0 ? { lipschitz: 1.6 } : {}),
  });
}
