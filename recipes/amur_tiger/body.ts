// Body: torso + neck (torso.ts), four legs (legs.ts) and paws (paws.ts) and the tail stump, as ONE
// mirrored sculpt so every join is a smooth blend; fur relief (fur.ts) at LOD0; vertex colour from
// the coat (coat.ts: zones, stripes, value grade) and the painted tone (ground occlusion, cavity).

import type { Field, Mesh, SculptEdit } from '@developerz.ai/ts23d';
import { merge, sculptField } from '@developerz.ai/ts23d';
import { sculptPart } from '../_lib/creature/sculpt-part.ts';
import { bodyPaint } from './coat.ts';
import { bodyFur, furClumps } from './fur.ts';
import { legEdits, legsLowpoly } from './legs.ts';
import { C } from './palette.ts';
import { blockOut, features, planes } from './torso.ts';

/** Every edit of the body sculpt at this LOD (left side; the sculpt mirrors). */
export function bodyEdits(lod: number): SculptEdit[] {
  return [
    ...blockOut(),
    ...planes(),
    ...features(lod),
    ...legEdits(lod),
    ...furClumps(lod),
    // Flat soles: paws rest on the ground plane.
    { shape: 'roundBox', at: [0, 0, -0.5], size: [6, 6, 1], op: 'subtract', blend: 0.004 },
  ];
}

/** The plain body field (folded |y|), for probes and tests. */
export function bodyField(lod: number): Field {
  const f = sculptField(bodyEdits(lod), { color: C.orange }).field;
  return (p) => f([p[0], Math.abs(p[1]), p[2]]);
}

/** Sculpt cell per LOD (metres). */
export const BODY_RES = [0.012, 0.027, 0.078] as const;

export function bodyMesh(lod: 0 | 1 | 2): Mesh {
  const main = sculptPart({
    edits: bodyEdits(lod),
    res: BODY_RES[lod],
    color: C.orange,
    mirror: true,
    tone: { reach: lod === 0 ? 0.05 : 0.08, ground: 0.35, strength: 0.75, edge: 0.15 },
    paint: bodyPaint(lod),
    ...(lod === 0 ? { relief: bodyFur() } : {}),
    // Far LOD: coarse marching cubes cut convex curves short; grow the shell back by ~⅕ cell.
    ...(lod === 2 ? { relief: { amp: 0.014, at: () => 0.014 } } : {}),
  }).mesh;
  return lod === 2 ? merge([main, legsLowpoly(bodyPaint(2))]) : main;
}
