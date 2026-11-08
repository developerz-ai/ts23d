// Suspension and driveline links built from the hard points (points.ts): forged A-arms with
// bushing eyes and ball-joint ends, coil-over dampers (helical spring, body, adjuster, top mount),
// tubular anti-roll bars with drop links, the steering rack with boots and tie rods, rear toe
// links, the differential with its cover and half-shafts with CV boots. All static parts the
// steering pivot and spinning wheels are declared clear of (they meet at ball joints / splines).

import type { Lod, Mesh, Vec3 } from '@developerz.ai/ts23d';
import { lathe, merge, sweep } from '@developerz.ai/ts23d';
import { X_RA, Z_RA } from '../dims.ts';
import { C } from '../lib/colors.ts';
import { add, along, lerp3, mul, rod, shift, sub, tube, unit } from '../lib/geo.ts';
import { type Corner, corner } from './points.ts';

/** An A-arm: two tapered legs from the inner pivots to the ball joint, eyes at the pivots. */
function aArm(lod: Lod, a: Vec3, b: Vec3, bj: Vec3, d: number): Mesh {
  const segs = lod === 0 ? 10 : 6;
  const parts: Mesh[] = [
    tube([a, lerp3(a, bj, 0.5), bj], d, C.frame, 'steel_painted', segs, 2),
    tube([b, lerp3(b, bj, 0.5), bj], d, C.frame, 'steel_painted', segs, 2),
  ];
  if (lod < 2) {
    const axis = unit(sub(b, a));
    for (const p of [a, b])
      parts.push(
        rod(
          sub(p, mul(axis, 0.03)),
          add(p, mul(axis, 0.03)),
          d * 1.9,
          C.ironDark,
          'iron_cast',
          segs,
        ),
      );
    // Gusset plate between the legs near the ball joint.
    if (lod === 0)
      parts.push(
        tube([lerp3(a, bj, 0.7), lerp3(b, bj, 0.7)], d * 0.8, C.frame, 'steel_painted', segs, 1),
      );
  }
  return merge(parts);
}

/** Coil-over: damper body, piston rod, helical spring between perches, top mount. */
export function coilover(lod: Lod, low: Vec3, top: Vec3): Mesh {
  const ax = unit(sub(top, low));
  const L = Math.hypot(...sub(top, low));
  const segs = lod === 0 ? 16 : 8;
  // Author along +X then orient.
  const parts: Mesh[] = [
    lathe({
      profile: [
        [0.0, 0],
        [0.022, 0],
        [0.024, 0.01],
        [0.024, L * 0.55],
        [0.018, L * 0.57],
        [0.009, L * 0.58],
        [0.009, L],
        [0, L],
      ],
      segments: segs,
      axis: 'x',
      color: C.alloyCast,
      strip: 'aluminium',
    }),
  ];
  // Spring perches.
  for (const f of [0.22, 0.93])
    parts.push(
      lathe({
        profile: [
          [0.02, L * f - 0.006],
          [0.05, L * f - 0.006],
          [0.05, L * f + 0.006],
          [0.02, L * f + 0.006],
        ],
        segments: segs,
        axis: 'x',
        color: C.ironDark,
        strip: 'aluminium',
      }),
    );
  if (lod < 2) {
    const turns = 6.5;
    const n = lod === 0 ? 160 : 48;
    const path: Vec3[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const a = t * turns * Math.PI * 2;
      path.push([L * (0.225 + 0.7 * t), 0.042 * Math.cos(a), 0.042 * Math.sin(a)]);
    }
    parts.push(
      sweep({
        section: { radius: 0.0065, segments: lod === 0 ? 8 : 5 },
        path,
        color: C.springRed,
        strip: 'plastic',
        caps: true,
      }),
    );
  } else {
    parts.push(rod([L * 0.22, 0, 0], [L * 0.93, 0, 0], 0.09, C.springRed, 'plastic', 6));
  }
  // Eyes.
  parts.push(rod([0, -0.016, 0], [0, 0.016, 0], 0.03, C.ironDark, 'iron_cast', segs));
  return along(merge(parts), low, ax, [0, 1, 0]);
}

function antiRollBar(lod: Lod, c: Corner, x: number, z: number, linkTo: (s: number) => Vec3): Mesh {
  const segs = lod === 0 ? 10 : 6;
  const parts: Mesh[] = [];
  const pts: Vec3[] = [
    [x - 0.16, 0.42, z + 0.03],
    [x - 0.02, 0.36, z],
    [x, 0.28, z],
    [x, -0.28, z],
    [x - 0.02, -0.36, z],
    [x - 0.16, -0.42, z + 0.03],
  ];
  parts.push(tube(pts, 0.026, C.frame, 'steel_painted', segs, 4));
  for (const s of [1, -1]) {
    // Bushing clamps, drop links to the lower arms.
    parts.push(
      rod([x, s * 0.25, z - 0.025], [x, s * 0.25, z + 0.025], 0.045, C.black, 'rubber', segs),
    );
    const end: Vec3 = [x - 0.16, s * 0.42, z + 0.03];
    parts.push(rod(end, linkTo(s), 0.014, C.ironDark, 'chrome', segs));
  }
  void c;
  return merge(parts);
}

export interface SuspensionMeshes {
  /** Arms, dampers, links per corner id (static; steering/wheel pivots are clear of them). */
  readonly arms: Readonly<Record<string, Mesh>>;
  readonly front: Mesh;
  readonly rear: Mesh;
}

