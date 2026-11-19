// How fast a track belt runs in the baked `run` clip: the rim speed of the wheels it rides on.
// Every spinning part whose axle is the belt plane's normal and whose pivot sits inside the loop
// gives one speed (its whole turns over the clip × its rim circumference); the median is the
// belt's, so five road wheels outvote a toothed sprocket. Signed along the path's winding.
// A wheel with no mesh (a far LOD keeps it as an empty pivot) takes its radius from the belt: how
// near the belt's own mesh comes to the axle, which is the face the rim runs on, not the centre
// line half a link further out. So every LOD of one asset runs its belt at one ground speed.

import type { Mesh, Part, Vec3 } from '../core/index.ts';
import { cyclesOf, LOOP_SECONDS, rotateZ, worldTransforms } from '../core/index.ts';
import type { BeltLoop } from '../passes/index.ts';

/** A belt with no wheel to follow runs at this speed along its path's winding (m/s). */
export const FREE_BELT_SPEED = 1;
/** A wheel pivot this far beyond the belt's edge still belongs to it (metres). */
const BESIDE = 0.1;

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** In-plane coordinates of the loop's samples and of a point, for the inside test. */
function inside(loop: BeltLoop, q: Vec3): boolean {
  const b = loop.normal;
  const e1: Vec3 = [loop.t[0] ?? 1, loop.t[1] ?? 0, loop.t[2] ?? 0];
  const e2: Vec3 = [
    b[1] * e1[2] - b[2] * e1[1],
    b[2] * e1[0] - b[0] * e1[2],
    b[0] * e1[1] - b[1] * e1[0],
  ];
  const flat = (p: Vec3): [number, number] => [dot(p, e1), dot(p, e2)];
  const at = (k: number): [number, number] =>
    flat([loop.p[k * 3] ?? 0, loop.p[k * 3 + 1] ?? 0, loop.p[k * 3 + 2] ?? 0]);
  const [x, y] = flat(q);
  let odd = false;
  for (let k = 0; k < loop.n; k++) {
    const [ax, ay] = at(k);
    const [cx, cy] = at((k + 1) % loop.n);
    if (ay > y !== cy > y && x < ax + ((y - ay) / (cy - ay)) * (cx - ax)) odd = !odd;
  }
  return odd;
}

/** Furthest a mesh reaches from its pivot across `axis` (a wheel's rim radius), 0 without a mesh. */
function rimRadius(part: Part, axis: Vec3): number {
  const p = part.mesh?.positions;
  let r2 = 0;
  for (let i = 0; p && i + 2 < p.length; i += 3) {
    const v: Vec3 = [p[i] ?? 0, p[i + 1] ?? 0, p[i + 2] ?? 0];
    r2 = Math.max(r2, dot(v, v) - dot(v, axis) ** 2);
  }
  return Math.sqrt(r2);
}

/**
 * How near the belt's mesh comes to an axle through `pivot` along `axis` (belt-local, unit): the
 * distance, across the axis, to its nearest triangle edge. That is the face a wheel runs on.
 * Infinity for a belt without triangles.
 */
