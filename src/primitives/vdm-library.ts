// Procedural VDM stamps, seeded (createRng: the same seed is the same stamp, bit for bit): the
// creature artist's detail brushes. Every stamp is built at unit footprint width, (u, v) ∈ [-½, ½]²,
// +v the stamp's `up` (scale tips point there), z out of the skin; the edge ring is windowed to 0
// so it fades into the surface, and the Lipschitz is computed by `vdmStamp`.
//   scalePatch  overlapping keeled scales, shingled toward +v (tip over the next root)
//   wart        lobed dome with small lumps, peak exactly at the centre
//   hornBase    ringed collar a horn grows out of (raised toward the centre, growth rings)
//   toothSocket raised gum rim around a pit (raises and cuts)
//   poreField   scattered small pits
//   scarWelt    raised ragged welt along v with puckered sides
//   furrow      a groove along v with low lips

import { createRng, type Rng } from '../core/index.ts';
import { invalid } from './check.ts';
import { type VdmStamp, vdmStamp } from './vdm.ts';

export interface StampOptions {
  /** Seed of the stamp's variation. Default 1. */
  readonly seed?: number;
  /** Texels per side. Default 33 (49 for scalePatch and poreField). */
  readonly res?: number;
}

type Texel = (u: number, v: number) => readonly [number, number, number];

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smooth = (x: number): number => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
/** (1 − x²)², 1 at 0, 0 at |x| ≥ 1 with zero slope: the bump every round feature uses. */
const bump = (x: number): number => (x * x >= 1 ? 0 : (1 - x * x) ** 2);

function build(o: StampOptions, def: number, fn: Texel): VdmStamp {
  const n = o.res ?? def;
  if (!(Number.isInteger(n) && n >= 9))
    invalid(`vdm stamp res is ${n}`, 'use an integer ≥ 9 texels per side (33 is typical)');
  const g = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1) - 0.5;
      const v = j / (n - 1) - 0.5;
      // Window: 0 on the edge ring, 1 from 2 texels in.
      const w = smooth((0.5 - Math.max(Math.abs(u), Math.abs(v))) * ((n - 1) / 2));
      const t = fn(u, v);
      // + 0 turns −0 into 0: the edge ring and flat texels are plain zeros.
      g.set([t[0] * w + 0, t[1] * w + 0, t[2] * w + 0], (j * n + i) * 3);
    }
  return vdmStamp(n, g);
}

const rngOf = (o: StampOptions): Rng => createRng(o.seed ?? 1);

/** Overlapping keeled scales in `rows` × `cols` (staggered), tips toward +v; 1 × 1 = one scale. */
export function scalePatch(
  o: StampOptions & { readonly rows?: number; readonly cols?: number; readonly keel?: number } = {},
): VdmStamp {
  const rows = o.rows ?? 3;
  const cols = o.cols ?? 3;
  const keel = o.keel ?? 0.25;
  const rng = rngOf(o);
  const cw = 0.84 / cols;
  const ch = 0.84 / rows;
  const scales: { u: number; v: number; h: number; w: number; l: number }[] = [];
  // One scale fills the footprint (for scatter: neighbours overlap into shingles); a patch also
  // gets a ring of part-scales the window cuts, so its edge is not bare.
  const one = rows === 1 && cols === 1;
  const edge = one ? 0 : 1;
  for (let r = -edge; r < rows + edge; r++)
    for (let c = -edge; c < cols + edge; c++) {
      const u = -0.42 + cw * (c + 0.5 + (r % 2 === 0 ? 0 : 0.5)) + rng.range(-0.06, 0.06) * cw;
      const v = -0.42 + ch * (r + 0.5) + rng.range(-0.06, 0.06) * ch;
      const [w, l] = one ? [0.4, 0.44] : [cw * 0.62, ch * 0.78];
      scales.push({ u: one ? 0 : u, v: one ? 0 : v, h: rng.range(0.85, 1), w, l });
    }
  return build(o, 49, (u, v) => {
    let z = 0;
    for (const s of scales) {
      const a = (u - s.u) / s.w;
      const t = (v - s.v) / s.l;
      // Teardrop outline, wider at the free tip (+t), domed, rising root → tip (shingle).
      const half = 0.75 + 0.25 * t;
      const e = (a / half) ** 2 + t * t;
      if (e >= 1) continue;
      // Crisp rim, then a domed crown: the edge reads even a few cells across.
      const dome = smooth((1 - e) / 0.5);
      const rise = 0.45 + 0.55 * smooth((t + 1) / 1.6);
      const ridge = keel * bump(a / 0.35) * smooth((t + 1) / 1.2);
      z = Math.max(z, s.h * dome * (rise + ridge) * 0.82);
    }
    // The vector part: tips lean toward +v (lifted shingle edges).
    return [0, 0.04 * z, z];
  });
}

