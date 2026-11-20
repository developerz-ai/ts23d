// `armatureOf`: the head hangs from the bone next to it. A chain body (the serpent) runs head → tail,
// so its neighbour is the first spine bone, while every other skeleton keeps the last one.

import { describe, expect, it } from 'bun:test';
import type { Bone, Vec3 } from '../core/index.ts';
import { dmath } from '../core/index.ts';
import { armatureOf } from './creature-bones.ts';
import { bonesOf } from './creature-skeleton.ts';
import type { CreatureSpec } from './creature-spec.ts';

const grey: Vec3 = [0.3, 0.3, 0.2];
const colours = { coat: grey, nose: grey, iris: grey, keratin: grey };
const snake: CreatureSpec = { skeleton: 'serpent', mass: 3, length: 2, height: 0.07, colours };
const wolf: CreatureSpec = {
  skeleton: 'quadruped',
  stance: 'digitigrade',
  mass: 40,
  length: 1.1,
  height: 0.8,
  colours,
};

const named = (bones: readonly Bone[], name: string): Bone | undefined =>
  bones.find((x) => x.name === name);
const gap = (a: Vec3, b: Vec3): number => dmath.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('armatureOf head parent', () => {
  it('a serpent head hangs from the spine bone at the neck, not the tail tip', () => {
    const bones = armatureOf(bonesOf(snake), null);
    const head = named(bones, 'head');
    expect(head?.parent).toBe('spine_0');
    const parent = named(bones, head?.parent ?? '');
    expect(gap(parent?.head ?? [9, 9, 9], head?.head ?? [0, 0, 0])).toBeLessThan(0.1);
  });

  it('a legged skeleton keeps its head on the last neck bone', () => {
    const bones = armatureOf(bonesOf(wolf), null);
    const necks = bones.filter((b) => /^neck_\d+$/.test(b.name));
    expect(named(bones, 'head')?.parent).toBe(necks[necks.length - 1]?.name);
  });
});
