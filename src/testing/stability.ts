// Standing assertions: the asset rests on the ground plane (lowest point at z = 0, nothing sunk
// below it) and would not tip over — its centre of mass (volume × density, /physics) lies over
// the support polygon, the convex hull of the points touching the ground.
//   it('stands on the ground', () => assertUprightOnGround(lamp));
//   it('does not tip', () => assertCentreOfMassInside(lamp));

import type { Asset, Vec3 } from '../core/index.ts';
import { massProperties } from '../physics/index.ts';
import type { Finding } from '../qa/index.ts';
import { compileLods, failOn, type LodOptions } from './compiled.ts';
import { meshesOf } from './mesh-input.ts';
import { convexHull2, distanceOutside } from './stability-hull.ts';

const cm = (m: number): string => `${(m * 100).toFixed(1)} cm`;

export interface GroundOptions extends LodOptions {
  /** Allowed distance of the lowest point from z = 0, metres. Default 5 mm. */
  readonly eps?: number;
}

/** Lowest point within `eps` of z = 0 and no part reaching below it, at every LOD checked. */
export function assertUprightOnGround(asset: Asset, o: GroundOptions = {}): number {
  const eps = o.eps ?? 0.005;
  let lowest = Infinity;
  failOn(
    `${asset.name} ground`,
    compileLods(asset, o).flatMap((c) => {
      const lows = meshesOf(c).map(({ name, mesh }) => {
        let z = Infinity;
        for (let i = 2; i < mesh.positions.length; i += 3) z = Math.min(z, mesh.positions[i] ?? 0);
        return { name, z };
      });
      const min = Math.min(...lows.map((l) => l.z));
      lowest = Math.min(lowest, min);
      const out: Finding[] = lows
        .filter((l) => l.z < -eps)
        .map((l) => ({
          gate: 'ground',
          part: l.name,
          message: `'${l.name}' reaches ${cm(-l.z)} below the ground (z = ${l.z.toFixed(3)})`,
          fix: `lift '${l.name}' (or the whole asset) by ${cm(-l.z)}: assets stand on z = 0`,
        }));
      if (min > eps)
        out.push({
          gate: 'ground',
          message: `lowest point is ${cm(min)} above the ground — the asset floats`,
          fix: `lower everything by ${cm(min)} so the feet/wheels/base touch z = 0`,
        });
      return out.map((finding) => ({ finding, lod: c.lod }));
    }),
  );
  return lowest;
}

export interface TipOptions extends GroundOptions {
  /** Points this close to the lowest point are ground contacts. Default 2 cm. */
  readonly contact?: number;
  /** How far inside the support polygon the centre of mass must sit, metres. Default 0. */
  readonly margin?: number;
}

/** The centre of mass projects inside the ground-contact polygon. Returns its xy and the margin. */
export function assertCentreOfMassInside(
  asset: Asset,
  o: TipOptions = {},
): { com: Vec3; outside: number } {
  const [c] = compileLods(asset, { lods: o.lods ?? [0], ...(o.seed ? { seed: o.seed } : {}) });
  if (!c) return { com: [0, 0, 0], outside: 0 };
  const com = massProperties(c).centerOfMass;
  const meshes = meshesOf(c);
  let ground = Infinity;
  for (const { mesh } of meshes)
    for (let i = 2; i < mesh.positions.length; i += 3)
      ground = Math.min(ground, mesh.positions[i] ?? 0);
  const touch = ground + (o.contact ?? 0.02);
  const pts: [number, number][] = [];
  for (const { mesh } of meshes)
    for (let i = 0; i < mesh.positions.length; i += 3)
      if ((mesh.positions[i + 2] ?? 0) <= touch)
        pts.push([mesh.positions[i] ?? 0, mesh.positions[i + 1] ?? 0]);
  const hull = convexHull2(pts);
  const outside = distanceOutside(hull, [com[0], com[1]]) + (o.margin ?? 0);
  failOn(
    `${asset.name} balance`,
    outside > 0
      ? [
          {
            finding: {
              gate: 'balance',
              message: `centre of mass (${com[0].toFixed(3)}, ${com[1].toFixed(3)}) is ${cm(outside)} outside the ${hull.length}-point ground contact polygon${o.margin ? ` (margin ${cm(o.margin)})` : ''} — it tips over`,
              fix: 'widen the base/stance toward the centre of mass, or move heavy parts over the base (lighter overhangs, hollow `shell` walls)',
            },
          },
        ]
      : [],
  );
  return { com, outside };
}
