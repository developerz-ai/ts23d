// In water nothing is held by the ground: a detached shell near z = 0 is loose, not "grounded".

import { describe, expect, it } from 'bun:test';
import { compile, defineAsset, type Mesh, merge, type Vec3 } from '../core/index.ts';
import { sd, sdf } from '../primitives/index.ts';
import { connectionReport } from './connections.ts';

const ball = (at: Vec3, r: number): Mesh =>
  sdf({
    field: sd.sphere(at, r),
    bounds: [
      [at[0] - r * 1.2, at[1] - r * 1.2, at[2] - r * 1.2],
      [at[0] + r * 1.2, at[1] + r * 1.2, at[2] + r * 1.2],
    ],
    resolution: r / 6,
    color: [0.5, 0.5, 0.5],
  });

/** Where each loose shell of the one merged part sits along x: trunk 0, speck 2. */
const looseAt = (medium: 'ground' | 'water'): number[] =>
  connectionReport(
    compile(
      defineAsset({
        name: 'water_probe',
        kind: 'creature',
        medium,
        budget: { triangles: [400000, 400000, 400000] },
        build: (ctx) => {
          ctx.part('animal', merge([ball([0, 0, 1], 0.4), ball([2, 0, 0.1], 0.1)]));
        },
      }),
    ),
  ).issues.map((i) => Math.round(i.at[0]));

describe('connections in water', () => {
  it('anchors on the largest body and reports the detached shell near z = 0', () => {
    expect(looseAt('water')).toEqual([2]);
  });

  it('on the ground the shell on the floor is the held one', () => {
    expect(looseAt('ground')).toEqual([0]);
  });
});
