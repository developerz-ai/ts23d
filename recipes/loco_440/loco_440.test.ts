// Jupiter's rods stay on their pins through the whole `run` clip (D42): each side-rod eye on its
// driver's crank pin, the main rod's big end on the front crank pin and its small end on the
// crosshead. Pins are read from the built crank meshes, not the recipe's constants, so a rod
// animated as a slide (up-and-down while the pins go round) fails by tens of centimetres.
import { describe, expect, it } from 'bun:test';
import { boundsOf, compile, type Vec3, worldMeshes, worldTransforms } from '@developerz.ai/ts23d';
import { assertFollows } from '@developerz.ai/ts23d/testing';
import { loco_440 } from './loco_440.ts';

const lod0 = compile(loco_440, { lod: 0 });
const meshes = worldMeshes(lod0.parts);
const rest = worldTransforms(lod0.parts);
const drivers = lod0.parts.filter((p) => /^axle_driver_\d+$/.test(p.name)).map((p) => p.name);

/** World crank-pin centre (x, z) of a wheelset side, at the y of the rod riding on it. */
function pin(wheelset: string, side: string, rod: string): Vec3 {
  const m = meshes.get(`${wheelset}_crank_${side}`);
  const y = rest.get(rod)?.origin[1];
  if (!m || y === undefined) throw new Error(`no crank ${wheelset}_crank_${side} or rod ${rod}`);
  const b = boundsOf(m);
  return [(b.min[0] + b.max[0]) / 2, y, (b.min[2] + b.max[2]) / 2];
}

const opts = { lods: [0, 1] as const, tolerance: 0.002 };

describe('loco_440 rods stay on their pins', () => {
  it('has driven wheelsets to check', () => expect(drivers.length).toBeGreaterThanOrEqual(2));

  for (const side of ['l', 'r'])
    describe(`side ${side}`, () => {
      for (const d of drivers)
        it(`side rod eye rides ${d}'s crank pin`, () => {
          const rod = `rod_side_${side}`;
          expect(
            assertFollows(loco_440, { ...opts, part: rod, follows: d, point: pin(d, side, rod) }),
          ).toBeLessThanOrEqual(0.002);
        });

      it('main rod big end rides the front crank pin', () => {
        const rod = `rod_main_${side}`;
        const front = drivers[0] ?? '';
        expect(
          assertFollows(loco_440, {
            ...opts,
            part: rod,
            follows: front,
            point: pin(front, side, rod),
          }),
        ).toBeLessThanOrEqual(0.002);
      });

      it('main rod small end rides the crosshead pin', () => {
        const at = rest.get(`rod_main_${side}`)?.origin ?? [0, 0, 0];
        expect(
          assertFollows(loco_440, {
            ...opts,
            part: `rod_main_${side}`,
            follows: `crosshead_${side}`,
            point: at,
          }),
        ).toBeLessThanOrEqual(0.002);
      });
    });
});
