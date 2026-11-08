// Fur as form (no cards or shells yet: planned, M4): the winter coat's clumps as sculpt edits —
// the belly fringe hanging in tufts, the shaggy chest, the elbow tufts — and a strand relief at
// LOD0: value noise stretched along the hair flow (back along the trunk, down the flanks and
// legs), so raking light shows the coat's lie instead of a plastic shell. Hashes, no randomness.

import type { SculptEdit } from '@developerz.ai/ts23d';
import { smoothstep } from '../_lib/creature/curve.ts';
import type { Relief } from '../_lib/creature/sculpt-part.ts';
import { skin } from '../_lib/creature/skin.ts';
import { tuftEdit } from './ruff.ts';
import { hash } from './stripes.ts';

/** Trilinear value noise on an integer lattice, 0..1. */
export function valueNoise(x: number, y: number, z: number, salt: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const sz = fz * fz * (3 - 2 * fz);
  const h = (i: number, j: number, k: number): number =>
    hash(((ix + i) * 73856093) ^ ((iy + j) * 19349663) ^ ((iz + k) * 83492791), salt);
  const l = (a: number, b: number, t: number): number => a + (b - a) * t;
  return l(
    l(l(h(0, 0, 0), h(1, 0, 0), sx), l(h(0, 1, 0), h(1, 1, 0), sx), sy),
    l(l(h(0, 0, 1), h(1, 0, 1), sx), l(h(0, 1, 1), h(1, 1, 1), sx), sy),
    sz,
  );
}

/** Strand relief: long along the flow, narrow across it; clumps on top. */
export function bodyFur(): Relief {
  const amp = 0.0024;
  return {
    amp,
    at: (p) => {
      const [x, y, z] = p;
      // Flow: along the trunk above the legs (−X), down the legs (−Z) below.
      const leg = smoothstep(0.5, 0.38, z);
      const along = x * (1 - leg) + z * leg;
      const a = along / 0.045;
      const strands = valueNoise(a, y / 0.006, (z * (1 - leg) + x * leg) / 0.006, 7);
      const clumps = valueNoise(a * 0.5, y / 0.022, (z * (1 - leg) + x * leg) / 0.022, 8);
      return amp * ((strands - 0.5) * 0.9 + (clumps - 0.5) * 0.7);
    },
  };
}

/** Coat clumps (left; mirrored): belly fringe ridge, chest shag, elbow tufts. */
export function furClumps(lod: number): SculptEdit[] {
  if (lod === 2) return [];
  // Belly fringe: the long winter belly hair as one soft ridge along the underside (tried as
  // separate tufts: they read as teats in raking light).
  const out: SculptEdit[] = [
    skin(
      [
        { at: [-0.42, 0, 0.48], r: 0.03 },
        { at: [-0.3, 0, 0.46], r: 0.045 },
        { at: [-0.05, 0, 0.465], r: 0.045 },
        { at: [0.2, 0, 0.45], r: 0.035 },
      ],
      { blend: 0.08 },
    ),
  ];
  // Chest shag between the forelegs.
  for (let i = 0; i < (lod === 0 ? 4 : 2); i++)
    out.push(
      tuftEdit(
        [0.6 - i * 0.04, 0.03 + 0.02 * i, 0.5 - i * 0.012],
        [0.25, 0.1, -1],
        0.04,
        0.025,
        0.04,
      ),
    );
  // Elbow tuft behind the fore leg.
  out.push(tuftEdit([0.37, 0.142, 0.44], [-1, 0.2, -0.6], 0.035, 0.022, 0.02));
  return out;
}
