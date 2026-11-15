// Rank and monotone statistics for the calibrated critique: pool-adjacent-violators isotonic
// regression, piecewise-linear evaluation of its knots, and Spearman rank correlation. Pure.

/** Pool-adjacent-violators: the best non-decreasing fit of ys over xs (sorted by x, ties pooled). */
export function isotonic(
  xs: readonly number[],
  ys: readonly number[],
  increasing: boolean,
): [number, number][] {
  const order = xs.map((_, i) => i).sort((a, b) => (xs[a] ?? 0) - (xs[b] ?? 0) || a - b);
  const blocks: { x: number; y: number; w: number }[] = [];
  for (const i of order) {
    const x = xs[i] ?? 0;
    const y = (increasing ? 1 : -1) * (ys[i] ?? 0);
    const last = blocks[blocks.length - 1];
    if (last && last.x === x) {
      last.y = (last.y * last.w + y) / (last.w + 1);
      last.w++;
    } else blocks.push({ x, y, w: 1 });
    while (blocks.length > 1) {
      const b = blocks[blocks.length - 1];
      const a = blocks[blocks.length - 2];
      if (!a || !b || a.y <= b.y) break;
      const w = a.w + b.w;
      blocks.splice(-2, 2, { x: (a.x * a.w + b.x * b.w) / w, y: (a.y * a.w + b.y * b.w) / w, w });
    }
  }
  return blocks.map((b) => [b.x, (increasing ? 1 : -1) * b.y]);
}

/** Piecewise-linear through the knots, clamped at both ends. */
export function knotValue(knots: readonly (readonly [number, number])[], x: number): number {
  const first = knots[0];
  if (!first) return 0;
  if (x <= first[0]) return first[1];
  for (let k = 1; k < knots.length; k++) {
    const [x1, y1] = knots[k] ?? first;
    const [x0, y0] = knots[k - 1] ?? first;
    if (x <= x1) return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return (knots[knots.length - 1] ?? first)[1];
}

const ranks = (v: readonly number[]): number[] => {
  const order = v.map((_, i) => i).sort((a, b) => (v[a] ?? 0) - (v[b] ?? 0) || a - b);
  const r = new Array<number>(v.length).fill(0);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && v[order[j + 1] ?? 0] === v[order[i] ?? 0]) j++;
    for (let k = i; k <= j; k++) r[order[k] ?? 0] = (i + j) / 2;
    i = j + 1;
  }
  return r;
};

/** Spearman rank correlation (average ranks for ties); 0 when either side is constant. */
export function spearman(a: readonly number[], b: readonly number[]): number {
  const [ra, rb] = [ranks(a), ranks(b)];
  const mean = (r: number[]): number => r.reduce((s, x) => s + x, 0) / (r.length || 1);
  const [ma, mb] = [mean(ra), mean(rb)];
  let [num, da, db] = [0, 0, 0];
  for (let i = 0; i < ra.length; i++) {
    const [x, y] = [(ra[i] ?? 0) - ma, (rb[i] ?? 0) - mb];
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}
