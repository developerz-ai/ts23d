// Feet and armour. A foot is a sculpted pad with five toes (a monitor's count) carrying curved claws,
// flat on the ground and rigid on the leg's last bone. Dorsal spines run from the shoulders to the
// tail tip, with rows of low osteoderms beside them; each piece is built once and stamped.

import {
  type BodyPlanDefinition,
  type BuildContext,
  dmath,
  lathe,
  type Mesh,
  merge,
  type SculptEdit,
  type SurfacePoint,
  sculpt,
  type Vec3,
} from '@developerz.ai/ts23d';
import { clawHorn, hornTube } from '../_lib/creature/horn.ts';
import { NECK_IDS, neckTop } from './anatomy.ts';
import { pinKeratin } from './material.ts';
import { C, lerp, muddy, noise3 } from './skin.ts';
import { stamp } from './stamp.ts';

type Kit = Parameters<NonNullable<BodyPlanDefinition['detail']>>[2];

interface FootDef {
  readonly chain: string;
  readonly bone: string;
  readonly at: Vec3;
  /** Heading of the foot, radians from +X toward +Y. */
  readonly yaw: number;
  readonly size: number;
}

const FEET: readonly FootDef[] = [
  { chain: 'fore_l', bone: 'fore_l_2', at: [1.2, 0.89, 0], yaw: 0.24, size: 1.22 },
  { chain: 'fore_r', bone: 'fore_r_2', at: [1.2, -0.89, 0], yaw: -0.24, size: 1.22 },
  { chain: 'hind_l', bone: 'hind_l_2', at: [-0.92, 1.05, 0], yaw: 0.3, size: 1.34 },
  { chain: 'hind_r', bone: 'hind_r_2', at: [-0.92, -1.05, 0], yaw: -0.3, size: 1.34 },
];

const TOES = [-0.72, -0.34, 0.02, 0.36, 0.78];

function footMesh(f: FootDef, lod: number): { foot: Mesh; claws: Mesh } {
  const res = [0.024, 0.036, 0.08][lod] ?? 0.08;
  const skin = lerp(C.back, C.ochre, 0.45);
  const k = f.size;
  const dir = (a: number): Vec3 => [dmath.cos(f.yaw + a), dmath.sin(f.yaw + a), 0];
  const add = (a: Vec3, d: Vec3, l: number, z: number): Vec3 => [
    a[0] + d[0] * l,
    a[1] + d[1] * l,
    z,
  ];
  const palm: Vec3 = [f.at[0] - 0.05 * dmath.cos(f.yaw), f.at[1] - 0.05 * dmath.sin(f.yaw), 0];
  const edits: SculptEdit[] = [
    {
      shape: 'ellipsoid',
      at: [palm[0], palm[1], 0.075 * k],
      size: [0.21 * k, 0.185 * k, 0.095 * k],
      rotate: [0, 0, (f.yaw * 180) / Math.PI],
      color: skin,
      blend: 0,
    },
  ];
  const clawParts: Mesh[] = [];
  TOES.forEach((a, i) => {
    const d = dir(a);
    const len = (0.3 - Math.abs(a) * 0.09) * k * (i === 2 ? 1.08 : 1);
    const root = add(palm, d, 0.1 * k, 0.05 * k);
    const knuckle = add(palm, d, 0.1 * k + len * 0.55, 0.06 * k);
    const tip = add(palm, d, 0.1 * k + len, 0.038 * k);
    edits.push(
      {
        shape: 'roundCone',
        at: root,
        to: knuckle,
        size: [0.058 * k, 0.046 * k],
        color: skin,
        // Webbed toe roots: a soft cleft between neighbours, not a fold.
        blend: 0.14,
      },
      {
        shape: 'roundCone',
        at: knuckle,
        to: tip,
        size: [0.046 * k, 0.032 * k],
        color: skin,
        blend: 0.1,
      },
    );
    const base: Vec3 = [tip[0] - d[0] * 0.03 * k, tip[1] - d[1] * 0.03 * k, 0.044 * k];
    const claw = hornTube(
      clawHorn({
        base,
        dir: [d[0], d[1], 0.3],
        down: [0, 0, -1],
        length: 0.2 * k,
        radius: 0.027 * k,
        segments: [8, 4, 2][lod] ?? 2,
        curl: 58,
        colors: [C.claw, C.horn, C.hornMid],
      }),
      [8, 5, 3][lod] ?? 3,
    );
    // Claws dig: mud packed at the root, the tips scraped back to bare keratin.
    clawParts.push(
      pinKeratin(
        recolour(claw, (c, p) => muddy(c, [p[0], p[1], p[2] + 0.05], 0)),
        base,
        d,
        0.2 * k,
      ),
    );
  });
  // A flat sole on the ground.
  edits.push({
    shape: 'roundBox',
    at: [f.at[0], f.at[1], -0.25],
    size: [2, 2, 0.5],
    round: 0.005,
    op: 'subtract',
    // Wide enough that the toes roll onto the sole, not fold into it, at the 2.4 cm cell.
    blend: 0.055,
  });
  return {
    foot: recolour(sculpt({ edits, resolution: res, color: skin }), (c, p) => muddy(c, p, 0)),
    claws: merge(clawParts),
  };
}

