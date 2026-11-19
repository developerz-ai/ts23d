// The lift bound of a strand card: how far a card may stand off the skin. A card declares a lift
// angle at the root and loses `bend` of it by the tip, so over a flat skin point k stands
// `riseOf(...)[k]` above it. On a curved surface a step that is not held runs off: a root on an
// up-facing shelf combed downward (a lip, a brow ridge) sends its card flat across the shelf,
// over the edge and straight out of the face. A strand has no stiffness to stand higher than its
// lift, so `hold` turns such a step about its start until the point is within its rise again:
// onto the skin where the skin holds hair up, straight down where it has turned under (past an
// edge the strand hangs). Hanging is not standing proud: a point may be as far from the skin as
// it is below its root (a beard under the chin, hair falling off the crown). Half a card width
// by the tip is allowed on top: a polyline over a convex skin stands that far off by itself.
// `holdLine` does the same for a finished line.

import { sub, normalize as unit, type Vec3 } from '../core/index.ts';
import { gradient, mad } from './hair-roots.ts';

type Field = (p: Vec3) => number;

/**
 * Allowed height of each point of a card of `len` in `segs` steps (index 0 = root, 0): its rise
 * over a flat skin at this lift and bend, plus `slack` (half the card width) reached by the tip.
 */
export function riseOf(
  len: number,
  segs: number,
  lift: number,
  bend: number,
  slack: number,
): number[] {
  const flat = [0];
  for (let k = 1; k <= segs; k++)
    flat.push((flat[k - 1] ?? 0) + (len / segs) * Math.sin(lift * (1 - (bend * (k - 1)) / segs)));
  return flat.map((r, k) => r + (slack * k) / segs);
}

/** The same support as `lie` (hair-strand.ts): 1 facing up, 0.6 sideways, 0 from 35° under. */
const support = (n: Vec3): number => Math.min(1, Math.max(0, 0.6 + n[2]));

/**
 * A strand rooted on skin that holds it up (`n0`) and now `near` (0..1) skin that has turned
 * under (`n`) has run over an edge: it hangs from there, its direction `d` turned toward straight
 * down. Without this the next step is laid on the overhang's tangent plane, where a strand still
 * rising from its lift is sent up and out of the face. Roots under a chin or a belly are not
 * touched (their skin never held them up).
 */
export function hang(d: Vec3, n: Vec3, n0: Vec3, near: number): Vec3 {
  const w = near * Math.min(1, support(n0) / 0.3) * (1 - Math.min(1, support(n) / 0.3));
  return w > 0 ? unit([d[0] * (1 - w), d[1] * (1 - w), d[2] * (1 - w) - w]) : d;
}

/** How far outside the solids a root already is (0 for a buried one): a field that is no true
 *  distance can read a root as proud, and its card must not be dropped for that. */
export const rootOff = (f: Field, collide: Field | undefined, root: Vec3): number =>
  Math.max(0, Math.min(f(root), collide ? collide(root) : Infinity));

/** Distance of q from the nearer solid, less how far it hangs below `root`. */
function proud(f: Field, collide: Field | undefined, root: Vec3, q: Vec3): number {
  return Math.min(f(q), collide ? collide(q) : Infinity) - Math.max(0, root[2] - q[2]);
}

/** The step p → q turned (length kept) until q is at most `allowed` proud: toward the skin where
 *  it holds hair up (facing up or sideways), toward straight down where it has turned under. */
export function hold(
  f: Field,
  collide: Field | undefined,
  root: Vec3,
  p: Vec3,
  q: Vec3,
  allowed: number,
  h: number,
): Vec3 {
  if (proud(f, collide, root, q) <= allowed) return q;
  const v = sub(q, p);
  const step = Math.hypot(v[0], v[1], v[2]);
  if (step < 1e-9) return q;
  const d = unit(v);
  const n = gradient(collide && collide(q) < f(q) ? collide : f, q, h);
  const s = support(n);
  const to = unit([-n[0] * s, -n[1] * s, -n[2] * s - (1 - s)]);
  const turned = (t: number): Vec3 => {
    const w: Vec3 = [
      d[0] * (1 - t) + to[0] * t,
      d[1] * (1 - t) + to[1] * t,
      d[2] * (1 - t) + to[2] * t,
    ];
    // Exactly opposed (a strand straight off the skin): no side to turn by, keep the target.
    return mad(p, Math.hypot(w[0], w[1], w[2]) < 1e-6 ? to : unit(w), step);
  };
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (proud(f, collide, root, turned(mid)) <= allowed) hi = mid;
    else lo = mid;
  }
  return turned(hi);
}

/** `hold` along a finished line, root first: point k at most `rise[k]` + its floor proud. */
export function holdLine(
  line: readonly Vec3[],
  f: Field | undefined,
  collide: Field | undefined,
  rise: readonly number[],
  floor: number,
  h: number,
): Vec3[] {
  if (!f) return [...line];
  const n = line.length - 1;
  const root = line[0] ?? [0, 0, 0];
  const out: Vec3[] = [root];
  const off = rootOff(f, collide, root);
  for (let k = 1; k <= n; k++) {
    const p = out[k - 1] ?? root;
    // Carry the turn on: the next point keeps its offset from this one.
    const q = mad(p, sub(line[k] ?? p, line[k - 1] ?? p), 1);
    out.push(hold(f, collide, root, p, q, off + (rise[k] ?? 0) + floor * (k / n), h));
  }
  return out;
}
