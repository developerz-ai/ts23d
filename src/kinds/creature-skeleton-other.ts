// Landmarks for the non-mammal body plans: bird (an inclined trunk balanced over two digitigrade
// legs, S-necked, wings folded on the flanks, a tail-feather fan), fish (a laterally compressed
// spindle resting on its pelvic and anal fins) and serpent (one round chain in an S on the ground).

import type { Vec3 } from '../core/index.ts';
import type { Bones, HeadFrame, Limb } from './creature-bones.ts';
import { feet, headToWorld } from './creature-bones.ts';
import { pathLength, pointAt, v3 } from './creature-curve.ts';
import { sizes } from './creature-layout.ts';
import { type SkinNode, tube } from './creature-skin.ts';
import type { CreatureSpec } from './creature-spec.ts';

const deg = Math.PI / 180;

/** Bird: L = bill tip → tail root, height = top of the back. */
export function birdBones(s: CreatureSpec): Bones {
  const z = sizes(s);
  const { L, H } = z;
  const r = z.limbR;
  const zc = 0.62 * H;
  const rx = 0.33 * L;
  const rz = 0.27 * H;
  const ry = 0.2 * H;
  const atlas: Vec3 = [0.3 * L, 0, zc + rz + z.neckLen * 0.55];
  const head: HeadFrame = {
    atlas,
    pitch: (s.pose?.head ?? 5) * deg,
    length: z.headLen,
    width: z.headWidth,
    height: z.headWidth * 0.95,
    beak: true,
  };
  const y = ry * 0.45;
  const leg: Limb = {
    name: 'hind',
    joints: [
      [-0.02 * L, y, zc - 0.1 * H],
      [0.04 * L, y * 1.05, zc - rz * 0.8],
      [-0.04 * L, y, 0.2 * zc],
      [0.01 * L, y, 0.03 * H],
    ],
    radii: [r * 1.3, r * 0.75, r * 0.32, r * 0.3],
    foot: [0.02 * L, y, 0],
    footSize: [0.14 * H, 0.1 * H, 0.02 * H],
    // Anisodactyl bird foot: three toes forward, the hallux back (animal-anatomy §2).
    toes: 4,
    dewclaws: 0,
    hoof: null,
    muscles: [{ at: [0.0, y * 1.1, zc - rz * 0.6], r: [r * 1.4, r * 1.1, r * 2] }],
  };
  // Folded wing: from the shoulder along the flank to the primaries' tips past the tail root.
  const span = s.wingspan ?? 1.6 * L;
  const wingArm: SkinNode[] = tube(
    [
      [0.18 * L, ry * 0.85, zc + rz * 0.45],
      [0.05 * L, ry * 1.02, zc + rz * 0.3],
      [-0.45 * L, ry * 0.7, zc + rz * 0.05],
    ],
    (t) => ry * (0.38 - 0.3 * t),
  );
  const tailRoot: Vec3 = [-0.28 * L, 0, zc + 0.1 * H];
  const fan = tube(
    [
      tailRoot,
      [-0.28 * L - z.tailLen * 0.4, 0, zc + 0.2 * H],
      [-0.28 * L - z.tailLen * 0.7, 0, zc + 0.42 * H],
    ],
    (t) => ry * (0.3 + 0.35 * t),
  );
  return {
    skeleton: 'bird',
    stance: 'digitigrade',
    mass: s.mass,
    height: H,
    limbR: r,
    trunk: [{ at: [0, 0, zc], r: [rx, ry, rz], rotate: [0, -18, 0] }],
    chain: [],
    spine: [tailRoot, [0, 0, zc + rz]],
    neck: tube(
      [
        [0.18 * L, 0, zc + rz * 0.4],
        [0.3 * L, 0, zc + rz * 0.8],
        [0.26 * L, 0, atlas[2] - 0.2 * z.neckLen],
        atlas,
      ],
      (t) => z.headWidth * (0.55 - 0.15 * t),
    ),
    tail: [],
    head,
    legs: [leg],
    wings: [{ arm: wingArm, tips: [], membrane: [], area: (span * span) / 7 / 2, folded: true }],
    fins: [{ nodes: fan, side: [0, 1, 0] }],
    ground: feet([leg]),
    mirror: true,
    nose: headToWorld(head, [z.headLen, 0, 0]),
    tailRoot,
  };
}