export function suspension(lod: Lod): SuspensionMeshes {
  const arms: Record<string, Mesh> = {};
  for (const id of ['fl', 'fr', 'rl', 'rr'] as const) {
    const c = corner(id);
    const parts: Mesh[] = [
      aArm(lod, c.upperIn[0], c.upperIn[1], c.upperBj, 0.024),
      aArm(lod, c.lowerIn[0], c.lowerIn[1], c.lowerBj, 0.03),
      coilover(lod, c.damperLow, c.damperTop),
    ];
    // Tie rod (front: steering; rear: toe link), with a rod end and lock nut.
    parts.push(rod(c.tieIn, c.tieOut, 0.018, C.alloyCast, 'chrome', lod === 0 ? 10 : 6));
    if (lod === 0)
      parts.push(
        rod(
          lerp3(c.tieIn, c.tieOut, 0.7),
          lerp3(c.tieIn, c.tieOut, 0.74),
          0.028,
          C.ironDark,
          'iron_cast',
          6,
        ),
      );
    arms[id] = merge(parts);
  }
  const cf = corner('fl');
  const cr = corner('rl');
  // Front: steering rack across the car with boots, ARB.
  const segs = lod === 0 ? 12 : 6;
  const front: Mesh[] = [
    rod(
      [cf.tieIn[0], -0.3, cf.tieIn[2]],
      [cf.tieIn[0], 0.3, cf.tieIn[2]],
      0.05,
      C.alloyCast,
      'aluminium',
      segs,
    ),
    antiRollBar(lod, cf, cf.wheel[0] + 0.24, cf.lowerIn[0][2] + 0.06, (s) => {
      const c = corner(s > 0 ? 'fl' : 'fr');
      return lerp3(c.lowerIn[0], c.lowerBj, 0.7);
    }),
  ];
  if (lod < 2)
    for (const s of [1, -1]) {
      // Rack boots: bellows (lathe with ridges).
      const prof: [number, number][] = [];
      for (let k = 0; k <= 12; k++) prof.push([k % 2 ? 0.027 : 0.02, k * 0.008]);
      const boot = lathe({
        profile: [[0.012, 0], ...prof, [0.012, 0.1]],
        segments: segs,
        axis: 'y',
        color: C.black,
        strip: 'rubber',
      });
      front.push(shift(boot, [cf.tieIn[0], s > 0 ? 0.3 : -0.4, cf.tieIn[2]]));
    }
  // Rear: differential, half-shafts, ARB.
  const diffAt: Vec3 = [X_RA, 0, Z_RA + 0.02];
  const rear: Mesh[] = [
    shift(
      lathe({
        profile: [
          [0, -0.17],
          [0.1, -0.17],
          [0.15, -0.1],
          [0.16, 0.05],
          [0.12, 0.15],
          [0.06, 0.18],
          [0, 0.18],
        ],
        segments: lod === 0 ? 24 : 10,
        axis: 'y',
        color: C.alloyCast,
        strip: 'iron_cast',
      }),
      diffAt,
    ),
    // Pinion nose toward the driveshaft.
    rod(
      [X_RA + 0.12, 0, diffAt[2]],
      [X_RA + 0.3, 0, diffAt[2] + 0.01],
      0.09,
      C.alloyCast,
      'iron_cast',
      segs,
    ),
    antiRollBar(lod, cr, cr.wheel[0] - 0.25, cr.lowerIn[0][2] + 0.08, (s) => {
      const c = corner(s > 0 ? 'rl' : 'rr');
      return lerp3(c.lowerIn[1], c.lowerBj, 0.7);
    }),
  ];
  if (lod === 0) {
    // Diff cover: a flat pressed plate on the rear face (the round housing alone curves away
    // from a bolt circle — QA connections found 4 of the 10 bolts hanging 2–4 cm off it), its
    // bolts round its rim, seated 5 mm in.
    rear.push(
      rod(
        [X_RA - 0.09, 0, diffAt[2]],
        [X_RA - 0.162, 0, diffAt[2]],
        0.284,
        C.alloyCast,
        'iron_cast',
        24,
      ),
    );
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      rear.push(
        rod(
          [X_RA - 0.157, 0.12 * Math.cos(a), diffAt[2] + 0.12 * Math.sin(a)],
          [X_RA - 0.177, 0.12 * Math.cos(a), diffAt[2] + 0.12 * Math.sin(a)],
          0.012,
          C.ironDark,
          'chrome',
          6,
        ),
      );
    }
  }
  for (const s of [1, -1]) {
    const c = corner(s > 0 ? 'rl' : 'rr');
    // Half-shaft from the diff to the hub, CV boots at both ends.
    const a: Vec3 = [X_RA, s * 0.17, diffAt[2]];
    const b: Vec3 = [c.wheel[0], c.wheel[1] - s * (0.13 + 0.07), c.wheel[2]];
    rear.push(rod(a, b, 0.032, C.ironDark, 'iron_cast', segs));
    if (lod < 2)
      for (const f of [0.08, 0.9]) {
        const p = lerp3(a, b, f);
        const prof: [number, number][] = [];
        for (let k = 0; k <= 8; k++)
          prof.push([
            0.022 + (k % 2 ? 0.012 : 0) + 0.012 * Math.sin((k / 8) * Math.PI),
            -0.04 + k * 0.01,
          ]);
        rear.push(
          shift(
            lathe({ profile: prof, segments: segs, axis: 'y', color: C.black, strip: 'rubber' }),
            p,
          ),
        );
      }
  }
  return { arms, front: merge(front), rear: merge(rear) };
}