/** A mesh with each vertex colour passed through `f` (colour, position). */
function recolour(m: Mesh, f: (c: Vec3, p: Vec3) => Vec3): Mesh {
  const colors = new Float32Array(m.colors);
  for (let i = 0; i < colors.length / 3; i++) {
    const c = f(
      [m.colors[i * 3] ?? 0, m.colors[i * 3 + 1] ?? 0, m.colors[i * 3 + 2] ?? 0],
      [m.positions[i * 3] ?? 0, m.positions[i * 3 + 1] ?? 0, m.positions[i * 3 + 2] ?? 0],
    );
    [colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]] = c;
  }
  return { ...m, colors };
}

export function hydraFeet(ctx: BuildContext, kit: Kit): void {
  const feet: Mesh[] = [];
  const claws: Mesh[] = [];
  for (const f of FEET) {
    const m = footMesh(f, ctx.lod);
    feet.push(kit.bindBone(m.foot, f.bone));
    claws.push(kit.bindBone(m.claws, f.bone));
  }
  ctx.part('feet', merge(feet), { paint: 'skin' });
  ctx.part('claws', merge(claws));
}

/** Widest radius of a spike or scute base, in its own size units. */
const BASE_RADIUS = 1.75;

const spikeUnit = (segments: number): Mesh =>
  keratinUnit(
    lathe({
      profile: [
        [1.3, -0.3],
        [1.75, 0.02],
        [1.5, 0.3],
        [1.1, 0.6],
        [0.7, 0.86],
        [0.42, 1.16],
        [0.13, 1.8],
        [0, 2.15],
      ],
      segments,
      color: C.spine,
    }),
    2.15,
  );

/** A unit piece standing on +Z, keratin UVs from its root to its tip. */
const keratinUnit = (m: Mesh, height: number): Mesh => pinKeratin(m, [0, 0, 0], [0, 0, 1], height);

const scuteUnit = (segments: number): Mesh =>
  keratinUnit(
    lathe({
      profile: [
        [1.3, -0.4],
        [1.35, 0],
        [1.05, 0.3],
        [0.6, 0.5],
        [0, 0.62],
      ],
      segments,
      color: lerp(C.saddle, C.back, 0.5),
    }),
    1.6,
  );

/** How far the real skin drops below a seat at the rim of its base: a fillet is not a round tube. */
function sagUnderRim(kit: Kit, chain: string, q: SurfacePoint, rim: number): number {
  const length = q.s / Math.max(q.u, 1e-6);
  const [du, da] = [rim / length, rim / q.radius];
  let sag = 0;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const u = Math.min(1, Math.max(0, q.u + du * dmath.cos(a)));
    const p = kit.surface(chain, u, q.angle + da * dmath.sin(a)).p;
    const drop = q.n[0] * (q.p[0] - p[0]) + q.n[1] * (q.p[1] - p[1]) + q.n[2] * (q.p[2] - p[2]);
    sag = Math.max(sag, drop);
  }
  return sag;
}

