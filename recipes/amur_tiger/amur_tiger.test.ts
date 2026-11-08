// The tiger's own tests: the real numbers README.md argues from (lengths, mass, limb allometry),
// stance, appendages that grow out of the body (ears, tail, claws, teeth, jaw), the eye-socket
// rules, LOD2 keeping LOD0's outline, and left/right symmetry of the form with asymmetric stripes.
// Heavy (LOD0 compiles): `bun test recipes/amur_tiger`.

import { describe, expect, it } from 'bun:test';
import { compile, massProperties, type Vec3, worldMeshes } from '@developerz.ai/ts23d';
import {
  assertCentreOfMassInside,
  assertLodSilhouette,
  assertSymmetric,
  assertTouches,
  assertUprightOnGround,
} from '@developerz.ai/ts23d/testing';
import { v3 } from '../_lib/creature/curve.ts';
import { hit } from '../_lib/creature/probe.ts';
import { amur_tiger } from './amur_tiger.ts';
import {
  AREA_PER_VOLUME,
  allometry,
  EFFECTIVE_DENSITY,
  fieldVolume,
  headBodyLength,
  massFromLimbs,
  tailLength,
} from './biology.ts';
import { bodyField } from './body.ts';
import { gazeYaw } from './eyes.ts';
import { EYE } from './face.ts';
import { headMeshes } from './head.ts';
import { foreToes, hindToes } from './paws.ts';
import { HEAD, REAL } from './skeleton.ts';
import { UPPER_CANINE } from './teeth.ts';

const SLOW = 240_000;
const within = (v: number, real: number, tol: number): void => {
  expect(v).toBeGreaterThan(real * (1 - tol));
  expect(v).toBeLessThan(real * (1 + tol));
};

describe('real numbers', () => {
  it('fails on an impossible limb: a 1 cm bone circumference carries grams, not a tiger', () => {
    expect(massFromLimbs(10)).toBeLessThan(1);
  });

  it('head + body 1.95 m (±2%) and tail 0.99 m (±3%), Kerley et al. 2005', () => {
    within(headBodyLength(), REAL.headBody, 0.02);
    within(tailLength(), REAL.tail, 0.03);
  });

  it('union volume of the body sculpt (no double counting) × the furred density is in the sourced range', () => {
    const v = fieldVolume(bodyField(1), [-1, -0.32, 0], [1, 0.32, 1.05], 0.012);
    // Mazák 1981: wild males 180–306 kg.
    expect(v * EFFECTIVE_DENSITY).toBeGreaterThan(180);
    expect(v * EFFECTIVE_DENSITY).toBeLessThan(306);
  });

  it('the coat shell assumption holds: measured surface ÷ volume within 10% of AREA_PER_VOLUME', () => {
    const a = compile(amur_tiger, { lod: 1 });
    let area = 0;
    for (const m of worldMeshes(a.parts).values()) {
      const P = m.positions;
      const I = m.indices;
      for (let t = 0; t < I.length; t += 3) {
        const [i, j, k] = [(I[t] ?? 0) * 3, (I[t + 1] ?? 0) * 3, (I[t + 2] ?? 0) * 3];
        const u: Vec3 = [
          (P[j] ?? 0) - (P[i] ?? 0),
          (P[j + 1] ?? 0) - (P[i + 1] ?? 0),
          (P[j + 2] ?? 0) - (P[i + 2] ?? 0),
        ];
        const w: Vec3 = [
          (P[k] ?? 0) - (P[i] ?? 0),
          (P[k + 1] ?? 0) - (P[i + 1] ?? 0),
          (P[k + 2] ?? 0) - (P[i + 2] ?? 0),
        ];
        area += v3.len(v3.cross(u, w)) / 2;
      }
    }
    const volume = massProperties(a).computedMass / EFFECTIVE_DENSITY;
    within(area / volume, AREA_PER_VOLUME, 0.1);
  });

  it('the compiled mass (QA mass gate inputs) is within the declared ±25% of 243 kg', () => {
    const m = massProperties(compile(amur_tiger, { lod: 1 })).computedMass;
    within(m, REAL.mass, 0.25);
  });

  it('leg allometry: humerus + femur carry a tiger (Campione & Evans 2012), not a cat or a horse', () => {
    const a = allometry(bodyField(1));
    // A tiger's limbs predict ~150–350 kg; deer legs would predict tens of kg.
    expect(a.mass).toBeGreaterThan(REAL.mass * 0.6);
    expect(a.mass).toBeLessThan(REAL.mass * 1.6);
  });
});

describe('stance', () => {
  it(
    'stands on its four paws',
    () => {
      assertUprightOnGround(amur_tiger, { lods: [1] });
    },
    SLOW,
  );
  it(
    'centre of mass over the feet',
    () => {
      assertCentreOfMassInside(amur_tiger, { lods: [1] });
    },
    SLOW,
  );
});

