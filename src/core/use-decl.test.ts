import { describe, expect, it } from 'bun:test';
import { box } from '../primitives/index.ts';
import { compile, defineAsset } from './asset.ts';
import type { CompiledAsset } from './definition.ts';

const grey: [number, number, number] = [0.5, 0.5, 0.5];

// What a child's check saw: the part names and the lens's offset in the frame it was run in.
let seen: { names: string[]; lens: readonly number[] | undefined }[] = [];
const lamp = defineAsset({
  name: 'lamp',
  kind: 'prop',
  budget: { triangles: [999, 999, 999] },
  glow: [{ parts: ['lens*'], strength: 2 }],
  gaps: [{ parts: ['door', 'frame'], why: 'service door seam' }],
  creases: [{ name: 'model_surface', part: 'frame', at: [1, 0, 0], radius: 0.1 }],
  limitTolerances: { hinge: { stretch: 5, why: 'the door skin folds at the hinge' } },
  checks: [
    (a: CompiledAsset) => {
      seen.push({
        names: a.parts.map((p) => p.name),
        lens: a.parts.find((p) => p.name === 'lens')?.at,
      });
      return [];
    },
  ],
  build(ctx) {
    ctx.part('frame', box({ size: [0.2, 0.2, 0.4], color: grey }));
    ctx.part('door', box({ size: [0.02, 0.2, 0.4], color: grey }), { at: [0.11, 0, 0] });
    ctx.part('lens', box({ size: [0.1, 0.1, 0.1], color: grey }), { at: [0, 0, 0.25] });
    ctx.bone('hinge', {
      head: [0, 0, 0],
      tail: [0, 0, 0.4],
      limit: { axis: [0, 0, 1], min: -1, max: 1 },
    });
  },
});

const street = defineAsset({
  name: 'street',
  kind: 'prop',
  budget: { triangles: [999, 999, 999] },
  gaps: [{ parts: ['kerb'], why: 'drain slot' }],
  build(ctx) {
    ctx.part('kerb', box({ size: [1, 0.2, 0.1], color: grey }));
    ctx.use(lamp, { prefix: 'a', at: [0, 2, 0], yaw: Math.PI / 2 });
  },
});

describe('ctx.use carries the child declarations (D558)', () => {
  it('prefixes glow, gaps and creases and moves a crease with the instance', () => {
    const c = compile(street);
    expect(c.glow).toEqual([{ parts: ['a_lens*'], strength: 2 }]);
    expect(c.gaps).toEqual([
      { parts: ['kerb'], why: 'drain slot' },
      { parts: ['a_door', 'a_frame'], why: 'service door seam' },
    ]);
    const crease = c.creases?.[0];
    expect([crease?.name, crease?.part]).toEqual(['model_surface', 'a_frame']);
    expect(crease?.at.map((v) => Math.round(v * 1e9) / 1e9)).toEqual([0, 3, 0]);
  });

  it("runs the child's checks on its own parts, named and placed as the child built them", () => {
    const c = compile(street);
    seen = [];
    expect(c.checks.flatMap((check) => [...check(c)])).toEqual([]);
    expect(seen).toEqual([{ names: ['frame', 'door', 'lens'], lens: [0, 0, 0.25] }]);
  });

  it("keeps a limit tolerance on the child's prefixed bone", () => {
    const hinge = compile(street).skeleton?.bones.find((b) => b.name === 'a_hinge');
    expect([hinge?.limit?.stretch, hinge?.limit?.why]).toEqual([
      5,
      'the door skin folds at the hinge',
    ]);
  });

  it("sees only its own instance's parts when a sibling's prefix starts with its own", () => {
    const pair = defineAsset({
      name: 'pair',
      kind: 'prop',
      budget: { triangles: [9999, 9999, 9999] },
      build(ctx) {
        ctx.use(lamp, { prefix: 'a' });
        ctx.use(lamp, { prefix: 'a_b', at: [3, 0, 0] });
      },
    });
    const c = compile(pair);
    seen = [];
    for (const check of c.checks) check(c);
    expect(seen.map((s) => s.names)).toEqual([
      ['frame', 'door', 'lens'],
      ['frame', 'door', 'lens'],
    ]);
  });
});
