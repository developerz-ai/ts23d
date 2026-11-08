// Distance and inside queries against one shell. Distance: a BVH (long diagonal members don't
// flood a grid). Inside: the shared SolidIndex, whose ≥ 20 cm ray columns suit vehicles but put a
// 30 cm head into one column of thousands of triangles — so a small shell is indexed scaled up
// (finer columns, bounded by a column budget) and queried scaled the same way. Same answers,
// fewer triangles per ray. Built lazily, cached per shell mesh.

import type { Mesh, Vec3 } from '../core/index.ts';
import type { Shell } from './connections-shells.ts';
import { TriangleBvh } from './contact-bvh.ts';
import { SolidIndex } from './inside.ts';

/** Diagonal (m) the scaled copy gets: 256 columns of 20 cm. */
const TARGET = 51.2;
/** Finest real column ≈ 1 cm. */
const MAX_SCALE = 20;

/** Column entries a SolidIndex would make at scale f (three axes, 20 cm columns). */
function columnsAt(m: Mesh, f: number, cap: number): number {
  const P = m.positions;
  const c = 0.2 / f;
  let n = 0;
  const span = (o: number, k: number): number => {
    const a = P[o + k] ?? 0;
    const b = P[o + 3 + k] ?? 0;
    const d = P[o + 6 + k] ?? 0;
    return Math.floor(Math.max(a, b, d) / c) - Math.floor(Math.min(a, b, d) / c) + 1;
  };
  for (let o = 0; o < P.length && n <= cap; o += 9) {
    const [x, y, z] = [span(o, 0), span(o, 1), span(o, 2)];
    n += y * z + x * z + x * y;
  }
  return n;
}

/** The finest scale (≤ TARGET / diag) whose columns stay within a few per triangle. */
function scaleFor(m: Mesh, diag: number): number {
  if (!(diag > 0) || diag >= TARGET) return 1;
  const cap = 24 * (m.indices.length / 3) + 256;
  for (let f = Math.min(MAX_SCALE, TARGET / diag); f > 1; f /= 2)
    if (columnsAt(m, f, cap) <= cap) return f;
  return 1;
}

/** Shells this small skip the index: three brute-force axis rays, majority vote. */
const SMALL = 96;
const NUDGE = [1.37e-5, 2.91e-5, 3.73e-5] as const;
const AXES = [
  [0, 1, 2],
  [1, 2, 0],
  [2, 0, 1],
] as const;

function smallInside(P: Float32Array, q: Vec3): boolean {
  const votes = AXES.map(([a, i, j]) => {
    const pa = q[a] + NUDGE[a];
    const pi = q[i] + NUDGE[i];
    const pj = q[j] + NUDGE[j];
    let n = 0;
    for (let o = 0; o < P.length; o += 9) {
      const ai = P[o + i] ?? 0;
      const aj = P[o + j] ?? 0;
      const bi = P[o + 3 + i] ?? 0;
      const bj = P[o + 3 + j] ?? 0;
      const ci = P[o + 6 + i] ?? 0;
      const cj = P[o + 6 + j] ?? 0;
      const area = (bi - ai) * (cj - aj) - (bj - aj) * (ci - ai);
      if (Math.abs(area) < 1e-14) continue;
      const w0 = ((bi - pi) * (cj - pj) - (bj - pj) * (ci - pi)) / area;
      const w1 = ((ci - pi) * (aj - pj) - (cj - pj) * (ai - pi)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const depth = w0 * (P[o + a] ?? 0) + w1 * (P[o + 3 + a] ?? 0) + w2 * (P[o + 6 + a] ?? 0);
      if (depth > pa) n++;
    }
    return n % 2 === 1;
  });
  return (votes[0] ? 1 : 0) + (votes[1] ? 1 : 0) + (votes[2] ? 1 : 0) >= 2;
}

export class Probe {
  private readonly shell: Shell;
  private bvhCache: TriangleBvh | null = null;
  private solidCache: { f: number; index: SolidIndex } | null = null;

  constructor(s: Shell) {
    this.shell = s;
  }

  get hasSolid(): boolean {
    return this.shell.solid;
  }

  private get bvh(): TriangleBvh {
    this.bvhCache ??= new TriangleBvh(this.shell.mesh.positions);
    return this.bvhCache;
  }

  private get solid(): { f: number; index: SolidIndex } {
    if (this.solidCache) return this.solidCache;
    const s = this.shell;
    const b = s.bounds;
    const f = scaleFor(
      s.mesh,
      Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]),
    );
    const m: Mesh = f === 1 ? s.mesh : { ...s.mesh, positions: s.mesh.positions.map((v) => v * f) };
    this.solidCache = { f, index: new SolidIndex(m) };
    return this.solidCache;
  }

  /** Triangles of the shell whose boxes overlap [lo, hi]. */
  trianglesIn(lo: readonly number[], hi: readonly number[]): number[] {
    return this.bvh.within(lo, hi);
  }

  /** Distance from p to the surface if within r, else Infinity. */
  dist(p: Vec3, r: number): number {
    return this.bvh.nearest(p[0], p[1], p[2], r);
  }

  /** p inside the closed shell (always false for open sheets). */
  inside(p: Vec3): boolean {
    const b = this.shell.bounds;
    if (
      !this.shell.solid ||
      p[0] < b.min[0] ||
      p[1] < b.min[1] ||
      p[2] < b.min[2] ||
      p[0] > b.max[0] ||
      p[1] > b.max[1] ||
      p[2] > b.max[2]
    )
      return false;
    const P = this.shell.mesh.positions;
    if (P.length <= SMALL * 9) return smallInside(P, p);
    const { f, index } = this.solid;
    return index.inside([p[0] * f, p[1] * f, p[2] * f]);
  }

  /** + inside (depth below the surface), − outside; ±r when farther than r. */
  depth(p: Vec3, r: number): number {
    const d = this.dist(p, r);
    const v = Number.isFinite(d) ? d : r;
    return this.inside(p) ? v : -v;
  }

  /** Outward surface normal near an outside point (central differences of the distance). */
  normalAt(p: Vec3, h: number, r: number): Vec3 | null {
    const g = ([0, 1, 2] as const).map((k) => {
      const a: [number, number, number] = [p[0], p[1], p[2]];
      const b: [number, number, number] = [p[0], p[1], p[2]];
      a[k] += h;
      b[k] -= h;
      return this.dist(a, r) - this.dist(b, r);
    });
    const [x, y, z] = [g[0] ?? 0, g[1] ?? 0, g[2] ?? 0];
    const len = Math.hypot(x, y, z);
    return Number.isFinite(len) && len > 1e-9 ? [x / len, y / len, z / len] : null;
  }
}

const cache = new WeakMap<Mesh, Probe>();

export function probeOf(s: Shell): Probe {
  const hit = cache.get(s.mesh);
  if (hit) return hit;
  const made = new Probe(s);
  cache.set(s.mesh, made);
  return made;
}