function beltReach(belt: Mesh, pivot: Vec3, axis: Vec3): number {
  const p = belt.positions;
  // Every vertex relative to the pivot, flattened across the axis.
  const flat = new Float64Array(p.length);
  for (let i = 0; i + 2 < p.length; i += 3) {
    const d: Vec3 = [
      (p[i] ?? 0) - pivot[0],
      (p[i + 1] ?? 0) - pivot[1],
      (p[i + 2] ?? 0) - pivot[2],
    ];
    const along = dot(d, axis);
    for (let k = 0; k < 3; k++) flat[i + k] = (d[k] ?? 0) - along * (axis[k] ?? 0);
  }
  let best = Infinity;
  const ix = belt.indices;
  for (let t = 0; t + 2 < ix.length; t += 3)
    for (let e = 0; e < 3; e++) {
      const a = (ix[t + e] ?? 0) * 3;
      const c = (ix[t + ((e + 1) % 3)] ?? 0) * 3;
      const ab: Vec3 = [
        (flat[c] ?? 0) - (flat[a] ?? 0),
        (flat[c + 1] ?? 0) - (flat[a + 1] ?? 0),
        (flat[c + 2] ?? 0) - (flat[a + 2] ?? 0),
      ];
      const from: Vec3 = [flat[a] ?? 0, flat[a + 1] ?? 0, flat[a + 2] ?? 0];
      const l2 = dot(ab, ab);
      const u = l2 > 0 ? Math.min(1, Math.max(0, -dot(from, ab) / l2)) : 0;
      const d2 =
        (from[0] + u * ab[0]) ** 2 + (from[1] + u * ab[1]) ** 2 + (from[2] + u * ab[2]) ** 2;
      if (d2 < best) best = d2;
    }
  return Math.sqrt(best);
}

/**
 * Belt speed along `loop`'s winding in m/s (negative = against it), from the wheels of `parts`
 * that carry `belt`; `FREE_BELT_SPEED` when nothing spins inside the loop.
 */
export function beltSpeed(parts: readonly Part[], belt: Part, loop: BeltLoop): number {
  const world = worldTransforms(parts);
  const home = world.get(belt.name);
  if (!home) return FREE_BELT_SPEED;
  const b = loop.normal;
  const p0: Vec3 = [loop.p[0] ?? 0, loop.p[1] ?? 0, loop.p[2] ?? 0];
  const across = (q: Vec3): number => dot([q[0] - p0[0], q[1] - p0[1], q[2] - p0[2]], b);
  let half = 0;
  const bp = belt.mesh?.positions;
  for (let i = 0; bp && i + 2 < bp.length; i += 3)
    half = Math.max(half, Math.abs(across([bp[i] ?? 0, bp[i + 1] ?? 0, bp[i + 2] ?? 0])));
  const speeds: number[] = [];
  for (const part of parts) {
    const t = world.get(part.name);
    if (part.motion?.kind !== 'spin' || !t) continue;
    const l = Math.hypot(...part.motion.axis);
    const own: Vec3 = [part.motion.axis[0] / l, part.motion.axis[1] / l, part.motion.axis[2] / l];
    const side = dot(rotateZ(own, t.yaw - home.yaw), b);
    if (Math.abs(side) < 0.99) continue;
    const o = t.origin;
    const pivot = rotateZ(
      [o[0] - home.origin[0], o[1] - home.origin[1], o[2] - home.origin[2]],
      -home.yaw,
    );
    if (Math.abs(across(pivot)) > half + BESIDE || !inside(loop, pivot)) continue;
    const radius = rimRadius(part, own) || bareRadius(belt, loop, pivot);
    const turns = cyclesOf(part.motion.rps) / LOOP_SECONDS;
    speeds.push(Math.sign(side) * turns * 2 * Math.PI * radius);
  }
  if (speeds.length === 0) return FREE_BELT_SPEED;
  speeds.sort((x, y) => x - y);
  return speeds[Math.floor(speeds.length / 2)] ?? FREE_BELT_SPEED;
}

/** Radius of a wheel with no mesh at `pivot`: up to the belt's mesh, else to its centre line. */
function bareRadius(belt: Part, loop: BeltLoop, pivot: Vec3): number {
  const reach = belt.mesh ? beltReach(belt.mesh, pivot, loop.normal) : Infinity;
  if (Number.isFinite(reach) && reach > 0) return reach;
  const k = Math.round(loop.nearest(pivot) / loop.step) % loop.n;
  return Math.hypot(
    (loop.p[k * 3] ?? 0) - pivot[0],
    (loop.p[k * 3 + 1] ?? 0) - pivot[1],
    (loop.p[k * 3 + 2] ?? 0) - pivot[2],
  );
}
