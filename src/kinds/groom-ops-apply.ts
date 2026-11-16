// Groom ops applied to guide curves in TypeScript (the CPU tier's guides, and the guides the
// Blender groom task interpolates its children from): each op edits every guide by its region
// weight, in list order; roots never move off the scalp (slide re-buries them) and, with a scalp
// `field`, no point past the root ends up inside it. Deterministic: draws come from `createRng`
// seeded by the op's `seed` and the guide's index. Stage 'guide' skips the strand ops (pinch,
// clump, curl, frizz) that Blender applies to the dense children instead.

import { createRng, cross, dot, normalize, sub, type Vec3 } from '../core/index.ts';
import {
  checkGroomOps,
  type GroomField,
  type GroomGuide,
  type GroomOp,
  isStrandOp,
  opMask,
} from './groom-ops.ts';

export interface ApplyGroomOptions {
  readonly zones?: Readonly<Record<string, GroomField>>;
  /** The scalp (negative inside): edited points stay ≥ 1 mm out of it, slid roots stay buried. */
  readonly field?: GroomField;
  /** 'all' (CPU tier, default) or 'guide' (leave strand ops to the Blender children). */
  readonly stage?: 'all' | 'guide';
}

type P = Vec3[];
const mad = (a: Vec3, b: Vec3, s: number): Vec3 => [
  a[0] + b[0] * s,
  a[1] + b[1] * s,
  a[2] + b[2] * s,
];
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => mad(a, sub(b, a), t);
const dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const at = (p: P, i: number): Vec3 => p[Math.max(0, Math.min(p.length - 1, i))] ?? [0, 0, 0];

/** Arc length of a polyline. */
export const curveLength = (p: readonly Vec3[]): number =>
  p.slice(1).reduce((s, q, i) => s + dist(at(p as P, i), q), 0);

/** `n` points evenly spaced by arc length along the first `len` metres of `p`. */
export function resample(p: readonly Vec3[], n: number, len = curveLength(p)): P {
  const out: P = [];
  let seg = 0;
  let acc = 0;
  for (let k = 0; k < n; k++) {
    const want = (len * k) / Math.max(1, n - 1);
    while (seg < p.length - 2 && acc + dist(at(p as P, seg), at(p as P, seg + 1)) < want) {
      acc += dist(at(p as P, seg), at(p as P, seg + 1));
      seg++;
    }
    const a = at(p as P, seg);
    const b = at(p as P, seg + 1);
    const l = dist(a, b);
    out.push(l > 1e-12 ? lerp(a, b, Math.min(1, (want - acc) / l)) : a);
  }
  return out;
}

const grad = (f: GroomField, p: Vec3): Vec3 => {
  const h = 5e-4;
  return normalize([
    f([p[0] + h, p[1], p[2]]) - f([p[0] - h, p[1], p[2]]),
    f([p[0], p[1] + h, p[2]]) - f([p[0], p[1] - h, p[2]]),
    f([p[0], p[1], p[2] + h]) - f([p[0], p[1], p[2] - h]),
  ]);
};

/** Points past the root pushed 1 mm out of the scalp. */
const collide = (p: P, f?: GroomField): P =>
  f ? p.map((q, k) => (k === 0 || f(q) >= 0.001 ? q : mad(q, grad(f, q), 0.001 - f(q)))) : p;

/** Rebuild from the root with each segment turned by `turn(dir, s)` (lengths kept). */
function steer(p: P, turn: (d: Vec3, s: number) => Vec3): P {
  const out: P = [at(p, 0)];
  for (let k = 1; k < p.length; k++) {
    const d = sub(at(p, k), at(p, k - 1));
    const l = Math.hypot(...d);
    out.push(mad(at(out, k - 1), normalize(turn(normalize(d), (k - 1) / (p.length - 1))), l));
  }
  return out;
}

