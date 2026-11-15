// Line-integral convolution: seeded value noise smeared along a flow (Cabral & Leedom 1993). Each
// texel averages the noise at points traced forward and back along the flow under a Hann window,
// so values correlate along the strands and stay independent across them: hair, fur, brushed
// metal, wood fibre. `licDirection` is the same flow as a 0..1 axial angle, the direction an
// anisotropic highlight (KHR_materials_anisotropy) runs. Tileable along U: the noise lattice and
// the flow field both wrap every tile. Deterministic: fixed steps, integer-hash noise.

import { Ts23dError } from '../../core/index.ts';
import { valueNoise } from '../paint/noise.ts';
import { type Input, sample, type TexContext, TexField } from './field.ts';
import { eachTexel, lattice } from './generators.ts';

export interface LicOptions {
  /** Flow angle in the strip plane, radians from +U toward +V: a constant or a field of radians. */
  readonly angle?: Input;
  /** Metres the noise is smeared each way along the flow (strand half-length). */
  readonly length: number;
  /** Noise cell across the flow, metres (strand width). */
  readonly grain: number;
  readonly seed?: number;
}

const positive = (name: string, v: number, eg: string): void => {
  if (!(Number.isFinite(v) && v > 0))
    throw new Ts23dError('T3D_MATERIAL_INVALID', {
      cause: `tex.lic ${name} is ${v}`,
      fix: `use a length in metres > 0, e.g. ${name}: ${eg}`,
    });
};

/** Flow angle at texel coords (x, y) in radians. */
const angleAt = (ctx: TexContext, a: Float32Array | number, x: number, y: number): number =>
  typeof a === 'number' ? a : sample(ctx, a, x, y);

/** Strand streaks 0..1 (mean ≈ 0.5): noise convolved along the flow. */
export function lic(o: LicOptions): TexField {
  positive('length', o.length, '0.02');
  positive('grain', o.grain, '0.002');
  const angle = o.angle ?? 0;
  return new TexField((ctx) => {
    const pu = ctx.metresU / ctx.w;
    const pv = ctx.metresV / ctx.h;
    const step = Math.min(pu, pv, o.grain * 0.5);
    const n = Math.max(2, Math.min(64, Math.ceil(o.length / step)));
    const ds = o.length / n;
    const { n: period, cell } = lattice(ctx, Math.max(o.grain, 1.5 * pu));
    const cellV = Math.max(o.grain, 1.5 * pv);
    const seed = ctx.seed + (o.seed ?? 0) * 7919 + 613;
    const a = typeof angle === 'number' ? angle : angle.eval(ctx);
    const noiseAt = (xm: number, ym: number): number =>
      valueNoise(xm / cell, ym / cellV, period, seed);
    // Independent samples along a streamline ≈ 2·length / grain: restore the contrast the
    // average removed (the standard deviation of a mean falls as 1/√k).
    const gain = Math.min(4, Math.sqrt(1 + (2 * o.length) / o.grain));
    const out = new Float32Array(ctx.w * ctx.h);
    eachTexel(ctx, (i, xm, ym) => {
      let sum = noiseAt(xm, ym);
      let wsum = 1;
      for (const dir of [1, -1]) {
        let x = xm;
        let y = ym;
        for (let k = 1; k <= n; k++) {
          const t = angleAt(ctx, a, x / pu - 0.5, y / pv - 0.5);
          x += Math.cos(t) * ds * dir;
          y += Math.sin(t) * ds * dir;
          const w = 0.5 + 0.5 * Math.cos((Math.PI * k) / (n + 1));
          sum += noiseAt(x, y) * w;
          wsum += w;
        }
      }
      out[i] = Math.min(1, Math.max(0, 0.5 + (sum / wsum - 0.5) * gain));
    });
    return out;
  }, `lic(${o.length},${o.grain})`);
}

/** The flow as an axial angle 0..1 (0 and 1 = along +U, 0.5 = along +V): anisotropy direction. */
export function licDirection(angle: Input): TexField {
  const wrap = (t: number): number => {
    const u = t / Math.PI;
    return u - Math.floor(u);
  };
  return typeof angle === 'number'
    ? new TexField((ctx) => new Float32Array(ctx.w * ctx.h).fill(wrap(angle)), 'licDirection')
    : angle.map(wrap, 'licDirection');
}