/** One row of pieces along a chain; `size` and spacing come from the chain's own radius. */
function rowOn(
  kit: Kit,
  chain: string,
  unit: Mesh,
  o: {
    readonly from: number;
    readonly to: number;
    readonly step: number;
    readonly angle: number | ((u: number) => number);
    readonly size: (r: number, u: number) => number;
    readonly sink: number;
  },
): Mesh | null {
  const out: Mesh[] = [];
  for (let u = o.from; u < o.to; u += o.step) {
    const angle = typeof o.angle === 'number' ? o.angle : o.angle(u);
    const q = kit.surface(chain, u, angle);
    // A flared base on a thin tube would stand off it: keep it narrower than the section.
    const wanted = o.size(q.radius, u) * (0.82 + 0.36 * noise3([u * 40, angle * 3, 1.5]));
    const s = Math.min(wanted, q.radius * 0.42);
    if (s > 1e-4) {
      // The skin falls away under the rim of the base: sink by that sag plus a real root.
      const rim = Math.min(q.radius * 0.98, s * BASE_RADIUS);
      const sag = q.radius - Math.sqrt(q.radius * q.radius - rim * rim);
      // On a fillet the skin is not a round tube. Capped: sunk further, the flare would pass under
      // the skin and leave a hard crease.
      const fallen = q.swept ? Math.min(sagUnderRim(kit, chain, q, rim), sag + s * 0.25) : 0;
      const sink = Math.max(sag, fallen) + s * o.sink;
      const at: Vec3 = [q.p[0] - q.n[0] * sink, q.p[1] - q.n[1] * sink, q.p[2] - q.n[2] * sink];
      out.push(stamp(unit, at, q.n, s, u * 90));
    }
  }
  return out.length > 0 ? kit.bindPieces(merge(out), [chain]) : null;
}

export function hydraArmour(ctx: BuildContext, kit: Kit): void {
  const lod = ctx.lod;
  const spike = spikeUnit([6, 5, 3][lod] ?? 3);
  const scute = scuteUnit([4, 4, 3][lod] ?? 3);
  const pieces: (Mesh | null)[] = [];
  // Big dorsal spines, spaced so each one reads on its own in SIDE.
  const spikeSize = (r: number, u: number): number => (0.08 + r * 0.27) * (1 - 0.35 * u);
  const dorsal = lod === 2 ? 0.26 : lod === 1 ? 0.1 : 0.07;
  pieces.push(
    rowOn(kit, 'body', spike, {
      from: 0.3,
      to: 0.88,
      step: dorsal,
      angle: 0,
      size: spikeSize,
      sink: 0.24,
    }),
  );
  pieces.push(
    rowOn(kit, 'tail', spike, {
      from: 0.2,
      to: 0.8,
      step: dorsal * 0.95,
      angle: 0,
      size: spikeSize,
      sink: 0.24,
    }),
  );
  NECK_IDS.forEach((id, k) => {
    pieces.push(
      rowOn(kit, id, spike, {
        from: 0.32,
        to: 0.96,
        step: dorsal * 1.45,
        angle: (u) => neckTop(k, u),
        size: (r, u) => (0.036 + r * 0.19) * (1 - 0.3 * u),
        sink: 0.24,
      }),
    );
  });
  if (lod === 0) {
    const scuteSize = (r: number, u: number): number => (0.03 + r * 0.065) * (1 - 0.3 * u);
    for (const angle of [0.42, 0.95]) {
      for (const a of [angle, Math.PI * 2 - angle]) {
        pieces.push(
          rowOn(kit, 'body', scute, {
            from: 0.06,
            to: 0.97,
            step: 0.032,
            angle: a,
            size: scuteSize,
            sink: 0.26,
          }),
        );
        pieces.push(
          rowOn(kit, 'tail', scute, {
            from: 0.03,
            to: 0.72,
            step: 0.04,
            angle: a * 0.9,
            size: scuteSize,
            sink: 0.26,
          }),
        );
      }
    }
  }
  ctx.part('spines', merge(pieces.filter((p): p is Mesh => p !== null)));
}