describe('appendages grow out of the body', () => {
  it(
    'ears touch the head, the tail its stump, claws the toes, the jaw the head, at LOD0–1',
    () => {
      for (const s of ['l', 'r']) assertTouches(amur_tiger, `ear_${s}`, 'head', { lods: [0, 1] });
      assertTouches(amur_tiger, 'tail', 'body', { lods: [0, 1, 2] });
      assertTouches(amur_tiger, 'claws', 'body', { lods: [0, 1] });
      assertTouches(amur_tiger, 'jaw', 'head', { lods: [0, 1] });
    },
    SLOW,
  );

  it('upper canines are rooted in the gum (root inside the head sculpt)', () => {
    const f = headMeshes(1).field;
    expect(f(UPPER_CANINE.root)).toBeLessThan(-0.002);
    expect(f([UPPER_CANINE.root[0], -UPPER_CANINE.root[1], UPPER_CANINE.root[2]])).toBeLessThan(
      -0.002,
    );
  });

  it('every claw starts inside its toe', () => {
    const f = bodyField(0);
    for (const t of [...foreToes(), ...hindToes()]) {
      const base = v3.add(t.at, [t.dir[0] * t.r * 0.55, t.dir[1] * t.r * 0.55, -t.r * 0.05]);
      expect(f(base)).toBeLessThan(0);
    }
  });
});

describe('eyes sit in sockets', () => {
  const f = headMeshes(0).field;
  const c = EYE.centre;
  const r = EYE.r;
  const blocked = (dir: Vec3, reach: number): boolean => hit(f, c, dir, reach, 0.001) !== null;

  it('the orbit encloses the back of the ball (≥ 90% of rearward rays meet bone within 1.8 r)', () => {
    let n = 0;
    let k = 0;
    for (let a = 0; a < 12; a++)
      for (let b = 1; b < 6; b++) {
        const th = (b / 6) * Math.PI;
        const ph = (a / 12) * Math.PI * 2;
        const d: Vec3 = [
          -Math.abs(Math.cos(th)) - 0.2,
          Math.sin(th) * Math.cos(ph),
          Math.sin(th) * Math.sin(ph),
        ];
        n++;
        if (blocked(v3.norm(d), r * 1.8)) k++;
      }
    expect(k / n).toBeGreaterThanOrEqual(0.9);
  });

  it('the pupil looks out unobstructed, and the upper lid covers the top of the ball', () => {
    expect(blocked([1, 0, 0], r * 2.5)).toBe(false);
    expect(blocked(v3.norm([0.35, 0, 1]), r * 1.6)).toBe(true);
  });

  it('gaze converges (never wall-eyed): left yaws inward, right mirrors it', () => {
    expect(gazeYaw(1)).toBeLessThanOrEqual(0);
    expect(gazeYaw(-1)).toBeCloseTo(-gazeYaw(1), 9);
  });

  it('eyes sit at half the head height under the brow (head-local z between muzzle and crown)', () => {
    expect(c[2]).toBeGreaterThan(HEAD.mouthZ);
    expect(c[2]).toBeLessThan(HEAD.cranium[2] + 0.05);
  });
});

describe('LOD and symmetry', () => {
  it(
    'LOD2 keeps ≥ 90% of the LOD0 outline from the front and the side',
    () => {
      assertLodSilhouette(amur_tiger, 0.9, { views: ['+X', '-Y'] });
    },
    SLOW,
  );

  it(
    'the form mirrors left/right within 5 mm, but the stripes do not',
    () => {
      const a = compile(amur_tiger, { lod: 1 });
      assertSymmetric(a, 'y', 0.005, { parts: ['body', 'head', 'jaw'] });
      // Colour: compare each body vertex with its mirror twin (the sculpt grid is snapped
      // symmetric, so twins exist); real tigers' flanks differ, so many must differ.
      const m = worldMeshes(a.parts).get('body');
      expect(m).toBeDefined();
      if (!m) return;
      const key = (x: number, y: number, z: number): string =>
        `${Math.round(x * 2000)},${Math.round(y * 2000)},${Math.round(z * 2000)}`;
      const at = new Map<string, number>();
      const P = m.positions;
      for (let i = 0; i < P.length / 3; i++)
        at.set(key(P[i * 3] ?? 0, P[i * 3 + 1] ?? 0, P[i * 3 + 2] ?? 0), i);
      let pairs = 0;
      let differ = 0;
      const C = m.colors;
      for (let i = 0; i < P.length / 3; i++) {
        if ((P[i * 3 + 1] ?? 0) <= 0.01) continue;
        const j = at.get(key(P[i * 3] ?? 0, -(P[i * 3 + 1] ?? 0), P[i * 3 + 2] ?? 0));
        if (j === undefined) continue;
        pairs++;
        const d =
          Math.abs((C[i * 3] ?? 0) - (C[j * 3] ?? 0)) +
          Math.abs((C[i * 3 + 1] ?? 0) - (C[j * 3 + 1] ?? 0));
        if (d > 0.1) differ++;
      }
      expect(pairs).toBeGreaterThan(1000);
      expect(differ / pairs).toBeGreaterThan(0.05);
    },
    SLOW,
  );
});
