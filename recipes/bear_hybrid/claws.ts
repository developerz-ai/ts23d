// Claws as geometry on a model body. The generator paints claws on fused toe paddles: at hero
// distance they read as pale stripes. Here each claw is a short curved cone grown out of the toe
// ends of the model's own mesh, found on the LOD being built (the front arc of the paw's skin,
// one slot per toe), and bound rigidly to the paw's last bone, so it walks with the foot. One
// extra skinned part on the trim sheet; none at LOD 2, where the painted claws carry the read.

import {
  type Bone,
  bindRigid,
  dmath,
  type Mesh,
  merge,
  sweep,
  type Vec3,
} from '@developerz.ai/ts23d';

export interface ClawOptions {
  /** Shoulder height of the plan, metres: every search distance scales with it. */
  readonly height: number;
  /** Toes per paw. */
  readonly toes: number;
  /** Claw length along its curve, metres: fore and hind. */
  readonly length: { readonly fore: number; readonly hind: number };
  /** Root radius, metres. */
  readonly radius: number;
  /** Degrees the claw curls down over its length. */
  readonly curl: number;
  readonly color: Vec3;
}

const LEGS = ['fore_l', 'fore_r', 'hind_l', 'hind_r'] as const;

/** Where each claw leaves its toe on this mesh: `toes` slots across the front arc of the paw's
 *  skin, low on the foot; in each, the centre of the skin within 3.5 cm of the slot's foremost
 *  vertex, which lies inside the toe's rounded end. Fewer than `toes` when a slot holds no skin
 *  (a narrow far-LOD paw). */
export function toeSeats(mesh: Mesh, paw: Vec3, o: ClawOptions): Vec3[] {
  const h = o.height;
  const P = mesh.positions;
  const low: Vec3[] = [];
  for (let i = 0; i < P.length; i += 3) {
    const [x = 0, y = 0, z = 0] = [P[i], P[i + 1], P[i + 2]];
    if (
      z < 0.075 * h &&
      Math.abs(y - paw[1]) < 0.13 * h &&
      x > paw[0] - 0.05 * h &&
      x < paw[0] + 0.3 * h
    )
      low.push([x, y, z]);
  }
  const front = Math.max(...low.map((p) => p[0]));
  const arc = low.filter((p) => p[0] > front - 0.07 * h);
  if (arc.length === 0) return [];
  const ys = arc.map((p) => p[1]);
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  // The outer slots stop short of the paw's sides, where the skin turns away from the front.
  const [lo, hi] = [y0 + 0.08 * (y1 - y0), y1 - 0.08 * (y1 - y0)];
  const seats: Vec3[] = [];
  for (let k = 0; k < o.toes; k++) {
    const a = lo + ((hi - lo) * k) / o.toes;
    const b = lo + ((hi - lo) * (k + 1)) / o.toes;
    const slot = arc.filter((p) => p[1] >= a && p[1] <= b);
    const tip = Math.max(...slot.map((p) => p[0]));
    const cap = slot.filter((p) => p[0] > tip - 0.035);
    if (cap.length === 0) continue;
    const mean = (k: 0 | 1 | 2) => cap.reduce((s, p) => s + p[k], 0) / cap.length;
    // Drawn 30 % towards the paw's middle and 12 mm back: an outer toe's end slopes away sideways.
    const mid = (y0 + y1) / 2;
    let seat: Vec3 = [mean(0) - 0.012, mean(1) + 0.3 * (mid - mean(1)), mean(2)];
    // Then away from the nearest skin until a claw's root, and 4 mm more, fits under it.
    const room = o.radius + 0.004;
    for (let pass = 0; pass < 6; pass++) {
      let [near, gap] = [seat, Number.POSITIVE_INFINITY];
      for (const p of low) {
        const d = dmath.hypot(p[0] - seat[0], p[1] - seat[1], p[2] - seat[2]);
        if (d < gap) [near, gap] = [p, d];
      }
      if (gap >= room || gap === 0) break;
      const push = (room - gap) / gap;
      seat = [
        seat[0] + (seat[0] - near[0]) * push,
        seat[1] + (seat[1] - near[1]) * push,
        seat[2] + (seat[2] - near[2]) * push,
      ];
    }
    seats.push(seat);
  }
  return seats;
}

/** One claw from its seat inside a toe: its root buried a further 2.5 cm back (no seam ring shows), then
 *  forward and down, curling `curl` degrees, its tip clear of the floor. */
function claw(seat: Vec3, length: number, lod: 0 | 1, o: ClawOptions): Mesh {
  const steps = lod === 0 ? 4 : 2;
  const bury = Math.max(0.025, 3 * o.radius);
  const out: Vec3 = [seat[0], seat[1], Math.max(seat[2], o.radius + 0.008)];
  const root: Vec3 = [out[0] - bury, out[1], out[2]];
  const path: Vec3[] = [root, out];
  let at = out;
  for (let i = 0; i < steps; i++) {
    // Level where it leaves the toe (a thin outer toe has no room under it), curling after.
    const pitch = (o.curl * dmath.pow((i + 0.5) / steps, 1.5) * Math.PI) / 180;
    const d = length / steps;
    at = [at[0] + dmath.cos(pitch) * d, at[1], at[2] - dmath.sin(pitch) * d];
    path.push(at);
  }
  // Never under the floor: a claw that would dig in is lifted whole (the root stays in the toe).
  const lift = Math.max(0, 0.004 - Math.min(...path.map((p) => p[2])));
  return sweep({
    section: { radius: o.radius, segments: lod === 0 ? 5 : 3 },
    path: path.map((p): Vec3 => [p[0], p[1], p[2] + lift]),
    scale: path.map((_, i) => (i === 0 ? 1 : 1 - 0.85 * dmath.pow((i - 1) / steps, 0.8))),
    color: o.color,
    caps: 'end',
  });
}

/** Every paw's claws, each paw bound to its `<leg>_3` bone; null at LOD 2 or with no toe found. */
export function clawMesh(
  lod: 0 | 1 | 2,
  body: Mesh,
  bones: readonly Bone[],
  o: ClawOptions,
): Mesh | null {
  if (lod === 2) return null;
  const paws: Mesh[] = [];
  for (const leg of LEGS) {
    const index = bones.findIndex((b) => b.name === `${leg}_3`);
    const bone = bones[index];
    if (!bone) continue;
    const length = leg.startsWith('fore') ? o.length.fore : o.length.hind;
    const claws = toeSeats(body, bone.head, o).map((seat) => claw(seat, length, lod, o));
    if (claws.length) paws.push(bindRigid(merge(claws), index));
  }
  return paws.length ? merge(paws) : null;
}
