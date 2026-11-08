// The wolf's own tests: the sourced numbers (README table) held against the skeleton the kind
// built and the compiled mesh (head-body, tail, withers, mass), standing and balance, LOD2 keeping
// the outline. Heavy-ish (LOD1 compiles): `bun test recipes/wolf`.

import { describe, expect, it } from 'bun:test';
import {
  compile,
  creaturePlan,
  massProperties,
  type Vec3,
  worldMeshes,
} from '@developerz.ai/ts23d';
import {
  assertCentreOfMassInside,
  assertLodSilhouette,
  assertUprightOnGround,
} from '@developerz.ai/ts23d/testing';
import { REAL, WOLF, wolf } from './wolf.ts';

const SLOW = 120_000;
const dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const within = (v: number, real: number, tol: number): void => {
  expect(v).toBeGreaterThan(real * (1 - tol));
  expect(v).toBeLessThan(real * (1 + tol));
};

describe('real numbers (Wikipedia: Wolf)', () => {
  const { bones, biology } = creaturePlan(WOLF);

  it('refuses a 40 kg wolf on twig legs before sculpting anything', () => {
    expect(() => creaturePlan({ ...WOLF, build: { ...WOLF.build, limbs: 0.3 } })).toThrow(
      'allometry',
    );
  });

  it('head + body 1.15 m nose → tail root (±2%), tail 0.42 m along its curve (±5%)', () => {
    within(dist(bones.nose, bones.tailRoot), REAL.headBody, 0.02);
    let tail = 0;
    for (let i = 1; i < bones.tail.length; i++)
      tail += dist(bones.tail[i]?.at ?? [0, 0, 0], bones.tail[i - 1]?.at ?? [0, 0, 0]);
    within(tail, REAL.tail, 0.05);
  });

  it('limbs carry the declared 40 kg (Campione & Evans band ×0.5–×2.5)', () => {
    within(biology.limbMass ?? 0, REAL.mass, 0.5);
  });

  it(
    'withers in the sourced 0.80–0.85 m (+1 cm mane): the top of the body over the fore paws',
    () => {
      const c = compile(wolf, { lod: 1 });
      const body = worldMeshes(c.parts).get('body');
      const fore = bones.legs.find((l) => l.name === 'fore')?.foot[0] ?? 0;
      let top = 0;
      const P = body?.positions ?? new Float32Array();
      for (let i = 0; i < P.length; i += 3)
        if (Math.abs((P[i] ?? 0) - (fore - 0.08)) < 0.03 && Math.abs(P[i + 1] ?? 1) < 0.03)
          top = Math.max(top, P[i + 2] ?? 0);
      expect(top).toBeGreaterThan(0.8);
      expect(top).toBeLessThan(0.86);
    },
    SLOW,
  );

  it(
    'volume × furred density weighs 30–60 kg (the sourced adult range)',
    () => {
      const m = massProperties(compile(wolf, { lod: 1 })).mass;
      expect(m).toBeGreaterThan(30);
      expect(m).toBeLessThan(60);
    },
    SLOW,
  );
});

describe('stance and outline', () => {
  it('stands on the ground at every LOD', () => void assertUprightOnGround(wolf), SLOW);
  it(
    'centre of mass over the four paws',
    () => void assertCentreOfMassInside(wolf, { lods: [1] }),
    SLOW,
  );
  it('LOD2 keeps the LOD0 outline', () => void assertLodSilhouette(wolf, 0.85), SLOW);
});
