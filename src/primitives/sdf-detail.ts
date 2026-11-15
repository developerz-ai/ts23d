// Detail regions for `sdf`: axis-aligned boxes meshed at a finer cell (h / factor) inside an
// otherwise coarse grid, so triangles go to the face and paws instead of the flank. Each box is
// snapped outward to whole coarse cells and must keep ≥ 1 coarse cell from the grid border and
// from every other region. Fine samples ON the box surface are interpolated (trilinear) from the
// coarse corners: a fine edge on the interface then changes sign only where the coarse face does,
// which is what lets surface-nets-detail.ts stitch both levels into one closed surface.

import type { Vec3 } from '../core/index.ts';
import { invalid } from './check.ts';
import type { Field } from './sdf-ops.ts';

export interface DetailRegion {
  /** [min, max] corners, metres; snapped outward to the coarse grid. */
  readonly bounds: readonly [Vec3, Vec3];
  /** Cells per coarse cell edge inside the box. */
  readonly factor: 2 | 4;
}

export interface DetailGrid {
  /** Coarse point index of the box's low corner, and its size in coarse cells. */
  readonly at: readonly [number, number, number];
  readonly cells: readonly [number, number, number];
  readonly f: number;
  /** Fine points per axis (cells · f + 1) and their values, x fastest. */
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly values: Float32Array;
}

/** The coarse grid a region refines (sdf-grid.ts's Grid without its own detail). */
export interface CoarseGrid {
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly origin: Vec3;
  readonly h: number;
  readonly values: Float32Array;
  readonly field: Field;
}

const BLOCK = 4;

/** Snap regions to coarse cells, check they fit and stay apart, and sample them. */
export function sampleDetail(
  g: CoarseGrid,
  regions: readonly DetailRegion[],
  lipschitz: number,
  maxPoints: number,
  /** Fine-lattice y index of y = 0 when the grid is mirror-snapped (exact mirror samples). */
  yZero: ((f: number) => number) | null,
): DetailGrid[] {
  const n = [g.nx, g.ny, g.nz];
  const boxes = regions.map((r, i) => {
    if (r.factor !== 2 && r.factor !== 4)
      invalid(`sdf detail ${i}: factor is ${String(r.factor)}`, 'use factor: 2 or 4');
    const [lo, hi] = r.bounds;
    const at: number[] = [];
    const end: number[] = [];
    for (let k = 0; k < 3; k++) {
      const a = Math.floor(((lo[k] ?? 0) - (g.origin[k] ?? 0)) / g.h);
      const b = Math.ceil(((hi[k] ?? 0) - (g.origin[k] ?? 0)) / g.h);
      if (!(Number.isFinite(a) && Number.isFinite(b) && b > a))
        invalid(
          `sdf detail ${i}: bounds are empty or not finite`,
          'give [min, max] with max > min',
        );
      at.push(Math.max(1, a));
      end.push(Math.min((n[k] ?? 0) - 2, b));
      if ((end[k] ?? 0) <= (at[k] ?? 0))
        invalid(
          `sdf detail ${i}: box lies outside the sdf bounds`,
          'put the detail box inside the shape bounds (it refines, it does not extend)',
        );
    }
    return { at, end, f: r.factor };
  });
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (!a || !b) continue;
      const apart = [0, 1, 2].some(
        (k) => (a.end[k] ?? 0) < (b.at[k] ?? 0) || (b.end[k] ?? 0) < (a.at[k] ?? 0),
      );
      if (!apart)
        invalid(
          `sdf detail ${i} and ${j} overlap or touch after snapping to ${g.h} m cells`,
          'merge them into one box, or keep at least one coarse cell between them',
        );
    }
  return boxes.map(({ at, end, f }) => {
    const cells: [number, number, number] = [
      (end[0] ?? 0) - (at[0] ?? 0),
      (end[1] ?? 0) - (at[1] ?? 0),
      (end[2] ?? 0) - (at[2] ?? 0),
    ];
    const [nx, ny, nz] = [cells[0] * f + 1, cells[1] * f + 1, cells[2] * f + 1];
    if (nx * ny * nz > maxPoints)
      invalid(
        `sdf detail grid ${nx}×${ny}×${nz} exceeds ${maxPoints} points`,
        'shrink the detail box or lower its factor',
      );
    const d: DetailGrid = {
      at: [at[0] ?? 0, at[1] ?? 0, at[2] ?? 0],
      cells,
      f,
      nx,
      ny,
      nz,
      values: new Float32Array(nx * ny * nz),
    };
    fill(g, d, lipschitz, yZero);
    return d;
  });
}