/** k-means of roots into `k` locks: farthest-point seeds from a seeded start, 4 Lloyd steps. */
export function lockOf(guides: readonly GroomGuide[], k: number, seed: number): number[] {
  const roots = guides.map((g) => at(g.points as P, 0));
  if (roots.length === 0) return [];
  const centres: Vec3[] = [at(roots, createRng(seed).int(0, roots.length - 1))];
  while (centres.length < Math.min(k, roots.length)) {
    let best = 0;
    let far = -1;
    roots.forEach((r, i) => {
      const d = Math.min(...centres.map((c) => dist(r, c)));
      if (d > far) [far, best] = [d, i];
    });
    centres.push(at(roots, best));
  }
  let lock = roots.map(() => 0);
  for (let it = 0; it < 4; it++) {
    lock = roots.map((r) =>
      centres.reduce((b, c, j) => (dist(r, c) < dist(r, at(centres, b)) ? j : b), 0),
    );
    centres.forEach((_, j) => {
      const m = roots.filter((_, i) => lock[i] === j);
      if (m.length) centres[j] = m.reduce((s, r) => mad(s, r, 1 / m.length), [0, 0, 0] as Vec3);
    });
  }
  return lock;
}

function gather(
  gs: GroomGuide[],
  op: GroomOp & { op: 'pinch' | 'clump' },
  w: number[],
): GroomGuide[] {
  const lock = lockOf(gs, op.locks, op.seed ?? 0);
  const n = Math.max(...gs.map((g) => g.points.length));
  const curves = gs.map((g) => resample(g.points, n));
  const mean = new Map<number, P>();
  curves.forEach((c, i) => {
    const l = lock[i] ?? 0;
    const m = lock.filter((x) => x === l).length;
    const acc = mean.get(l) ?? c.map((): Vec3 => [0, 0, 0]);
    mean.set(
      l,
      acc.map((q, k) => mad(q, at(c, k), 1 / m)),
    );
  });
  // Clump pulls the whole length (root free), pinch the tips hardest: a pointed lock.
  const ramp = (s: number): number => (op.op === 'clump' ? s ** 0.7 : s * s);
  return gs.map((g, i) => {
    const c = curves[i] ?? [];
    const m = mean.get(lock[i] ?? 0) ?? c;
    const a = op.strength * (w[i] ?? 0);
    return { ...g, points: c.map((q, k) => lerp(q, at(m, k), a * ramp(k / (n - 1)))) };
  });
}

/** Unit frame across a curve at each point, parallel-transported from the root normal. */
function frames(p: P, n: Vec3): Vec3[] {
  let e = normalize(cross(n, sub(at(p, 1), at(p, 0))));
  if (Math.hypot(...e) < 0.5) e = [0, 1, 0];
  return p.map((_, k) => {
    const t = normalize(sub(at(p, k + 1), at(p, k - 1)));
    e = normalize(mad(e, t, -dot(e, t)));
    return e;
  });
}