/** Fish: L = snout → tail fork, height = body depth; rests on its pelvic and anal fins. */
export function fishBones(s: CreatureSpec): Bones {
  const z = sizes(s);
  const { L, H } = z;
  const zc = 0.47 * H;
  const nose = L / 2;
  const ped = -L / 2 + z.tailLen;
  const trunk: { at: Vec3; r: Vec3 }[] = [];
  const n = 6;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = nose - z.headLen * 0.6 - t * (nose - z.headLen * 0.6 - ped);
    const k = Math.sin(Math.PI * Math.min(1, 0.25 + t * 0.8)) * 0.8 + 0.2;
    const seg = (nose - ped) / n;
    trunk.push({ at: [x, 0, (H * k) / 2], r: [seg * 1.3, (0.42 * H * k) / 2, (H * k) / 2] });
  }
  const atlas: Vec3 = [nose - z.headLen, 0, zc];
  const head: HeadFrame = {
    atlas,
    pitch: 0,
    length: z.headLen,
    width: 0.42 * H,
    height: 0.82 * H,
    beak: true,
  };
  const fin = (pts: Vec3[], r0: number, r1: number): SkinNode[] =>
    tube(pts, (t) => r0 + (r1 - r0) * t);
  const zp = H * 0.13;
  const fins = [
    // Dorsal, caudal lobes (upper, lower), anal and the pelvic pair, swept back off the body.
    {
      nodes: fin(
        [
          [0.05 * L, 0, zc + H * 0.3],
          [-0.14 * L, 0, zc + H * 0.72],
        ],
        H * 0.17,
        H * 0.04,
      ),
      side: [0, 1, 0] as Vec3,
    },
    {
      nodes: fin(
        [
          [ped + 0.02 * L, 0, zp],
          [ped - z.tailLen, 0, zp + 0.48 * H],
        ],
        H * 0.1,
        H * 0.03,
      ),
      side: [0, 1, 0] as Vec3,
    },
    {
      nodes: fin(
        [
          [ped + 0.02 * L, 0, zp],
          [ped - z.tailLen, 0, Math.max(H * 0.04, zp - 0.4 * H)],
        ],
        H * 0.1,
        H * 0.03,
      ),
      side: [0, 1, 0] as Vec3,
    },
    {
      nodes: fin(
        [
          [-0.14 * L, 0, H * 0.18],
          [-0.27 * L, 0, H * 0.07],
        ],
        H * 0.1,
        H * 0.03,
      ),
      side: [0, 1, 0] as Vec3,
    },
    {
      nodes: fin(
        [
          [0.06 * L, 0.12 * H, H * 0.16],
          [-0.04 * L, 0.2 * H, H * 0.08],
        ],
        H * 0.08,
        H * 0.03,
      ),
      side: [0, 1, 0.3] as Vec3,
    },
  ];
  return {
    skeleton: 'fish',
    stance: 'plantigrade',
    mass: s.mass,
    height: H,
    limbR: 0,
    trunk,
    chain: [],
    spine: [
      [ped, 0, zc + H * 0.2],
      [nose - z.headLen, 0, zc + H * 0.45],
    ],
    neck: [],
    tail: [],
    head,
    legs: [],
    wings: [],
    fins,
    ground: [
      [0.0, 0.16 * H, 0],
      [0.0, -0.16 * H, 0],
      [-0.24 * L, 0, 0],
    ],
    mirror: true,
    nose: [nose, 0, zc],
    tailRoot: [ped, 0, zc],
  };
}

/** Serpent: L = total length, height = body diameter; an S on the ground, head forward (+X). */
export function serpentBones(s: CreatureSpec): Bones {
  const z = sizes(s);
  const { L, H } = z;
  const R = H / 2;
  const body = L - z.headLen;
  const amp = 0.09 * body;
  const raw: Vec3[] = [];
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    raw.push([-t, amp * (Math.cos(2 * Math.PI * 1.25 * t) - 1), 0]);
  }
  // Scale x so the curve's arc length is the body length.
  let k = body;
  for (let it = 0; it < 6; it++) k *= body / pathLength(raw.map((p) => [p[0] * k, p[1], 0]));
  const path = raw.map((p): Vec3 => [p[0] * k, p[1], 0]);
  const rOf = (t: number): number =>
    R *
    (t < 0.05 ? 0.78 + 0.22 * (t / 0.05) : 1) *
    (t > 1 - z.tailLen / L ? Math.max(0.12, (1 - t) / (z.tailLen / L)) : 1);
  const chain = tube(
    path.map((p, i): Vec3 => [p[0], p[1], rOf(i / 48) * 0.92]),
    rOf,
  );
  const atlas: Vec3 = [0, 0, R * 0.78 * 0.92];
  const head: HeadFrame = {
    atlas,
    pitch: 0,
    length: z.headLen,
    width: R * 1.7,
    height: R * 1.25,
    beak: true,
  };
  const ground: Vec3[] = [0.1, 0.3, 0.5, 0.7, 0.85].map((t) => {
    const p = pointAt(path, t);
    return [p[0], p[1], 0];
  });
  return {
    skeleton: 'serpent',
    stance: 'plantigrade',
    mass: s.mass,
    height: H,
    limbR: 0,
    trunk: [],
    chain,
    spine: chain.map((n) => v3.add(n.at, [0, 0, n.r])).reverse(),
    neck: [],
    tail: [],
    head,
    legs: [],
    wings: [],
    fins: [],
    ground,
    mirror: false,
    nose: headToWorld(head, [z.headLen, 0, 0]),
    tailRoot: chain[chain.length - 1]?.at ?? [0, 0, 0],
  };
}
