// Robustness: an author nudging `build.width` or `build.limbs` by a few percent must not flip
// QA `connections` (a seam where a muscle or the ruff meets the trunk at a marginal blend, a claw
// root showing on a small paw). Two presets, each knob at ±5 %, LOD0, connections green.

import { describe, expect, it } from 'bun:test';
import { compile } from '../core/index.ts';
import { connections } from '../qa/index.ts';
import { defineCreature } from './creature.ts';
import type { CreatureSpec } from './creature-spec.ts';

const COLOURS: CreatureSpec['colours'] = {
  coat: [0.36, 0.27, 0.17],
  nose: [0.02, 0.02, 0.02],
  iris: [0.6, 0.4, 0.1],
  keratin: [0.1, 0.09, 0.08],
};

/** A ruffed 40 kg canid in winter coat (the grey wolf's numbers). */
const WOLF: CreatureSpec = {
  skeleton: 'quadruped',
  family: 'canid',
  mass: 40,
  length: 1.15,
  height: 0.8,
  head: 0.275,
  neck: 0.25,
  tail: 0.42,
  build: { depth: 0.51, width: 0.54, limbs: 1.07, tailGirth: 3.2, ruff: 0.04, tuck: 0.73 },
  face: { preset: 'canid', muzzle: 0.43, width: 0.62, tip: 0.115, stop: 0.24, cheek: 0.15 },
  coat: 0.03,
  cards: false,
  colours: COLOURS,
  pose: { head: 12, neck: 45, tail: 'hang' },
};

/** A 6 kg canid on 2 cm paws (the red fox's numbers): the smallest claws the kind roots. */
const FOX: CreatureSpec = {
  ...WOLF,
  mass: 6,
  length: 0.68,
  height: 0.425,
  head: 0.16,
  neck: 0.166,
  build: { depth: 0.48, width: 0.62, limbs: 1.06, tailGirth: 3.3, ruff: 0.016, tuck: 0.88 },
  face: { preset: 'canid', muzzle: 0.52, width: 0.5 },
  coat: 0.022,
  pose: { head: 10, neck: 36, tail: 'level' },
};

const findings = (spec: CreatureSpec, knob: 'width' | 'limbs', k: number): string[] => {
  const build = { ...spec.build, [knob]: (spec.build?.[knob] ?? 1) * k };
  const asset = compile(defineCreature({ name: 'sweep', spec: { ...spec, build } }), { lod: 0 });
  return connections(asset).map((f) => `${knob} ×${k}: ${f.message}`);
};

describe('connections stay green under ±5 % of width and limbs', () => {
  for (const [name, spec] of [
    ['wolf', WOLF],
    ['fox', FOX],
  ] as const)
    for (const knob of ['width', 'limbs'] as const)
      it(`${name}: build.${knob} × 0.95 and × 1.05`, () => {
        expect([...findings(spec, knob, 0.95), ...findings(spec, knob, 1.05)]).toEqual([]);
      }, 600_000);
});
