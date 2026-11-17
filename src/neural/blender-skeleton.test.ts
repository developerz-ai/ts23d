import { describe, expect, test } from 'bun:test';
import type { Armature } from '../core/index.ts';
import { BLENDER_SKELETON_CONTRACT, skeletonJson } from './blender-skeleton.ts';

const doc = (a: Armature): { contract: string; frame: string; bones: Record<string, unknown>[] } =>
  JSON.parse(new TextDecoder().decode(skeletonJson(a)));

describe('skeletonJson', () => {
  test('refuses a skeleton that is not one', () => {
    const lost: Armature = {
      bones: [{ name: 'head', parent: 'neck', head: [0, 0, 1], tail: [0, 0, 1.2] }],
    };
    expect(() => skeletonJson(lost, 'wolf')).toThrow(/T3D_RECIPE_INVALID.*'wolf'.*'neck'/s);
    const flat: Armature = { bones: [{ name: 'hips', head: [0, 0, 1], tail: [0, 0, 1] }] };
    expect(() => skeletonJson(flat)).toThrow(/head and tail coincide/);
  });

  test('glTF frame: asset (x, y, z) → (y, z, x); parents come first whatever the order', () => {
    const d = doc({
      bones: [
        { name: 'head', parent: 'spine', head: [0.5, 0.1, 1], tail: [0.8, 0.1, 1.1] },
        { name: 'spine', head: [0, 0, 0.9], tail: [0.5, 0, 1] },
      ],
    });
    expect(d.contract).toBe(BLENDER_SKELETON_CONTRACT);
    expect(d.frame).toBe('gltf');
    expect(d.bones).toEqual([
      { name: 'spine', parent: null, head: [0, 0.9, 0], tail: [0, 1, 0.5] },
      { name: 'head', parent: 'spine', head: [0.1, 1, 0.5], tail: [0.1, 1.1, 0.8] },
    ]);
  });

  test('same skeleton, same bytes (limits are not part of the file)', () => {
    const a: Armature = { bones: [{ name: 'hips', head: [0, 0, 1], tail: [0.2, 0, 1] }] };
    const b: Armature = {
      bones: [
        {
          tail: [0.2, 0, 1],
          head: [0, 0, 1],
          name: 'hips',
          limit: { axis: [0, 1, 0], min: -10, max: 10 },
        },
      ],
    };
    expect(skeletonJson(a)).toEqual(skeletonJson(b));
  });
});
