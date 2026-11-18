// Test fixtures for chain motion (not exported): hand-written body plans in the contract's shape, a
// straight trunk with fins, a fan of necks on a body, and a ring of arms. No mesh, no builder.

import type { Bone, Vec3 } from '../core/index.ts';
import type { BodyPlan, PlanChain, PlanLink } from './body-plan-types.ts';

const unit = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** A straight chain of `n` equal links from `from` along `dir`, hanging from `parent`. */
export function straightChain(
  id: string,
  from: Vec3,
  dir: Vec3,
  length: number,
  n: number,
  parent?: string,
): PlanChain {
  const d = unit(dir);
  // The contract's frame, as bodyPlan builds it: bend from world up, pitch = twist × bend.
  const ref: Vec3 = Math.abs(d[2]) > 0.95 ? [1, 0, 0] : [0, 0, 1];
  const along = ref[0] * d[0] + ref[1] * d[1] + ref[2] * d[2];
  const bend = unit([ref[0] - d[0] * along, ref[1] - d[1] * along, ref[2] - d[2] * along]);
  const pitch = cross(d, bend);
  const at = (k: number): Vec3 => [
    from[0] + (d[0] * length * k) / n,
    from[1] + (d[1] * length * k) / n,
    from[2] + (d[2] * length * k) / n,
  ];
  const links: PlanLink[] = Array.from({ length: n }, (_, i) => {
    const up = i === 0 ? parent : `${id}_${i - 1}`;
    const bone: Bone = {
      name: `${id}_${i}`,
      ...(up ? { parent: up } : {}),
      head: at(i),
      tail: at(i + 1),
    };
    return { bone, s: i / n, length: length / n, bend, pitch, twist: d };
  });
  return { id, spec: id, copy: null, links, length };
}

export function planOf(name: string, length: number, chains: readonly PlanChain[]): BodyPlan {
  return {
    name,
    length,
    bones: chains.flatMap((c) => c.links.map((l) => l.bone)),
    chains,
    root: chains[0]?.links[0]?.bone.name ?? '',
  };
}

export interface FishFixture {
  readonly length?: number;
  readonly links?: number;
  readonly fins?: boolean;
}

/** A swimmer along -X from the origin; with fins, 8 % of L is caudal lobe past the trunk. */
export function fishPlan({ length = 2, links = 16, fins = false }: FishFixture = {}): BodyPlan {
  const trunk = fins ? length * 0.92 : length;
  const spine = straightChain('spine', [0, 0, 0], [-1, 0, 0], trunk, links);
  if (!fins) return planOf('fish', length, [spine]);
  const end = spine.links.at(-1)?.bone;
  const head = spine.links[0]?.bone;
  const lobe = (id: string, z: number): PlanChain =>
    straightChain(id, end?.tail ?? [0, 0, 0], [-1, 0, z], length * 0.08, 3, end?.name);
  const fin = (id: string, y: number): PlanChain =>
    straightChain(
      id,
      [-0.3 * length, y * 0.05, 0],
      [-0.3, y, -0.2],
      length * 0.1,
      2,
      spine.links[4]?.bone.name,
    );
  const jaw = (id: string, z: number): PlanChain =>
    straightChain(id, [-0.02 * length, 0, z], [1, 0, 0], length * 0.06, 1, head?.name);
  return planOf('fish', length, [
    spine,
    lobe('caudal_u', 0.5),
    lobe('caudal_l', -0.35),
    fin('pec_l', 1),
    fin('pec_r', -1),
    jaw('jaw_low', -0.02),
    jaw('jaw_up', 0.02),
  ]);
}

/** A body along -X with `necks` necks fanned forward and up over `spread` radians. */
export function hydraPlan(necks = 5, links = 12, spread = 1.6): BodyPlan {
  const body = straightChain('body', [0, 0, 1], [-1, 0, 0], 2, 4);
  const from = body.links[0]?.bone.name;
  const out = Array.from({ length: necks }, (_, i) => {
    const a = necks > 1 ? (i / (necks - 1) - 0.5) * spread : 0;
    const start: Vec3 = [0.1 * Math.cos(a), 0.1 * Math.sin(a), 1.05];
    return straightChain(`neck_${i}`, start, [Math.cos(a), Math.sin(a), 0.5], 1.8, links, from);
  });
  return planOf('hydra', 2, [body, ...out]);
}

/** A mantle with `arms` arms radiating in the XY plane, `links` joints each. */
export function octopusPlan(arms = 8, links = 16): BodyPlan {
  const mantle = straightChain('mantle', [0, 0, 0.3], [0, 0, 1], 0.4, 2);
  const from = mantle.links[0]?.bone.name;
  const out = Array.from({ length: arms }, (_, i) => {
    const a = ((i + 0.5) * Math.PI * 2) / arms;
    return straightChain(
      `arm_${i}`,
      [0.08 * Math.cos(a), 0.08 * Math.sin(a), 0.25],
      [Math.cos(a), Math.sin(a), -0.15],
      1,
      links,
      from,
    );
  });
  return planOf('octopus', 1, [mantle, ...out]);
}
