// Silhouette fit for the LOD2 pads: a tiny orthographic rasteriser (pixel centres inside the
// triangle, holes flood-filled from the border, like QA's solid masks) draws LOD0's needle tufts
// and the pads from eight views around the crown (four level, four from 18° above), then
// coordinate descent scales each pad — plan and height separately — to maximise the mean IoU.
// The fit sees every side, not just QA's three views, so LOD2 holds from wherever it is seen.

import type { Mesh, Vec3 } from '@developerz.ai/ts23d';
import { type Pad, type PadOptions, padFaces } from './impostor.ts';

/** Raster pixel, metres, and the box filter after hole filling: 4 × 0.2 m ≈ the 0.8 m a pixel of
 * QA's 32 px thumbnail spans on a 25 m tree, so the fit weighs what a distant viewer sees. */
const PX = 0.2;
const BOX = 4;
const VIEWS: readonly (readonly [number, number])[] = [
  [0, 0],
  [45, 0],
  [90, 0],
  [135, 0],
  [-35, 18],
  [55, 18],
  [145, 18],
  [235, 18],
];
const STEPS = [0.8, 0.9, 1.1, 1.25];
const GLOBAL = [0.9, 1.1, 1.2, 1.3, 1.4];
const PASSES = 2;

type Tri = readonly [Vec3, Vec3, Vec3];

interface View {
  readonly r: Vec3;
  readonly u: Vec3;
  readonly x0: number;
  readonly y0: number;
  readonly w: number;
  readonly h: number;
}

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function views(bounds: { min: Vec3; max: Vec3 }): View[] {
  const c: Vec3 = [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
  const rad = Math.hypot(
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  );
  const half = rad * 0.55;
  return VIEWS.map(([az, el]) => {
    const [ca, sa, ce, se] = [az, az, el, el].map((d, i) =>
      i % 2 === 0 ? Math.cos((d * Math.PI) / 180) : Math.sin((d * Math.PI) / 180),
    ) as [number, number, number, number];
    const r: Vec3 = [-sa, ca, 0];
    const u: Vec3 = [-se * ca, -se * sa, ce];
    const n = Math.ceil((2 * half) / (PX * BOX)) * BOX;
    return { r, u, x0: dot(c, r) - half, y0: dot(c, u) - half, w: n, h: n };
  });
}

/** Adds `delta` to every pixel whose centre a triangle covers (counts, so a pad can be undone). */
function raster(v: View, tris: readonly Tri[], into: Int16Array, delta: number): void {
  for (const [a, b, c] of tris) {
    const p = [a, b, c].map((q): [number, number] => [
      (dot(q, v.r) - v.x0) / PX,
      (dot(q, v.u) - v.y0) / PX,
    ]);
    const [p0, p1, p2] = p as [[number, number], [number, number], [number, number]];
    const area = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]);
    if (Math.abs(area) < 1e-9) continue;
    const xa = Math.max(0, Math.floor(Math.min(p0[0], p1[0], p2[0])));
    const xb = Math.min(v.w - 1, Math.ceil(Math.max(p0[0], p1[0], p2[0])));
    const ya = Math.max(0, Math.floor(Math.min(p0[1], p1[1], p2[1])));
    const yb = Math.min(v.h - 1, Math.ceil(Math.max(p0[1], p1[1], p2[1])));
    for (let y = ya; y <= yb; y++)
      for (let x = xa; x <= xb; x++) {
        const [px, py] = [x + 0.5, y + 0.5];
        const w0 = ((p1[0] - px) * (p2[1] - py) - (p2[0] - px) * (p1[1] - py)) / area;
        const w1 = ((p2[0] - px) * (p0[1] - py) - (p0[0] - px) * (p2[1] - py)) / area;
        if (w0 >= 0 && w1 >= 0 && w0 + w1 <= 1)
          into[y * v.w + x] = (into[y * v.w + x] ?? 0) + delta;
      }
  }
}

/** Background not reachable from the border becomes inside (4-connected flood fill). */
function fill(m: Int16Array, w: number, h: number): Uint8Array {
  const n = w * h;
  // 0 = background not yet reached, 1 = covered, 2 = background reached from the border.
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (m[i] ?? 0) > 0 ? 1 : 0;
  const stack = new Int32Array(n);
  let top = 0;
  const push = (i: number): void => {
    if (out[i] === 0) {
      out[i] = 2;
      stack[top++] = i;
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (top > 0) {
    const i = stack[--top] ?? 0;
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < n - w) push(i + w);
  }
  for (let i = 0; i < n; i++) out[i] = out[i] === 2 ? 0 : 1;
  return out;
}

/** Coverage 0–1 per BOX×BOX block. */
function soft(m: Uint8Array, w: number, h: number): Float32Array {
  const [W, H] = [w / BOX, h / BOX];
  const out = new Float32Array(W * H);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = Math.floor(y / BOX) * W + Math.floor(x / BOX);
      out[i] = (out[i] ?? 0) + (m[y * w + x] ?? 0) / (BOX * BOX);
    }
  return out;
}