function fill(
  g: CoarseGrid,
  d: DetailGrid,
  lipschitz: number,
  yZero: ((f: number) => number) | null,
): void {
  const { nx, ny, nz, f, values } = d;
  const hf = g.h / f;
  const [gx, gy, gz] = [d.at[0] * f, d.at[1] * f, d.at[2] * f];
  const y0 = yZero ? yZero(f) : 0;
  const p: [number, number, number] = [0, 0, 0];
  const put = (I: number, J: number, K: number): void => {
    p[0] = g.origin[0] + (gx + I) * hf;
    p[1] = yZero ? (gy + J - y0) * hf : g.origin[1] + (gy + J) * hf;
    p[2] = g.origin[2] + (gz + K) * hf;
  };
  const floor = hf * 0.01;
  const clampFloor = (v: number): number => (Math.abs(v) >= floor ? v : v < 0 ? -floor : floor);
  // Interior: block-sparse like the coarse grid; a block far from the surface takes its centre's sign.
  const reach = lipschitz * BLOCK * hf * Math.sqrt(3) * 0.5 + hf;
  for (let k = 0; k < nz - 1; k += BLOCK)
    for (let j = 0; j < ny - 1; j += BLOCK)
      for (let i = 0; i < nx - 1; i += BLOCK) {
        const [i1, j1, k1] = [
          Math.min(nx - 1, i + BLOCK),
          Math.min(ny - 1, j + BLOCK),
          Math.min(nz - 1, k + BLOCK),
        ];
        put((i + i1) / 2, (j + j1) / 2, (k + k1) / 2);
        const c = g.field(p);
        const far = Math.abs(c) > reach;
        for (let z = k; z <= k1; z++)
          for (let y = j; y <= j1; y++)
            for (let x = i; x <= i1; x++) {
              const id = x + nx * (y + ny * z);
              if (far) {
                // A neighbour block may have sampled this shared face exactly already.
                if (values[id] === 0) values[id] = clampFloor(c);
                continue;
              }
              put(x, y, z);
              values[id] = clampFloor(g.field(p));
            }
      }
  // Box surface: trilinear from the coarse corners (overrides the samples above).
  for (let z = 0; z < nz; z++)
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        if (x > 0 && x < nx - 1 && y > 0 && y < ny - 1 && z > 0 && z < nz - 1) continue;
        values[x + nx * (y + ny * z)] = clampFloor(coarseAt(g, gx + x, gy + y, gz + z, f));
      }
}

/** Trilinear coarse value at fine-lattice point (I, J, K) (exact at coarse points: t = 0). */
function coarseAt(g: CoarseGrid, I: number, J: number, K: number, f: number): number {
  const cell = (q: number, n: number): [number, number] => {
    const i = Math.min(Math.floor(q / f), n - 2);
    return [i, (q - i * f) / f];
  };
  const [i, tx] = cell(I, g.nx);
  const [j, ty] = cell(J, g.ny);
  const [k, tz] = cell(K, g.nz);
  const v = (a: number, b: number, c: number): number =>
    g.values[i + a + g.nx * (j + b + g.ny * (k + c))] ?? 1;
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
  const y0 = lerp(lerp(v(0, 0, 0), v(1, 0, 0), tx), lerp(v(0, 1, 0), v(1, 1, 0), tx), ty);
  const y1 = lerp(lerp(v(0, 0, 1), v(1, 0, 1), tx), lerp(v(0, 1, 1), v(1, 1, 1), tx), ty);
  return lerp(y0, y1, tz);
}
