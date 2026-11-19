// Slate courses for the station roof: the library roof is one smooth slab per slope, so each
// course is laid over it as its own shallow wedge (lower edge 12 mm proud, casting the course
// shadow line; upper edge sunk into the slab under the course above), split into a few runs
// of slates with their own tone. Lichen and moss gather on the shaded (−X, north) slope, soot
// from passing engines on the track (+X) slope's lower courses.

import {
  DEFAULT_SHEET,
  type Mesh,
  MeshBuilder,
  merge,
  type Rng,
  stripRect,
  type Vec3,
  valueNoise,
} from '@developerz.ai/ts23d';

export interface SlateRoof {
  /** World z of the roof's top surface at (x, y). */
  readonly heightAt: (x: number, y: number) => number;
  /** Ridge line x and the two eave edges (x), metres. */
  readonly ridgeX: number;
  readonly eaves: readonly [number, number];
  /** Half-length of the slope along Y (to the verge), metres. */
  readonly halfY: number;
  /** Course gauge along the slope, metres (exposed length of a slate). */
  readonly gauge: number;
  readonly color: Vec3;
  /** Runs of slates per course (each its own tone). */
  readonly runs: number;
}

const LICHEN: Vec3 = [0.3, 0.32, 0.17];
const SOOT: Vec3 = [0.05, 0.05, 0.05];

/** A closed six-faced solid from its eight corners (bottom 0-3, top 4-7, both CCW from above). */
function hexa(b: MeshBuilder, q: readonly Vec3[], color: Vec3, v0: number, v1: number): void {
  const r = stripRect('slate');
  const half = 0.5 / 4096;
  const faces: readonly (readonly number[])[] = [
    [4, 5, 6, 7], // top
    [0, 1, 5, 4], // lower butt (faces down-slope)
    [1, 2, 6, 5],
    [3, 0, 4, 7],
  ];
  for (const f of faces) {
    const p: Vec3[] = f.map((i): Vec3 => q[i] ?? [0, 0, 0]);
    const [a, c, d] = [p[0] ?? [0, 0, 0], p[1] ?? [0, 0, 0], p[3] ?? [0, 0, 0]];
    const e1: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const e2: Vec3 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    const n: Vec3 = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    const nn: Vec3 = [n[0] / l, n[1] / l, n[2] / l];
    const ids = p.map((pt, k) =>
      b.vertex({
        p: pt,
        n: nn,
        uv: [
          r.u0 + (pt[1] / r.metres) * (r.u1 - r.u0),
          r.v0 + half + (k < 2 ? v0 : v1) * (r.v1 - r.v0 - 2 * half),
        ],
        color,
      }),
    );
    b.quad(ids[0] ?? 0, ids[1] ?? 0, ids[2] ?? 0, ids[3] ?? 0);
  }
}

/** Every course on both slopes, LOD-gated by the caller (LOD0/1). */
export function slateCourses(rng: Rng, o: SlateRoof): Mesh {
  const b = new MeshBuilder();
  const patch = valueNoise(rng.fork('lichen'), { scale: 1.2, octaves: 3 });
  const vm = DEFAULT_SHEET.strips.slate?.scaleMetres ?? 0.66;
  for (const eave of o.eaves) {
    const s = Math.sign(eave - o.ridgeX);
    const run = Math.abs(eave - o.ridgeX);
    const z0 = o.heightAt(eave - s * 0.01, 0);
    const z1 = o.heightAt(o.ridgeX + s * 0.01, 0);
    const slope = Math.hypot(run, z1 - z0);
    const dx = (o.gauge * run) / slope; // horizontal step per course
    const courses = Math.floor((run - 0.18) / dx);
    for (let k = 0; k < courses; k++) {
      const xl = eave - s * k * dx; // lower edge
      const xu = xl - s * (dx + 0.02); // upper edge, under the next course
      const zl = o.heightAt(xl - s * 0.001, 0);
      const zu = o.heightAt(xu, 0);
      // Course breaks: `runs` stretches with seeded joints, so no two courses line up.
      const cuts = [-o.halfY];
      for (let i = 1; i < o.runs; i++)
        cuts.push(-o.halfY + ((2 * o.halfY) / o.runs) * (i + rng.range(-0.3, 0.3)));
      cuts.push(o.halfY);
      const vBase = ((k * o.gauge) % vm) / vm;
      for (let i = 0; i + 1 < cuts.length; i++) {
        const y0 = cuts[i] ?? 0;
        const y1 = cuts[i + 1] ?? 0;
        const ym = (y0 + y1) / 2;
        const tone = rng.range(0.8, 1.2);
        let c: Vec3 = [o.color[0] * tone, o.color[1] * tone, o.color[2] * tone];
        const mossy = (s < 0 ? 0.9 : 0.4) * Math.max(0, patch([xl, ym, zl]) + 0.25);
        const sooty = s > 0 ? 0.45 * Math.max(0, 1 - k / 8) : 0;
        const mixTo = (to: Vec3, w: number): Vec3 => [
          c[0] + (to[0] - c[0]) * w,
          c[1] + (to[1] - c[1]) * w,
          c[2] + (to[2] - c[2]) * w,
        ];
        c = mixTo(LICHEN, Math.min(0.8, mossy));
        c = mixTo(SOOT, sooty);
        const q: Vec3[] = [
          [xl, y0, zl - 0.006],
          [xl, y1, zl - 0.006],
          [xu, y1, zu - 0.012],
          [xu, y0, zu - 0.012],
          [xl, y0, zl + 0.012],
          [xl, y1, zl + 0.012],
          [xu, y1, zu - 0.002],
          [xu, y0, zu - 0.002],
        ];
        // Courses on the −X slope run the other way round: keep the faces outward.
        const order = s > 0 ? q : [q[1], q[0], q[3], q[2], q[5], q[4], q[7], q[6]];
        hexa(
          b,
          order.map((p) => p ?? [0, 0, 0]),
          c,
          vBase,
          Math.min(1, vBase + (o.gauge + 0.02) / vm),
        );
      }
    }
  }
  return merge([b.build()]);
}
