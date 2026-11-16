// Fold lines from how cloth hangs, walked ON the body so they follow its curvature: `hang` (pipe
// folds falling under gravity from a gathered edge — shoulders, a belt, a pin), `drag` (tension
// folds pulled straight from a pinch toward its anchors — a brooch, a buckle, the armpit), `zigzag`
// (alternating diagonals across a bend — a sleeve's elbow, a waist cinch) and `sag` (nested U folds
// hanging between two anchors — a cowl, a cloak slung across the back). Each returns `Fold`s for
// `foldField`, lifted `lift` metres off the surface (the cloth's thickness).

import type { Fold } from './cloth-folds.ts';
import { add, dot, lerp, mul, norm, type Surface, sub, type V } from './kit.ts';

/** Shared look of a fold family. */
export interface FoldLook {
  /** Ridge height, metres (valleys cut `valley` × this, default 0.7). */
  readonly amp: number;
  /** Half-width of each fold, metres. */
  readonly width: number;
  /** The cloth's thickness: fold lines sit this far off the body surface. */
  readonly lift: number;
  readonly valley?: number;
}

const GRAVITY: V = [0, 0, -1];

/** Walk `length` metres over the surface from `start`, steering by `dir(p)` projected into the
 *  tangent plane, in `steps` steps; the points come back lifted `lift` off the surface. */
export function walk(
  s: Surface,
  start: V,
  dir: (p: V) => V,
  length: number,
  steps: number,
  lift: number,
): V[] {
  const raw: V[] = [s.on(start)];
  const h = length / steps;
  for (let i = 0; i < steps; i++) {
    const p = raw[raw.length - 1] ?? start;
    const n = s.normal(p);
    const d = dir(p);
    const t = sub(d, mul(n, dot(d, n)));
    if (Math.hypot(t[0], t[1], t[2]) < 1e-6) break;
    raw.push(s.on(add(p, mul(norm(t), h))));
  }
  return raw.map((p) => add(p, mul(s.normal(p), lift)));
}

/** Pipe folds hanging from `anchors` (one ridge each, a valley between neighbours), falling
 *  `length[i]` metres along `dir` (default gravity) — fanning out by `fan` (sideways drift per
 *  metre fallen, away from the anchors' centre). */
export function hang(
  s: Surface,
  anchors: readonly V[],
  length: readonly number[],
  look: FoldLook & {
    readonly dir?: V;
    readonly fan?: number;
    /** Width at the bottom ÷ at the top (default 1.6): pipe folds open as they fall. */
    readonly widen?: number;
    /** Fraction faded in at the top and out at the bottom (default [0.2, 0.1]: to the hem). */
    readonly fade?: readonly [number, number];
  },
): Fold[] {
  const g = look.dir ?? GRAVITY;
  const fan = look.fan ?? 0;
  const mid = mul(
    anchors.reduce((a, p) => add(a, p), [0, 0, 0] as V),
    1 / Math.max(anchors.length, 1),
  );
  const fold = (a: V, len: number, amp: number, width: number): Fold => {
    const side = norm(sub(a, mid));
    const steer = (): V => add(g, mul(side, fan));
    const steps = Math.max(4, Math.ceil(len / (width * 0.8)));
    return {
      path: walk(s, a, steer, len, steps, look.lift),
      width,
      amp,
      fade: look.fade ?? [0.2, 0.1],
      widen: look.widen ?? 1.6,
    };
  };
  const out: Fold[] = [];
  anchors.forEach((a, i) => {
    out.push(fold(a, length[i] ?? length[0] ?? 0.05, look.amp, look.width));
    const b = anchors[i + 1];
    if (b) {
      const len = Math.min(length[i] ?? 0.05, length[i + 1] ?? 0.05) * 0.85;
      out.push(fold(lerp(a, b, 0.5), len, -look.amp * (look.valley ?? 0.7), look.width * 0.8));
    }
  });
  return out;
}

/** Tension folds pulled from a pinch `from` toward each anchor in `to`: strongest at the pinch,
 *  dying out before the anchor. */
export function drag(s: Surface, from: V, to: readonly V[], look: FoldLook): Fold[] {
  return to.map((target, i) => {
    const len = Math.hypot(...sub(target, from));
    const steps = Math.max(4, Math.ceil(len / (look.width * 0.8)));
    const path = walk(s, from, (p) => sub(target, p), len, steps, look.lift);
    const valley = i % 2 === 1;
    return {
      path,
      width: look.width * (valley ? 0.8 : 1),
      amp: valley ? -look.amp * (look.valley ?? 0.7) : look.amp,
      fade: [0.08, 0.6],
    };
  });
}

/** Zigzag (diamond) folds across a bend from `a` to `b`: `count` diagonals alternating side to
 *  side `swing` metres either way along `side`, ridges and valleys in turn. */
export function zigzag(
  s: Surface,
  a: V,
  b: V,
  side: V,
  count: number,
  swing: number,
  look: FoldLook,
): Fold[] {
  const u = norm(side);
  return Array.from({ length: count }, (_, i) => {
    const k = i % 2 === 0 ? 1 : -1;
    const p0 = add(lerp(a, b, i / count), mul(u, swing * k));
    const p1 = add(lerp(a, b, (i + 1) / count), mul(u, -swing * k));
    const len = Math.hypot(...sub(p1, p0));
    const path = walk(s, p0, (p) => sub(p1, p), len, 5, look.lift);
    const valley = i % 2 === 1;
    return {
      path,
      width: look.width,
      amp: valley ? -look.amp * (look.valley ?? 0.7) : look.amp,
      fade: [0.3, 0.3],
    };
  });
}

/** Nested U folds hanging between `left` and `right`: `count` curves sagging `depth` × (k + 1) /
 *  count below the chord (along `down`, default gravity), ridges and valleys in turn. */
export function sag(
  s: Surface,
  left: V,
  right: V,
  depth: number,
  count: number,
  look: FoldLook & { readonly down?: V },
): Fold[] {
  const down = norm(look.down ?? GRAVITY);
  return Array.from({ length: count }, (_, k) => {
    const d = (depth * (k + 1)) / count;
    const path = Array.from({ length: 13 }, (_, i): V => {
      const t = i / 12;
      const p = s.on(add(lerp(left, right, t), mul(down, d * Math.sin(Math.PI * t))));
      return add(p, mul(s.normal(p), look.lift));
    });
    const valley = k % 2 === 1;
    return {
      path,
      width: look.width,
      amp: valley ? -look.amp * (look.valley ?? 0.7) : look.amp,
      fade: [0.3, 0.3],
    };
  });
}
