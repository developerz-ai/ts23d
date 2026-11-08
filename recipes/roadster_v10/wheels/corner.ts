// One wheel corner as engine-ready nodes. Front: `steer_<id>` (sway about Z at the kingpin,
// ±8°) carries the upright, caliper and `wheel_<id>` (spin about Y: tyre, rim, disc). Rear: the
// same without the steering pivot. Meshes are authored in the wheel's local frame (axle along Y,
// outer face +Y) and mirrored for the right side so the outer face always points outboard.

import type { BuildContext, Lod, Mesh, Vec3 } from '@developerz.ai/ts23d';
import { merge } from '@developerz.ai/ts23d';
import type { Corner } from '../chassis/points.ts';
import { C } from '../lib/colors.ts';
import { mirrorY, rod, shift, sub, tube } from '../lib/geo.ts';
import { caliper, caliperBracket, disc } from './brakes.ts';
import { rim } from './rim.ts';
import { tyre } from './tyre.ts';

/** Wheel + disc in the local wheel frame (left-hand: outer face +Y). */
/** Tyre + disc in the local wheel frame (left-hand: outer face +Y). The rim is its own child
 *  part so it can carry the brushed-alloy finish without making the rubber metallic. */
export function wheelMesh(lod: Lod, c: Corner): Mesh {
  if (lod === 2) return tyre(lod, c.tyre);
  return merge([tyre(lod, c.tyre), disc(lod, c.disc)]);
}

export const rimMesh = (lod: Lod, c: Corner): Mesh =>
  rim(lod, { r: c.tyre.rim, width: c.rimWidth });

/** Upright (knuckle), hub and caliper in the local wheel frame, left-hand. */
export function uprightMesh(lod: Lod, c: Corner): Mesh {
  if (lod === 2)
    return caliper(lod, { disc: c.disc, pistons: 4, at: c.caliperAt, color: C.caliperRed });
  const w = c.wheel;
  const s = c.side;
  // Ball joints in the local (left-hand) frame.
  const loc = (p: Vec3): Vec3 => {
    const d = sub(p, w);
    return [d[0], d[1] * s, d[2]];
  };
  const ub = loc(c.upperBj);
  const lb = loc(c.lowerBj);
  const te = loc(c.tieOut);
  const hubY = c.disc.y + c.disc.thick / 2 + 0.03;
  const segs = lod === 0 ? 12 : 6;
  const parts: Mesh[] = [];
  const cast = C.alloyCast;
  // Knuckle body: a tapered column from the lower to the upper ball joint, bulging round the
  // spindle, plus the steering / toe arm.
  const spindle: Vec3 = [0, c.disc.y - 0.03, 0];
  parts.push(
    tube(
      [lb, [0, spindle[1] - 0.02, -0.06], spindle, [0, spindle[1] - 0.02, 0.07], ub],
      0.045,
      cast,
      'aluminium',
      segs,
      lod === 0 ? 4 : 2,
    ),
  );
  parts.push(
    tube(
      [spindle, [te[0] * 0.5, spindle[1] - 0.01, te[2] * 0.5], te],
      0.026,
      cast,
      'aluminium',
      segs,
      2,
    ),
  );
  // Bearing housing + hub flange (the disc hat bolts to it).
  parts.push(
    rod([0, spindle[1] - 0.02, 0], [0, hubY, 0], 0.095, cast, 'aluminium', lod === 0 ? 20 : 8),
  );
  // Ball-joint housings.
  if (lod < 2)
    for (const p of [ub, lb, te])
      parts.push(
        rod(
          [p[0], p[1] - 0.018, p[2]],
          [p[0], p[1] + 0.018, p[2]],
          0.04,
          C.ironDark,
          'iron_cast',
          segs,
        ),
      );
  const cal = {
    disc: c.disc,
    pistons: c.front ? (6 as const) : (4 as const),
    at: c.caliperAt,
    color: C.caliperRed,
  };
  parts.push(caliper(lod, cal));
  if (lod < 2) parts.push(caliperBracket(cal));
  if (lod === 0) {
    // Brake hose from the caliper up the knuckle.
    const a = c.caliperAt;
    const cp: Vec3 = [
      (c.disc.r - 0.03) * Math.cos(a),
      c.disc.y - c.disc.thick / 2 - 0.03,
      (c.disc.r - 0.03) * Math.sin(a),
    ];
    parts.push(
      tube(
        [cp, [cp[0] * 0.8, cp[1] - 0.05, cp[2] + 0.08], [ub[0], ub[1] - 0.06, ub[2] - 0.04]],
        0.009,
        C.hoseBlack,
        'rubber',
        6,
        4,
      ),
    );
    // Dust shield (backing plate) behind the disc.
    parts.push(
      shift(
        rod([0, -0.002, 0], [0, 0.002, 0], 2 * (c.disc.r - 0.01), C.ironDark, 'iron_cast', 32),
        [0, c.disc.y - c.disc.thick / 2 - 0.016, 0],
      ),
    );
  }
  return merge(parts);
}

const sideOf = (c: Corner, m: Mesh): Mesh => (c.side > 0 ? m : mirrorY(m));

/** Add the corner's nodes. Returns the names it created. */
export function addCorner(
  ctx: BuildContext,
  c: Corner,
  opts: { spinRps: number; clearOf: readonly string[] },
): void {
  const lod = ctx.lod;
  const wheelName = `wheel_${c.id}`;
  const uprName = `upright_${c.id}`;
  if (c.front) {
    const steer = `steer_${c.id}`;
    const k = c.kingpin;
    ctx.group(steer, {
      at: k,
      motion: { kind: 'sway', axis: [0, 0, 1], degrees: 8, hz: 0.25 },
      clearOf: opts.clearOf,
    });
    const rel = sub(c.wheel, k);
    if (lod < 2) ctx.part(uprName, shift(sideOf(c, uprightMesh(lod, c)), rel), { parent: steer });
    ctx.part(wheelName, sideOf(c, wheelMesh(lod, c)), {
      parent: steer,
      at: rel,
      motion: { kind: 'spin', axis: [0, 1, 0], rps: opts.spinRps },
      clearOf: [uprName, ...opts.clearOf],
    });
    ctx.part(`rim_${c.id}`, sideOf(c, rimMesh(lod, c)), { parent: wheelName, finish: 'brushed' });
  } else {
    if (lod < 2) ctx.part(uprName, sideOf(c, uprightMesh(lod, c)), { at: c.wheel });
    ctx.part(wheelName, sideOf(c, wheelMesh(lod, c)), {
      at: c.wheel,
      motion: { kind: 'spin', axis: [0, 1, 0], rps: opts.spinRps },
      clearOf: [uprName, ...opts.clearOf],
    });
    ctx.part(`rim_${c.id}`, sideOf(c, rimMesh(lod, c)), { parent: wheelName, finish: 'brushed' });
  }
}
