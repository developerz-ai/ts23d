// Creature clips: which clips a body gets, the reserved `run` never among them, helpers keyed at
// half their joint, weights split onto them on the 1/255 grid.

import { describe, expect, it } from 'bun:test';
import { RUN_CLIP } from '../core/index.ts';
import { creaturePlan } from './creature.ts';
import { clipEnvelope, creatureArmature, creatureClips, quadrupedRig } from './creature-clips.ts';
import { halfTurn, MID, midBones, splitMid } from './creature-helpers.ts';
import { rigBones } from './creature-limits.ts';
import type { CreatureSpec } from './creature-spec.ts';
import { GAITS } from './gait.ts';
import { gaitClip } from './gait-bake.ts';

const colours = {
  coat: [0.5, 0.45, 0.4],
  belly: [0.8, 0.78, 0.7],
  nose: [0.05, 0.05, 0.05],
  iris: [0.6, 0.4, 0.1],
  keratin: [0.1, 0.09, 0.08],
} as const;
const wolf: CreatureSpec = { skeleton: 'quadruped', mass: 40, length: 1.15, height: 0.8, colours };

describe('creature clips', () => {
  it('a body with no four-legged rig gets no gaits (a serpent idles, looks and bites)', () => {
    const snake: CreatureSpec = { skeleton: 'serpent', mass: 5, length: 2, height: 0.08, colours };
    const plan = creaturePlan(snake);
    expect(quadrupedRig(rigBones(plan.bones, null, null), '')).toBeNull();
    const names = creatureClips(plan.bones, snake).map((c) => c.name);
    expect(names).not.toContain('walk');
    expect(names).toContain('bite');
  });

  it('a quadruped idles, looks, bites, walks, trots and gallops; `run` stays reserved', () => {
    const names = creatureClips(creaturePlan(wolf).bones, wolf, 'w_').map((c) => c.name);
    expect(names).toEqual(['idle', 'look', 'bite', 'walk', 'trot', 'gallop']);
    expect(names).not.toContain(RUN_CLIP);
  });

  it('keys every helper at half its joint', () => {
    const { bones } = creaturePlan(wolf);
    const walk = creatureClips(bones, wolf).find((c) => c.name === 'walk');
    const track = (b: string) =>
      walk?.tracks.find((t) => 'bone' in t && t.bone === b && t.path === 'rotation');
    const knee = track('hind_l_1');
    const mid = track(`hind_l_1${MID}`);
    expect(knee && mid).toBeTruthy();
    const q = [0, 1, 2, 3].map((k) => knee?.values[20 + k] ?? 0) as [
      number,
      number,
      number,
      number,
    ];
    expect([...(mid?.values.subarray(20, 24) ?? [])].map((v) => Math.round(v * 1e5))).toEqual(
      halfTurn(q).map((v) => Math.round(v * 1e5)),
    );
  });

  it('moves the shared parent/bone weight onto the helper, sums unchanged', () => {
    const bones = rigBones(creaturePlan(wolf).bones, null, null);
    expect(midBones(bones, '').length).toBe(12);
    const mesh = (wp: number, wj: number) => ({
      positions: new Float32Array(3),
      normals: new Float32Array(3),
      uvs: new Float32Array(2),
      colors: new Float32Array(3),
      indices: new Uint32Array(0),
      joints: Uint16Array.from([0, 1, 0, 0]),
      weights: Float32Array.from([wp / 255, wj / 255, 0, 0]),
    });
    const split = (wp: number, wj: number) => {
      const out = splitMid(mesh(wp, wj), [[0, 1, 2]]);
      const w = [...(out.weights ?? [])].map((x) => Math.round(x * 255));
      expect(w.reduce((x, y) => x + y, 0)).toBe(255);
      return { joints: [...(out.joints ?? [])], w };
    };
    // The parent empties into the helper.
    expect(split(100, 155)).toEqual({ joints: [2, 1, 0, 0], w: [200, 55, 0, 0] });
    // The bone would empty: it keeps one step (it still drives a vertex), the helper takes a slot.
    expect(split(155, 100)).toEqual({ joints: [0, 1, 2, 0], w: [56, 1, 198, 0] });
  });
});

describe('limits from the creature’s own clips', () => {
  it('a deer’s leg limits follow its own baked excursion, not a canid table', () => {
    const deer: CreatureSpec = {
      skeleton: 'quadruped',
      family: 'cervid',
      stance: 'unguligrade',
      mass: 180,
      length: 2,
      height: 1.2,
      colours,
    };
    const { bones } = creaturePlan(deer);
    const arm = creatureArmature(bones, deer);
    const env = clipEnvelope(arm.clips, rigBones(bones, null, null));
    for (const name of ['fore_l_0', 'fore_l_2', 'hind_l_1']) {
      const lim = arm.bones.find((b) => b.name === name)?.limit;
      const e = env.get(name) ?? [0, 0];
      const passive = rigBones(bones, null, null).find((b) => b.name === name)?.limit;
      expect(lim?.max).toBeCloseTo(Math.min(passive?.max ?? 0, Math.max(0, e[1] + 3)), 1);
      expect(lim?.min).toBeCloseTo(Math.max(passive?.min ?? 0, Math.min(0, e[0] - 3)), 1);
    }
  });
});

describe('scapula', () => {
  const deer: CreatureSpec = {
    skeleton: 'quadruped',
    family: 'cervid',
    stance: 'unguligrade',
    mass: 180,
    length: 2,
    height: 1.2,
    colours,
  };
  const { bones } = creaturePlan(deer);
  /** The gallop's widest shoulder (humerus on its parent) flexion, degrees. */
  const shoulder = (scapula: boolean): number => {
    const arm = rigBones(bones, null, null, '', new Map(), scapula);
    const rig = quadrupedRig(arm, '');
    if (!rig) throw new Error('no rig');
    const { clip } = gaitClip('gallop', rig, GAITS.gallop, rig.legs.lh[0].head[2]);
    return clipEnvelope([clip], arm).get('fore_l_0')?.[1] ?? 0;
  };

  it('without a scapula the gallop folds the shoulder past 40° (QA deform: 51–56 % kept, < 60 %)', () => {
    expect(shoulder(false)).toBeGreaterThan(40);
  });

  it('with one the scapula carries the swing: the shoulder stays under 35°, feet still planted', () => {
    expect(shoulder(true)).toBeLessThan(35);
    const arm = rigBones(bones, null, null);
    expect(arm.find((b) => b.name === 'fore_l_0')?.parent).toBe('scapula_l');
    const rig = quadrupedRig(arm, '');
    if (!rig) throw new Error('no rig');
    expect(gaitClip('gallop', rig, GAITS.gallop, rig.legs.lh[0].head[2]).miss).toBeLessThan(1e-3);
  });

  it('only quadrupeds get one (a biped and a bird keep their bones)', () => {
    for (const skeleton of ['biped', 'bird'] as const) {
      const s: CreatureSpec = { skeleton, mass: 5, length: 0.6, height: 0.5, colours };
      expect(
        rigBones(creaturePlan(s).bones, null, null).some((b) => b.name.startsWith('scapula')),
      ).toBe(false);
    }
  });
});
