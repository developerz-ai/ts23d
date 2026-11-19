// Clumps of a crown: area-weighted samples (one per triangle centroid, with its colour) of the
// LOD0 needle tufts, grouped by k-means with deterministic farthest-point seeding (highest sample
// first). Pure arithmetic, no rng: the same tufts give the same clumps.

import type { Mesh, Vec3 } from '@developerz.ai/ts23d';

export interface Sample {
  readonly p: Vec3;
  readonly w: number;
  readonly c: Vec3;
}

export function samples(m: Mesh): Sample[] {
  const out: Sample[] = [];
  const P = m.positions;
  const C = m.colors;
  const at = (i: number): Vec3 => [P[i * 3] ?? 0, P[i * 3 + 1] ?? 0, P[i * 3 + 2] ?? 0];
  const col = (i: number): Vec3 => [C[i * 3] ?? 0, C[i * 3 + 1] ?? 0, C[i * 3 + 2] ?? 0];
  for (let t = 0; t + 2 < m.indices.length; t += 3) {
    const ia = m.indices[t] ?? 0;
    const ib = m.indices[t + 1] ?? 0;
    const ic = m.indices[t + 2] ?? 0;
    const [a, b, c] = [at(ia), at(ib), at(ic)];
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const w =
      0.5 *
      Math.hypot(
        (e1[1] ?? 0) * (e2[2] ?? 0) - (e1[2] ?? 0) * (e2[1] ?? 0),
        (e1[2] ?? 0) * (e2[0] ?? 0) - (e1[0] ?? 0) * (e2[2] ?? 0),
        (e1[0] ?? 0) * (e2[1] ?? 0) - (e1[1] ?? 0) * (e2[0] ?? 0),
      );
    if (w <= 0) continue;
    const [ca, cb, cc] = [col(ia), col(ib), col(ic)];
    out.push({
      p: [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3],
      w,
      c: [(ca[0] + cb[0] + cc[0]) / 3, (ca[1] + cb[1] + cc[1]) / 3, (ca[2] + cb[2] + cc[2]) / 3],
    });
  }
  return out;
}

export const d2 = (a: Vec3, b: Vec3): number =>
  (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/** Farthest-point seeds starting from the highest sample: deterministic, spread over the crown. */
function seeds(s: readonly Sample[], k: number): Vec3[] {
  let top = s[0];
  for (const q of s) if (top && q.p[2] > top.p[2]) top = q;
  const out: Vec3[] = top ? [top.p] : [];
  const near = s.map((q) => d2(q.p, out[0] ?? q.p));
  while (out.length < k) {
    let best = -1;
    let far = -1;
    for (let i = 0; i < s.length; i++)
      if ((near[i] ?? 0) > far) {
        far = near[i] ?? 0;
        best = i;
      }
    const p = s[best]?.p;
    if (!p || far <= 0) break;
    out.push(p);
    for (let i = 0; i < s.length; i++) near[i] = Math.min(near[i] ?? 0, d2(s[i]?.p ?? p, p));
  }
  return out;
}

export interface Clump {
  centre: Vec3;
  w: number;
  members: Sample[];
}

export function cluster(s: readonly Sample[], k: number, iterations: number): Clump[] {
  let centres = seeds(s, k);
  let clumps: Clump[] = [];
  for (let it = 0; it <= iterations; it++) {
    clumps = centres.map((c) => ({ centre: c, w: 0, members: [] }));
    for (const q of s) {
      let best = 0;
      let bd = Infinity;
      for (let j = 0; j < centres.length; j++) {
        const d = d2(q.p, centres[j] ?? q.p);
        if (d < bd) {
          bd = d;
          best = j;
        }
      }
      clumps[best]?.members.push(q);
    }
    centres = clumps.map((cl) => {
      let w = 0;
      const acc: [number, number, number] = [0, 0, 0];
      for (const q of cl.members) {
        w += q.w;
        acc[0] += q.p[0] * q.w;
        acc[1] += q.p[1] * q.w;
        acc[2] += q.p[2] * q.w;
      }
      cl.w = w;
      return w > 0 ? [acc[0] / w, acc[1] / w, acc[2] / w] : cl.centre;
    });
  }
  return clumps.filter((c) => c.w > 0);
}
