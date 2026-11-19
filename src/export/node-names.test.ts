// Node names the exporter makes up (`<pivot>_<layer>`, the merged `body`, `<socket>_light`) must
// not equal a recipe part's name: engines and clips bind by name, and the first match would win.
import { describe, expect, it } from 'bun:test';
import { type Clip, compile, defineAsset } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { readGlbChunks } from './finish-glb.ts';
import { toGlb } from './glb.ts';

const c: [number, number, number] = [0.6, 0.5, 0.4];
const sway = { kind: 'sway', axis: [0, 0, 1], degrees: 20, hz: 0.2 } as const;
const down: Clip = {
  name: 'window_down',
  seconds: 1,
  loop: false,
  tracks: [
    {
      part: 'door_glass',
      path: 'translation',
      times: new Float32Array([0, 1]),
      values: new Float32Array([0, 0, 0, 0, 0, -0.4]),
    },
  ],
};
const car = (glassGroup: string) =>
  compile(
    defineAsset({
      name: 'car',
      kind: 'prop',
      budget: { triangles: [9999, 9999, 9999] },
      clips: [
        { ...down, tracks: [{ ...(down.tracks[0] as Clip['tracks'][number]), part: glassGroup }] },
      ],
      build(ctx) {
        ctx.part('floor', box({ size: [2, 2, 0.2], color: c }));
        ctx.group('door', { at: [0, 1, 0.2] });
        ctx.part('door_skin', box({ size: [1, 0.05, 0.5], color: c }), { parent: 'door' });
        ctx.part(
          'door_quarterlight',
          box({ size: [0.2, 0.04, 0.3], at: [0.4, 0, 0.5], color: c }),
          {
            parent: 'door',
            surface: 'glass',
          },
        );
        ctx.group(glassGroup, { at: [-0.1, 0, 0.5], parent: 'door' });
        ctx.part('pane', box({ size: [0.7, 0.03, 0.4], color: c }), {
          parent: glassGroup,
          surface: 'glass',
        });
      },
    }),
  );

describe('generated node names', () => {
  it("refuses a pivot named like a merged layer ('door_glass' beside door's glass)", () => {
    expect(() => toGlb(car('door_glass'), { animations: true })).toThrow(
      /T3D_RECIPE_INVALID.*'door_glass'/,
    );
  });

  it('binds the clip to the pivot once the name is free', () => {
    const { json } = readGlbChunks(toGlb(car('window'), { animations: true }));
    const nodes = json['nodes'] as { name: string }[];
    const anim = (
      json['animations'] as { name: string; channels: { target: { node: number } }[] }[]
    ).find((a) => a.name === 'window_down');
    expect(anim?.channels.map((ch) => nodes[ch.target.node]?.name)).toEqual(['window']);
  });

  it("refuses a pivot named 'body' beside merged static geometry", () => {
    const a = defineAsset({
      name: 'dup',
      kind: 'prop',
      budget: { triangles: [9999, 9999, 9999] },
      build(ctx) {
        ctx.part('floor', box({ size: [2, 2, 0.2], color: c }));
        ctx.group('body', { at: [0, 0, 0.2], motion: sway });
        ctx.part('cab', box({ size: [1, 1, 1], color: c }), { parent: 'body' });
      },
    });
    expect(() => toGlb(compile(a))).toThrow(/T3D_RECIPE_INVALID.*'body'/);
  });

  it("refuses a part named like a light socket's node ('lamp_light')", () => {
    const a = defineAsset({
      name: 'dup',
      kind: 'prop',
      budget: { triangles: [9999, 9999, 9999] },
      build(ctx) {
        ctx.part('floor', box({ size: [2, 2, 0.2], color: c }));
        ctx.socket('lamp', { kind: 'light', at: [0, 0, 0.5], data: { light: 'point' } });
        ctx.group('lamp_light', { at: [0.6, 0, 0.2], motion: sway });
        ctx.part('shade', box({ size: [0.3, 0.3, 0.3], color: c }), { parent: 'lamp_light' });
      },
    });
    expect(() => toGlb(compile(a))).toThrow(/T3D_RECIPE_INVALID.*'lamp_light'/);
  });
});
