import { describe, expect, it } from 'bun:test';
import { compile, defineAsset, dmath, type NeuralReader, type Vec3 } from '../core/index.ts';
import { writeMeshGlb } from '../neural/index.ts';
import { box, sdf } from '../primitives/index.ts';
import { orthoCamera, partMasks } from '../render/index.ts';
import { cropPart, fitIntoBox, splitParts } from './split-parts.ts';

const body = defineAsset({
  name: 'robot',
  kind: 'prop',
  budget: { triangles: [100, 100, 100] },
  build(ctx) {
    ctx.part('torso', box({ size: [0.4, 0.4, 0.6], color: [1, 1, 1] }));
    ctx.part('head', box({ size: [0.2, 0.2, 0.2], at: [0, 0, 0.6], color: [1, 1, 1] }));
  },
});
const size = 120;
const masks = partMasks(
  compile(body),
  orthoCamera({ label: 'front', dir: [-1, 0, 0], up: [0, 0, 1] }, [0, 0, 0.4], 0.8, size),
  size,
  size,
);
/** The "concept": red where the torso is, blue where the head is, grey elsewhere. */
const concept = {
  width: size,
  height: size,
  rgba: Uint8Array.from({ length: size * size * 4 }, (_, i) => {
    const id = masks.ids[Math.floor(i / 4)];
    const c = i % 4;
    if (c === 3) return 255;
    return id === 0 ? ([200, 30, 30][c] ?? 0) : id === 1 ? ([30, 30, 200][c] ?? 0) : 128;
  }),
};
const sphere = sdf({
  field: (p) => dmath.norm(p) - 1,
  bounds: [
    [-1.1, -1.1, -1.1],
    [1.1, 1.1, 1.1],
  ],
  resolution: 0.25,
  color: [0.5, 0.5, 0.5],
});
const glb = writeMeshGlb([{ name: 'm', mesh: sphere }]);
const boxes: Record<string, readonly [Vec3, Vec3]> = {
  torso: [
    [-0.2, -0.2, 0],
    [0.2, 0.2, 0.6],
  ],
  head: [
    [-0.1, -0.1, 0.6],
    [0.1, 0.1, 0.8],
  ],
};

describe('split-part generation', () => {
  it('crops each part with its mask: only that part, the rest painted background', () => {
    const head = cropPart(concept, masks, 'head', 0.2);
    const torso = cropPart(concept, masks, 'torso', 0.2);
    if (!head || !torso) throw new Error('no crop');
    expect(head.sha256).not.toBe(torso.sha256);
    expect(cropPart(concept, masks, 'tail')).toBe(null);
  });

  it('fits a result into its part box, uniformly', () => {
    const f = fitIntoBox(
      sphere,
      boxes['head'] ?? [
        [0, 0, 0],
        [1, 1, 1],
      ],
    );
    expect(f.s).toBeCloseTo(0.1, 2);
    expect(f.t[2]).toBeCloseTo(0.7, 4);
  });

  it('a miss on any part → null (the code parts stay); hits → one blended field edit per part', () => {
    const asked: string[] = [];
    const miss: NeuralReader = () => null;
    const hit = ((task: string, req: { image?: { sha256: string } }) => {
      asked.push(`${task}:${req.image?.sha256.slice(0, 6)}`);
      return { outputs: [{ bytes: glb, mime: 'model/gltf-binary' }] };
    }) as unknown as NeuralReader;
    const o = {
      concept,
      masks,
      boxes,
      request: { seed: 1 },
      cell: 0.02,
      blend: 0.01,
      licence: 'MIT',
    };
    expect(splitParts({ neural: miss }, o)).toBe(null);
    const edits = splitParts({ neural: hit }, o);
    expect(edits?.length).toBe(2);
    expect(new Set(asked).size).toBe(2);
    const head = edits?.[0];
    expect(head?.blend).toBe(0.01);
    expect(head?.field([0, 0, 0.7]) ?? 1).toBeLessThan(0);
    expect(head?.field([0, 0, 0.3]) ?? -1).toBeGreaterThan(0);
  });
});
