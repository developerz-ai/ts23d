// Garland–Heckbert error quadrics: a symmetric 4×4 per point stored as 10 doubles
// (a², ab, ac, ad, b², bc, bd, c², cd, d²), accumulated from area-weighted face planes plus heavy
// constraint planes along borders and seams, evaluated at a candidate position. And a binary
// min-heap of collapse candidates with a total order (cost, from, to) so ties never depend on
// insertion order.

export const QSIZE = 10;

/** Add w·(plane)(plane)ᵀ for the plane n·p + d = 0 (n unit) into q at slot `o`. */
export function addPlane(
  q: Float64Array,
  o: number,
  a: number,
  b: number,
  c: number,
  d: number,
  w: number,
): void {
  q[o] = (q[o] ?? 0) + w * a * a;
  q[o + 1] = (q[o + 1] ?? 0) + w * a * b;
  q[o + 2] = (q[o + 2] ?? 0) + w * a * c;
  q[o + 3] = (q[o + 3] ?? 0) + w * a * d;
  q[o + 4] = (q[o + 4] ?? 0) + w * b * b;
  q[o + 5] = (q[o + 5] ?? 0) + w * b * c;
  q[o + 6] = (q[o + 6] ?? 0) + w * b * d;
  q[o + 7] = (q[o + 7] ?? 0) + w * c * c;
  q[o + 8] = (q[o + 8] ?? 0) + w * c * d;
  q[o + 9] = (q[o + 9] ?? 0) + w * d * d;
}

/** vᵀ(Qa + Qb)v at (x, y, z, 1). */
export function evalSum(
  q: Float64Array,
  a: number,
  b: number,
  x: number,
  y: number,
  z: number,
): number {
  const e = (k: number): number => (q[a + k] ?? 0) + (q[b + k] ?? 0);
  return Math.max(
    0,
    e(0) * x * x +
      2 * e(1) * x * y +
      2 * e(2) * x * z +
      2 * e(3) * x +
      e(4) * y * y +
      2 * e(5) * y * z +
      2 * e(6) * y +
      e(7) * z * z +
      2 * e(8) * z +
      e(9),
  );
}

export function addInto(q: Float64Array, to: number, from: number): void {
  for (let k = 0; k < QSIZE; k++) q[to + k] = (q[to + k] ?? 0) + (q[from + k] ?? 0);
}

/** Min-heap of (cost, from, to, stamp): stamp = version of `from` + `to` when pushed. */
export class CollapseHeap {
  private cost: number[] = [];
  private from: number[] = [];
  private to: number[] = [];
  private stampA: number[] = [];
  private stampB: number[] = [];

  get size(): number {
    return this.cost.length;
  }

  private less(i: number, j: number): boolean {
    const ci = this.cost[i] ?? 0;
    const cj = this.cost[j] ?? 0;
    if (ci !== cj) return ci < cj;
    const fi = this.from[i] ?? 0;
    const fj = this.from[j] ?? 0;
    return fi !== fj ? fi < fj : (this.to[i] ?? 0) < (this.to[j] ?? 0);
  }

  private swap(i: number, j: number): void {
    for (const a of [this.cost, this.from, this.to, this.stampA, this.stampB]) {
      const t = a[i] ?? 0;
      a[i] = a[j] ?? 0;
      a[j] = t;
    }
  }

  push(cost: number, from: number, to: number, sa: number, sb: number): void {
    this.cost.push(cost);
    this.from.push(from);
    this.to.push(to);
    this.stampA.push(sa);
    this.stampB.push(sb);
    let i = this.cost.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }

  /** Remove the cheapest into `out` = [cost, from, to, stampA, stampB]. */
  pop(out: number[]): void {
    out[0] = this.cost[0] ?? 0;
    out[1] = this.from[0] ?? 0;
    out[2] = this.to[0] ?? 0;
    out[3] = this.stampA[0] ?? 0;
    out[4] = this.stampB[0] ?? 0;
    const last = this.cost.length - 1;
    this.swap(0, last);
    for (const a of [this.cost, this.from, this.to, this.stampA, this.stampB]) a.pop();
    let i = 0;
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let m = i;
      if (l < this.cost.length && this.less(l, m)) m = l;
      if (r < this.cost.length && this.less(r, m)) m = r;
      if (m === i) return;
      this.swap(i, m);
      i = m;
    }
  }
}
