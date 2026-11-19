// Clumps of a crown for the far LOD: area-weighted samples (one per triangle centroid, with its
// colour) of the LOD0 leaf cards, grouped by k-means with deterministic farthest-point seeding
// (highest sample first). Pure arithmetic, no rng: the same cards give the same clumps.

import type { Mesh, Vec3 } from '../core/index.ts';

export interface Sample {
  readonly p: Vec3;
  /** Triangle area, m². */
  readonly w: number;
  readonly c: Vec3;
}

export interface Clump {
  /** Area-weighted centroid. */
  readonly centre: Vec3;
  /** Total card area, m². */
  readonly w: number;
  readonly members: readonly Sample[];
}

export function samples(m: Mesh): Sample[] {
  const out: Sample[] = [];
  const at = (a: Float32Array, i: number): Vec3 => [
    a[i * 3] ?? 0,
    a[i * 3 + 1] ?? 0,
    a[i * 3 + 2] ?? 0,
  ];
  for (let t = 0; t + 2 < m.indices.length; t += 3) {
    const [ia = 0, ib = 0, ic = 0] = [m.indices[t], m.indices[t + 1], m.indices[t + 2]];
    const [a, b, c] = [at(m.positions, ia), at(m.positions, ib), at(m.positions, ic)];
    const e1: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const w =
      0.5 *
      Math.hypot(
        e1[1] * e2[2] - e1[2] * e2[1],
        e1[2] * e2[0] - e1[0] * e2[2],
        e1[0] * e2[1] - e1[1] * e2[0],
      );
    if (w <= 0) continue;
    const [ca, cb, cc] = [at(m.colors, ia), at(m.colors, ib), at(m.colors, ic)];
    out.push({
      p: [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3],
      w,
      c: [(ca[0] + cb[0] + cc[0]) / 3, (ca[1] + cb[1] + cc[1]) / 3, (ca[2] + cb[2] + cc[2]) / 3],
    });
  }
  return out;
}

const d2 = (a: Vec3, b: Vec3): number =>
  (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/** Farthest-point seeds starting from the highest sample: deterministic, spread over the crown. */
function seeds(s: readonly Sample[], k: number): Vec3[] {
  let top = s[0];
  for (const q of s) if (top && q.p[2] > top.p[2]) top = q;
  if (!top) return [];
  const out: Vec3[] = [top.p];
  const near = s.map((q) => d2(q.p, top.p));
  while (out.length < k) {
    let best = -1;
    let far = 0;
    for (let i = 0; i < s.length; i++)
      if ((near[i] ?? 0) > far) {
        far = near[i] ?? 0;
        best = i;
      }
    const p = s[best]?.p;
    if (!p) break;
    out.push(p);
    for (let i = 0; i < s.length; i++) near[i] = Math.min(near[i] ?? 0, d2(s[i]?.p ?? p, p));
  }
  return out;
}

/** `k` clumps (fewer when the samples run out) after `iterations` k-means rounds. */
export function cluster(s: readonly Sample[], k: number, iterations = 10): Clump[] {
  let centres = seeds(s, k);
  const owner = new Int32Array(s.length);
  for (let it = 0; it <= iterations; it++) {
    const acc = centres.map((): [number, number, number, number] => [0, 0, 0, 0]);
    s.forEach((q, i) => {
      let best = 0;
      let bd = Infinity;
      centres.forEach((c, j) => {
        const d = d2(q.p, c);
        if (d < bd) {
          bd = d;
          best = j;
        }
      });
      owner[i] = best;
      const a = acc[best];
      if (a) {
        a[0] += q.p[0] * q.w;
        a[1] += q.p[1] * q.w;
        a[2] += q.p[2] * q.w;
        a[3] += q.w;
      }
    });
    if (it < iterations)
      centres = centres.map((c, j) => {
        const a = acc[j];
        return a && a[3] > 0 ? [a[0] / a[3], a[1] / a[3], a[2] / a[3]] : c;
      });
  }
  return centres
    .map((centre, j): Clump => {
      const members = s.filter((_, i) => owner[i] === j);
      return { centre, w: members.reduce((a, q) => a + q.w, 0), members };
    })
    .filter((c) => c.w > 0);
}