/** A lobed dome, peak 1 exactly at the centre, small lumps toward its rim. */
export function wart(o: StampOptions & { readonly lobes?: number } = {}): VdmStamp {
  const rng = rngOf(o);
  const lobes = o.lobes ?? 0.12;
  const ph = [rng.range(0, 6.3), rng.range(0, 6.3)];
  const lumps = [0, 1, 2, 3].map(() => ({ a: rng.range(0, 6.3), r: rng.range(0.15, 0.25) }));
  return build(o, 33, (u, v) => {
    const th = Math.atan2(v, u);
    const k =
      1 + lobes * (0.6 * Math.sin(3 * th + (ph[0] ?? 0)) + 0.4 * Math.sin(5 * th + (ph[1] ?? 0)));
    const r = Math.hypot(u, v) / (0.4 * k);
    let z = bump(r);
    for (const l of lumps)
      z += 0.08 * bump(Math.hypot(u - l.r * Math.cos(l.a), v - l.r * Math.sin(l.a)) / 0.09) * r * r;
    return [0.06 * u * z, 0.06 * v * z, z];
  });
}

/** The ringed collar at a horn's root: rises toward the centre, `rings` growth rings. */
export function hornBase(o: StampOptions & { readonly rings?: number } = {}): VdmStamp {
  const rng = rngOf(o);
  const rings = o.rings ?? 3;
  const ph = rng.range(0, 6.3);
  return build(o, 33, (u, v) => {
    const rr = Math.hypot(u, v);
    const th = Math.atan2(v, u);
    const r = rr / (0.46 + 0.015 * Math.sin(4 * th + ph));
    const hump = smooth((1 - r) / 0.6);
    const ring = 0.7 + 0.3 * Math.cos(2 * Math.PI * rings * r + 0.3 * Math.sin(3 * th + ph));
    const z = hump * ring;
    // Collar bulges outward (radial push), the vector part a height map cannot give.
    const s = rr > 1e-9 ? (0.12 * z) / rr : 0;
    return [u * s * 0.4, v * s * 0.4, z];
  });
}

/** Raised gum rim around a pit (depth −1 at the centre). */
export function toothSocket(o: StampOptions = {}): VdmStamp {
  const rng = rngOf(o);
  const ph = rng.range(0, 6.3);
  return build(o, 33, (u, v) => {
    const th = Math.atan2(v, u);
    const r = Math.hypot(u, v) / (0.44 + 0.02 * Math.sin(3 * th + ph));
    const rim = 0.45 * bump((r - 0.62) / 0.3);
    const pit = -bump(r / 0.48);
    return [0, 0, rim + pit];
  });
}

/** `count` small pits (radius 0.03–0.05), kept apart. */
export function poreField(o: StampOptions & { readonly count?: number } = {}): VdmStamp {
  const rng = rngOf(o);
  const want = o.count ?? 40;
  const pores: { u: number; v: number; r: number }[] = [];
  for (let tries = 0; pores.length < want && tries < want * 40; tries++) {
    const p = { u: rng.range(-0.42, 0.42), v: rng.range(-0.42, 0.42), r: rng.range(0.03, 0.05) };
    if (pores.every((q) => Math.hypot(q.u - p.u, q.v - p.v) > q.r + p.r + 0.01)) pores.push(p);
  }
  return build(o, 49, (u, v) => {
    let z = 0;
    for (const p of pores) z = Math.min(z, -bump(Math.hypot(u - p.u, v - p.v) / p.r));
    return [0, 0, z];
  });
}

/** A ragged raised welt along v (tapered ends) with puckered sides. */
export function scarWelt(o: StampOptions = {}): VdmStamp {
  const rng = rngOf(o);
  const wob = [0, 1, 2].map(() => ({
    f: rng.range(5, 11),
    p: rng.range(0, 6.3),
    a: rng.range(0.008, 0.02),
  }));
  return build(o, 33, (u, v) => {
    const c = wob.reduce((s, w) => s + w.a * Math.sin(w.f * v + w.p), 0);
    const along = bump(v / 0.42);
    const width = 0.06 * (0.7 + 0.3 * along);
    const x = (u - c) / width;
    const welt = bump(x / 1.2) * along;
    const pucker = -0.3 * bump((Math.abs(x) - 1.6) / 0.9) * along;
    return [0, 0, welt + pucker];
  });
}

/** A groove along v (depth −1), tapered ends, with low raised lips. */
export function furrow(o: StampOptions & { readonly width?: number } = {}): VdmStamp {
  const rng = rngOf(o);
  const bend = rng.range(-0.04, 0.04);
  const w = o.width ?? 0.08;
  return build(o, 33, (u, v) => {
    const along = bump(v / 0.44);
    const x = (u - bend * (1 - (v / 0.44) ** 2)) / w;
    return [0, 0, (-bump(x) + 0.25 * bump((Math.abs(x) - 1.3) / 0.7)) * along];
  });
}
