// Slits in one depth view: a narrow band of pixels that drops far deeper than the surface on BOTH
// sides of it — the dark line of a door that stops short of its header, a panel that misses its
// frame, a seam you see light through. Scanned along rows and columns; sliding-window minima keep
// it linear in pixels. Each connected run with the same pair of rim parts becomes one Slit.

import { type DepthView, pixelToWorld } from './depth-views.ts';

export interface SlitOptions {
  /** Widest opening still called a slit, metres. */
  readonly maxWidth: number;
  /** Narrowest opening reported, metres (hairline seams below this are fine). */
  readonly minWidth: number;
  /** The floor must sit at least this far behind both rims, metres. */
  readonly minDepth: number;
  /** Shortest slit reported, metres. */
  readonly minLength: number;
  /** Each rim must be solid surface this far out from the slit, metres: a crack between two
   *  panels counts, the space beside a rod, a ladder rung or a leaf card does not. */
  readonly rimSpan: number;
  /** Rims further apart in depth than this are two layers overlapping in view, not a crack
   *  between neighbours, metres. */
  readonly maxStep: number;
}

export interface Slit {
  /** Part indices on the two rims (sorted). */
  readonly rims: readonly [number, number];
  /** Part index at the bottom of the slit, −1 when you see straight through the asset. */
  readonly floor: number;
  /** Opening across the slit, metres (median over its pixels). */
  readonly width: number;
  /** Along the slit, metres. */
  readonly length: number;
  /** How far behind the nearer rim the floor lies, metres (Infinity = see-through). */
  readonly depth: number;
  /** How far one rim stands proud of the other, metres (median): 0 = flush panels. */
  readonly step: number;
  /** World centre of the opening, at rim depth. */
  readonly at: readonly [number, number, number];
  /** Pixel indices in the view, for overlays. */
  readonly pixels: readonly number[];
}

/** Reused per view: one line of depths, its window minima both ways, and a deque. */
interface Scratch {
  readonly line: Float32Array;
  readonly back: Float32Array;
  readonly fwd: Float32Array;
  readonly q: Int32Array;
}

/** out[i] = min of line[i−k … i−1] (dir +1) or line[i+1 … i+k] (dir −1); monotonic deque. */
function windowMin(s: Scratch, n: number, k: number, dir: 1 | -1, out: Float32Array): void {
  const { line, q } = s;
  let head = 0;
  let tail = 0;
  for (let j = 0; j < n; j++) {
    const i = dir > 0 ? j : n - 1 - j;
    while (head < tail && Math.abs((q[head] ?? 0) - i) > k) head++;
    out[i] = head < tail ? (line[q[head] ?? 0] ?? Infinity) : Infinity;
    const x = line[i] ?? Infinity;
    while (tail > head && (line[q[tail - 1] ?? 0] ?? Infinity) >= x) tail--;
    q[tail++] = i;
  }
}

interface Hit {
  width: number;
  rimA: number;
  rimB: number;
  rimDepth: number;
  step: number;
}

/** `span` pixels from `from` outward (step ±1) all stay at least minDepth above the floor. */
function solidRim(
  line: Float32Array,
  from: number,
  step: 1 | -1,
  need: number,
  span: number,
): boolean {
  for (let j = 0; j < span; j++) {
    const d = line[from + j * step];
    if (d === undefined || d > need) return false;
  }
  return true;
}

/** Scan one line (row or column: pixels start + i·stride); record slit pixels into `hits`. */
function scanLine(
  view: DepthView,
  start: number,
  stride: number,
  n: number,
  k: number,
  o: SlitOptions,
  s: Scratch,
  hits: Map<number, Hit>,
): void {
  const { depth, part, px } = view;
  const span = Math.max(1, Math.round(o.rimSpan / px));
  const { line, back, fwd } = s;
  for (let i = 0; i < n; i++) line[i] = depth[start + i * stride] ?? Infinity;
  windowMin(s, n, k, 1, back);
  windowMin(s, n, k, -1, fwd);
  for (let i = 0; i < n; i++) {
    const d = line[i] ?? Infinity;
    // A see-through pixel (Infinity) needs finite rims; Infinity − x would accept empty ones.
    const need = d === Infinity ? Number.MAX_VALUE : d - o.minDepth;
    if (!((back[i] ?? Infinity) <= need && (fwd[i] ?? Infinity) <= need)) continue;
    let l = i - 1;
    while (l >= 0 && (line[l] ?? Infinity) > need) l--;
    let r = i + 1;
    while (r < n && (line[r] ?? Infinity) > need) r++;
    const width = (r - l - 1) * px;
    if (width < o.minWidth || width > o.maxWidth) continue;
    const dl = line[l] ?? 0;
    const dr = line[r] ?? 0;
    if (Math.abs(dl - dr) > o.maxStep) continue;
    if (!solidRim(line, l, -1, need, span) || !solidRim(line, r, 1, need, span)) continue;
    const at = start + i * stride;
    const prev = hits.get(at);
    if (prev && prev.width <= width) continue; // keep the narrower reading (across, not along)
    const a = part[start + l * stride] ?? -1;
    const b = part[start + r * stride] ?? -1;
    hits.set(at, {
      width,
      rimA: Math.min(a, b),
      rimB: Math.max(a, b),
      rimDepth: Math.max(dl, dr),
      step: Math.abs(dl - dr),
    });
  }
}

export function findSlits(view: DepthView, o: SlitOptions): Slit[] {
  const { width: w, height: h, depth, part, px } = view;
  const k = Math.max(1, Math.ceil(o.maxWidth / px));
  const hits = new Map<number, Hit>();
  const n = Math.max(w, h);
  const scratch: Scratch = {
    line: new Float32Array(n),
    back: new Float32Array(n),
    fwd: new Float32Array(n),
    q: new Int32Array(n),
  };
  for (let y = 0; y < h; y++) scanLine(view, y * w, 1, w, k, o, scratch, hits);
  for (let x = 0; x < w; x++) scanLine(view, x, w, h, k, o, scratch, hits);
  // Connected runs (4-neighbour) sharing a rim pair; visit pixels in index order (deterministic).
  const seen = new Set<number>();
  const out: Slit[] = [];
  for (const start of [...hits.keys()].sort((a, b) => a - b)) {
    const s = hits.get(start);
    if (!s || seen.has(start)) continue;
    const run: number[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length > 0) {
      const p = stack.pop() ?? 0;
      run.push(p);
      const x = p % w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        const t = hits.get(q);
        if (q < 0 || q >= w * h || !t || seen.has(q) || t.rimA !== s.rimA || t.rimB !== s.rimB)
          continue;
        seen.add(q);
        stack.push(q);
      }
    }
    const widths = run.map((p) => hits.get(p)?.width ?? 0).sort((a, b) => a - b);
    const width = widths[widths.length >> 1] ?? 0;
    const steps = run.map((p) => hits.get(p)?.step ?? 0).sort((a, b) => a - b);
    const length = (run.length * px * px) / Math.max(width, px);
    if (length < o.minLength) continue;
    run.sort((a, b) => a - b);
    const mid = run[run.length >> 1] ?? 0;
    const rimDepth = hits.get(mid)?.rimDepth ?? 0;
    const floorDepth = depth[mid] ?? Infinity;
    out.push({
      rims: [s.rimA, s.rimB],
      floor: part[mid] ?? -1,
      width,
      length,
      step: steps[steps.length >> 1] ?? 0,
      depth: floorDepth - rimDepth,
      at: pixelToWorld(view, mid % w, Math.floor(mid / w), rimDepth),
      pixels: run,
    });
  }
  return out;
}
