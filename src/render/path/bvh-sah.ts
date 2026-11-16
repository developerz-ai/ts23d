// Binned surface-area-heuristic split for the path tracer's BVH (bvh.ts): bin triangle centroids
// along each axis, sweep both ways for the cheapest left/right partition, or say "make a leaf".
// Deterministic: fixed bins, axes in order, the first of equal costs wins.

/** Triangles per leaf below which no split is tried. */
export const LEAF = 4;
export const BINS = 12;

const binBox = new Float64Array(BINS * 6);
const binN = new Int32Array(BINS);
const rightArea = new Float64Array(BINS);
const rightN = new Int32Array(BINS);

/** Best [axis, last bin on the left] by the surface-area heuristic, or null: make a leaf. */
export function sahSplit(
  o: Int32Array,
  start: number,
  end: number,
  tb: Float64Array,
  cen: Float64Array,
  lo: readonly number[],
  hi: readonly number[],
  parent: number,
): [number, number] | null {
  const n = end - start;
  let best = n * parent;
  let pick: [number, number] | null = null;
  for (let axis = 0; axis < 3; axis++) {
    const ext = (hi[axis] ?? 0) - (lo[axis] ?? 0);
    if (!(ext > 1e-12)) continue;
    const scale = BINS / ext;
    binBox.fill(Infinity);
    for (let b = 0; b < BINS; b++) for (let k = 3; k < 6; k++) binBox[b * 6 + k] = -Infinity;
    binN.fill(0);
    for (let i = start; i < end; i++) {
      const t = o[i] ?? 0;
      const b = Math.min(
        BINS - 1,
        Math.floor(((cen[t * 3 + axis] ?? 0) - (lo[axis] ?? 0)) * scale),
      );
      binN[b] = (binN[b] ?? 0) + 1;
      for (let k = 0; k < 3; k++) {
        binBox[b * 6 + k] = Math.min(binBox[b * 6 + k] ?? 0, tb[t * 6 + k] ?? 0);
        binBox[b * 6 + 3 + k] = Math.max(binBox[b * 6 + 3 + k] ?? 0, tb[t * 6 + 3 + k] ?? 0);
      }
    }
    const acc = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    let cnt = 0;
    for (let b = BINS - 1; b > 0; b--) {
      cnt += binN[b] ?? 0;
      grow(acc, b);
      rightN[b] = cnt;
      rightArea[b] = cnt > 0 ? boxArea(acc) : 0;
    }
    acc.fill(Infinity, 0, 3);
    acc.fill(-Infinity, 3, 6);
    cnt = 0;
    for (let b = 0; b < BINS - 1; b++) {
      cnt += binN[b] ?? 0;
      grow(acc, b);
      const nr = rightN[b + 1] ?? 0;
      if (cnt === 0 || nr === 0) continue;
      const cost = boxArea(acc) * cnt + (rightArea[b + 1] ?? 0) * nr + parent * 0.125;
      if (cost < best) {
        best = cost;
        pick = [axis, b];
      }
    }
  }
  // Nothing beats a leaf: keep it unless it is too big to scan, then split by count.
  if (!pick && n > LEAF * 4) {
    let axis = 0;
    for (let k = 1; k < 3; k++)
      if ((hi[k] ?? 0) - (lo[k] ?? 0) > (hi[axis] ?? 0) - (lo[axis] ?? 0)) axis = k;
    return (hi[axis] ?? 0) > (lo[axis] ?? 0) ? [axis, (BINS >> 1) - 1] : [axis, -1];
  }
  return pick;
}

function grow(acc: number[], b: number): void {
  for (let k = 0; k < 3; k++) {
    acc[k] = Math.min(acc[k] ?? 0, binBox[b * 6 + k] ?? 0);
    acc[k + 3] = Math.max(acc[k + 3] ?? 0, binBox[b * 6 + 3 + k] ?? 0);
  }
}

function boxArea(a: readonly number[]): number {
  const x = (a[3] ?? 0) - (a[0] ?? 0);
  const y = (a[4] ?? 0) - (a[1] ?? 0);
  const z = (a[5] ?? 0) - (a[2] ?? 0);
  return x * y + y * z + z * x;
}