function trisOf(m: Mesh): Tri[] {
  const at = (i: number): Vec3 => [
    m.positions[i * 3] ?? 0,
    m.positions[i * 3 + 1] ?? 0,
    m.positions[i * 3 + 2] ?? 0,
  ];
  const out: Tri[] = [];
  for (let t = 0; t + 2 < m.indices.length; t += 3)
    out.push([at(m.indices[t] ?? 0), at(m.indices[t + 1] ?? 0), at(m.indices[t + 2] ?? 0)]);
  return out;
}

const scaled = (p: Pad, sh: number, sv: number): Pad => ({
  ...p,
  a: p.a * sh,
  b: p.b * sh,
  h: p.h * sv,
});

/** Pads rescaled to LOD0's silhouette; returns them with the mean IoU over the eight views. */
export function fitPads(
  pads: readonly Pad[],
  leaves: Mesh,
  o: Pick<PadOptions, 'sides' | 'rings'>,
): { pads: Pad[]; iou: number } {
  const target = trisOf(leaves);
  const lo: [number, number, number] = [Infinity, Infinity, Infinity];
  const hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const t of target)
    for (const q of t)
      for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k] ?? 0, q[k] ?? 0);
        hi[k] = Math.max(hi[k] ?? 0, q[k] ?? 0);
      }
  const vs = views({ min: lo, max: hi });
  const want = vs.map((v) => {
    const m = new Int16Array(v.w * v.h);
    raster(v, target, m, 1);
    return soft(fill(m, v.w, v.h), v.w, v.h);
  });
  // Pad coverage counts per view: changing one pad is remove + add, not a full redraw.
  const counts = vs.map((v) => new Int16Array(v.w * v.h));
  const faces = (p: Pad): Tri[] => padFaces(p, o).map(([a, b, c]): Tri => [a, b, c]);
  const draw = (p: Pad, delta: number): void => {
    const tris = faces(p);
    for (const [k, v] of vs.entries()) raster(v, tris, counts[k] ?? new Int16Array(0), delta);
  };
  const score = (): number => {
    let sum = 0;
    for (const [k, v] of vs.entries()) {
      const got = soft(fill(counts[k] ?? new Int16Array(0), v.w, v.h), v.w, v.h);
      const ref = want[k] ?? got;
      let inter = 0;
      let union = 0;
      for (let i = 0; i < got.length; i++) {
        inter += Math.min(got[i] ?? 0, ref[i] ?? 0);
        union += Math.max(got[i] ?? 0, ref[i] ?? 0);
      }
      sum += union > 0 ? inter / union : 1;
    }
    return sum / vs.length;
  };
  /** Swap pad `i` for `next`; keep it if the score rises, else swap back. */
  const tryPad = (cur: Pad[], i: number, next: Pad, best: number): number => {
    const old = cur[i];
    if (!old) return best;
    draw(old, -1);
    draw(next, 1);
    const v = score();
    if (v > best + 1e-6) {
      cur[i] = next;
      return v;
    }
    draw(next, -1);
    draw(old, 1);
    return best;
  };
  // Whole crown first (a full redraw per trial), then pad by pad.
  let cur = [...pads];
  for (const p of cur) draw(p, 1);
  let best = score();
  for (const s of GLOBAL) {
    for (const p of cur) draw(p, -1);
    const next = pads.map((p) => scaled(p, s, s));
    for (const p of next) draw(p, 1);
    const v = score();
    if (v > best + 1e-6) {
      best = v;
      cur = next;
    } else {
      for (const p of next) draw(p, -1);
      for (const p of cur) draw(p, 1);
    }
  }
  for (let pass = 0; pass < PASSES; pass++)
    for (let i = 0; i < cur.length; i++)
      for (const axis of [0, 1] as const)
        for (const s of STEPS) {
          const p = cur[i];
          if (p) best = tryPad(cur, i, axis === 0 ? scaled(p, s, 1) : scaled(p, 1, s), best);
        }
  return { pads: cur, iou: best };
}
