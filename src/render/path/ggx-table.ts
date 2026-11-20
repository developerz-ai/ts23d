// Directional albedo of the path tracer's own GGX lobe, tabulated once per process: the split-sum
// terms A (scales F0) and B (scales F90) of ∫ f·cos over the hemisphere, per (n·v, roughness),
// integrated with the same D, Smith V and VNDF sampling the integrator uses. Karis' analytic fit
// (brdf.envBrdf) is made for pre-filtered probes and misses by up to 25% here; this table is what
// keeps the white furnace within 1% (Kulla–Conty multiple-scatter compensation needs the truth).

import { dmath } from '../../core/index.ts';
import { ggxD, smithV } from '../brdf.ts';

const N = 24;
const SPP = 48;

/** [A, B] per cell, row-major over (roughness, n·v). */
const TABLE = new Float64Array(N * N * 2);

const cell = (i: number): number => (i + 0.5) / N;

function integrate(ndv: number, rough: number): [number, number] {
  const a = Math.max(rough * rough, 1e-3);
  const vx = Math.sqrt(1 - ndv * ndv);
  const vz = ndv;
  let A = 0;
  let B = 0;
  for (let i = 0; i < SPP; i++)
    for (let j = 0; j < SPP; j++) {
      // Visible-normal sample (Heitz 2018) with v in the xz plane.
      let hx = a * vx;
      let hz = vz;
      const hl = dmath.hypot(hx, hz);
      hx /= hl;
      hz /= hl;
      const r = Math.sqrt((i + 0.5) / SPP);
      const phi = (2 * Math.PI * (j + 0.5)) / SPP;
      const p1 = r * dmath.cos(phi);
      const s = 0.5 * (1 + hz);
      const p2 = (1 - s) * Math.sqrt(1 - p1 * p1) + s * r * dmath.sin(phi);
      const p3 = Math.sqrt(Math.max(0, 1 - p1 * p1 - p2 * p2));
      // T1 = (0, 1, 0), T2 = Vh × T1 = (−hz, 0, hx).
      const mx = a * (-p2 * hz + p3 * hx);
      const my = a * p1;
      const mz = Math.max(1e-6, p2 * hx + p3 * hz);
      const ml = dmath.hypot(mx, my, mz);
      const vdh = (vx * mx + vz * mz) / ml;
      const lz = (2 * vdh * mz) / ml - vz;
      if (lz <= 0 || vdh <= 0) continue;
      const ndh = mz / ml;
      const D = ggxD(ndh, a);
      const f = D * smithV(lz, ndv, a) * lz;
      const g1 = (2 * ndv) / (ndv + Math.sqrt(a * a + (1 - a * a) * ndv * ndv));
      const w = f / ((D * g1) / (4 * ndv));
      const m2 = (1 - vdh) * (1 - vdh);
      const fc = m2 * m2 * (1 - vdh);
      A += w * (1 - fc);
      B += w * fc;
    }
  return [A / (SPP * SPP), B / (SPP * SPP)];
}

for (let ri = 0; ri < N; ri++)
  for (let vi = 0; vi < N; vi++) {
    const [A, B] = integrate(cell(vi), cell(ri));
    TABLE[(ri * N + vi) * 2] = A;
    TABLE[(ri * N + vi) * 2 + 1] = B;
  }

/** Bilinear [A, B] for (roughness, n·v) into `out`. */
export function ggxAlbedo(rough: number, ndv: number, out: Float64Array): void {
  const x = Math.max(0, Math.min(N - 1, ndv * N - 0.5));
  const y = Math.max(0, Math.min(N - 1, rough * N - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(N - 1, x0 + 1);
  const y1 = Math.min(N - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  for (let c = 0; c < 2; c++) {
    const at = (r: number, v: number): number => TABLE[(r * N + v) * 2 + c] ?? 0;
    out[c] =
      (at(y0, x0) * (1 - fx) + at(y0, x1) * fx) * (1 - fy) +
      (at(y1, x0) * (1 - fx) + at(y1, x1) * fx) * fy;
  }
}