function one(gs: GroomGuide[], op: GroomOp, o: ApplyGroomOptions): GroomGuide[] {
  const w = opMask(op, gs, o.zones);
  const f = o.field;
  const map = (fn: (g: GroomGuide, w: number, i: number) => P): GroomGuide[] =>
    gs.map((g, i) => ((w[i] ?? 0) > 0 ? { ...g, points: collide(fn(g, w[i] ?? 0, i), f) } : g));
  const rng = (i: number) => createRng(('seed' in op ? op.seed : undefined) ?? 0).fork(`g${i}`);
  switch (op.op) {
    case 'comb': {
      // Strongest at the root, a third by the tip: the comb sets where hair leaves the scalp,
      // the free length still hangs (combing long hair back must not lift it off the back).
      const t = normalize(op.toward);
      return map((g, a) =>
        steer([...g.points], (d, s) => lerp(d, t, op.strength * a * (1 - (2 / 3) * s))),
      );
    }
    case 'puff':
      return map((g, a) =>
        steer([...g.points], (d, s) => lerp(d, g.normal, op.amount * a * (1 - s) ** 2)),
      );
    case 'cut':
      return gs.flatMap((g, i) => {
        const a = w[i] ?? 0;
        if (a <= 0) return [g];
        let len = curveLength(g.points);
        if (op.length !== undefined) len -= (len - Math.min(len, op.length)) * a;
        const pl = op.plane;
        if (pl) {
          const nn = normalize(pl.normal);
          const side = (q: Vec3): number => dot(sub(q, pl.at), nn);
          if (side(at(g.points as P, 0)) > 0) return a > 0.5 ? [] : [g];
          let acc = 0;
          for (let k = 1; k < g.points.length; k++) {
            const [p, q] = [at(g.points as P, k - 1), at(g.points as P, k)];
            if (side(q) > 0) {
              len = Math.min(len, acc + dist(p, q) * (side(p) / (side(p) - side(q))));
              break;
            }
            acc += dist(p, q);
          }
        }
        return [{ ...g, points: resample(g.points, g.points.length, Math.max(1e-3, len)) }];
      });
    case 'grow':
    case 'shrink':
      return map((g, a) => {
        const k = 1 + (op.factor - 1) * a;
        return steer([...g.points], (d) => d).map((q, j, all) =>
          j === 0 ? q : mad(at(all, 0), sub(q, at(all, 0)), k),
        );
      });
    case 'pinch':
    case 'clump':
      return gather(gs, op, w).map((g, i) =>
        (w[i] ?? 0) > 0 ? { ...g, points: collide([...g.points], f) } : (gs[i] ?? g),
      );
    case 'curl':
      return map((g, a, i) => {
        const p = [...g.points];
        const e1 = frames(p, g.normal);
        const phase = rng(i).next() * Math.PI * 2;
        return p.map((q, k) => {
          const s = k / (p.length - 1);
          const t = normalize(sub(at(p, k + 1), at(p, k - 1)));
          const e = at(e1, k);
          const th = Math.PI * 2 * op.turns * s + phase;
          const r = op.radius * a * Math.min(1, s * 4);
          return mad(mad(q, e, r * Math.cos(th)), cross(t, e), r * Math.sin(th));
        });
      });
    case 'frizz':
      return map((g, a, i) => {
        const r = rng(i);
        const g3 = (): number => r.next() + r.next() + r.next() - 1.5;
        return g.points.map((q, k) => {
          const s = (op.amount * a * k) / (g.points.length - 1);
          return k === 0 ? q : mad(q, [g3(), g3(), g3()], s);
        });
      });
    case 'smooth':
      return map((g, a) => {
        let p = [...g.points];
        for (let it = 0; it < op.iterations; it++)
          p = p.map((q, k) =>
            k === 0 || k === p.length - 1
              ? q
              : lerp(q, lerp(at(p, k - 1), at(p, k + 1), 0.5), 0.5 * a),
          );
        return p;
      });
    case 'density':
      return gs;
    case 'slide':
      return map((g, a) => {
        const v = mad(op.by, g.normal, -dot(op.by, g.normal));
        let p = g.points.map((q) => mad(q, v, a));
        // Re-bury the root at the depth it had: the guide slides along the scalp, not off it.
        if (f) {
          const r0 = at(g.points as P, 0);
          const r1 = at(p, 0);
          const fix = mad([0, 0, 0], grad(f, r1), f(r0) - f(r1));
          p = p.map((q) => mad(q, fix, 1));
        }
        return p;
      });
    case 'add': {
      const pool = gs.filter((_, i) => (w[i] ?? 0) > 0.5);
      if (pool.length < 2) return gs;
      const r = rng(0);
      const born: GroomGuide[] = [];
      for (let k = 0; k < op.count; k++) {
        const a = pool[r.int(0, pool.length - 1)] ?? gs[0];
        if (!a) break;
        const ra = at(a.points as P, 0);
        // Its nearest pool neighbour: the new guide is born between two that already agree.
        const near = (c: GroomGuide): number =>
          c === a ? Infinity : dist(at(c.points as P, 0), ra);
        const b = pool.reduce((best, c) => (near(c) < near(best) ? c : best), a);
        const u = r.next();
        const n = Math.max(a.points.length, b.points.length);
        const pa = resample(a.points, n);
        const pb = resample(b.points, n);
        born.push({
          normal: normalize(lerp(a.normal, b.normal, u)),
          points: pa.map((q, j) => lerp(q, at(pb, j), u)),
        });
      }
      return [...gs, ...born];
    }
    case 'delete': {
      const r = rng(0);
      return gs.filter((_, i) => {
        const inside = op.region === undefined || (w[i] ?? 0) > 0.5;
        const draw = op.fraction === undefined ? 0 : r.next();
        return !(inside && (op.fraction === undefined || draw < op.fraction));
      });
    }
  }
}

/** The guides after every op in order (validated first); stage 'guide' skips strand ops. */
export function applyGroomOps(
  guides: readonly GroomGuide[],
  ops: readonly GroomOp[],
  o: ApplyGroomOptions = {},
): GroomGuide[] {
  checkGroomOps(ops, o.zones);
  let gs = [...guides];
  for (const op of ops) if (o.stage !== 'guide' || !isStrandOp(op)) gs = one(gs, op, o);
  return gs;
}
