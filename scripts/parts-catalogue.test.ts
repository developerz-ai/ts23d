import { describe, expect, it } from 'bun:test';
import { PARTS } from '../recipes/_parts/index.ts';
import {
  type AnyPart,
  boundsOf,
  compile,
  defineAsset,
  definePart,
  MeshBuilder,
  type PartInfo,
  runQa,
} from '../src/index.ts';
import { partAsset, renderIndex } from './parts-catalogue.ts';

const row = (over: Partial<PartInfo> = {}): PartInfo => ({
  name: 'gizmo',
  description: 'a test gizmo',
  tags: ['test'],
  params: [
    { name: 'size', type: 'string', default: 'M8', oneOf: ['M6', 'M8'], doc: 'thread' },
    { name: 'length', type: 'number', default: 0.03, min: 0.01, max: 0.3, unit: 'm' },
    { name: 'at', type: 'tuple', default: [1, 2, 3] },
  ],
  ...over,
});

describe('renderIndex', () => {
  it('changes when a part changes, so a stale README is detectable', () => {
    expect(renderIndex([row()])).not.toBe(renderIndex([row({ description: 'renamed' })]));
  });

  it('lists name, thumbnail, tags, LOD policy and params with defaults, ranges and docs', () => {
    const md = renderIndex([row({ lod: { upTo: 1 } })]);
    expect(md).toContain('![gizmo](out/gizmo.png)');
    expect(md).toContain('`gizmo`<br>test');
    expect(md).toContain('(LOD ≤ 1)');
    expect(md).toContain("`size` = 'M8' ('M6' \\| 'M8'): thread");
    expect(md).toContain('`length` = 0.03 (0.01–0.3 m)');
    expect(md).toContain('`at` = [1, 2, 3]');
    expect(md).toContain('1 parts.');
  });
});

describe('partAsset', () => {
  it('wraps a part as an asset the renderer and QA accept, every LOD shown', () => {
    const tiny = definePart({
      name: 'tiny',
      description: 'one triangle',
      params: {},
      lod: { upTo: 0 },
      build: () => {
        const b = new MeshBuilder();
        const v = (x: number) =>
          b.vertex({ p: [x, x % 2, 0], n: [0, 0, 1], uv: [0, 0], color: [1, 1, 1] });
        b.tri(v(0), v(1), v(2));
        return b.build();
      },
    });
    const c = compile(partAsset(tiny), { lod: 2 });
    expect(c.name).toBe('part_tiny');
    expect(c.parts.map((p) => p.name)).toEqual(['tiny']);
  });

  it('every kit part compiles to a QA-clean one-part asset at LOD0', () => {
    for (const p of PARTS) {
      const findings = runQa(compile(hung(p) ? standing(p) : partAsset(p)));
      expect(findings, p.info.name).toEqual([]);
    }
  });

  it('a pendant (hung from its origin) is buried as is: the standing check is not a free pass', () => {
    const lamp = PARTS.find((p) => p.info.name === 'lamp');
    expect(lamp && hung(lamp)).toBe(true);
    const gates = lamp ? runQa(compile(partAsset(lamp))).map((f) => f.gate) : [];
    expect(gates).toContain('floating-parts');
  });
});

/** Hangs from its origin (a ceiling pendant): every piece sits below z = 0, where the
 *  one-part asset puts the ground, so the floating gate would call it buried. */
function hung(p: AnyPart): boolean {
  return boundsOf(p.mesh({}, 0)).max[2] <= 1e-6;
}

/** The part stood on its lowest point: QA then checks it like any grounded asset. */
function standing(p: AnyPart) {
  const lift = -boundsOf(p.mesh({}, 0)).min[2];
  return defineAsset({
    name: `part_${p.info.name}`,
    kind: 'part',
    budget: { triangles: [200000, 100000, 50000] },
    glow: [{ parts: ['*_glow'] }],
    build(ctx) {
      p(ctx, p.info.name, {}, { upTo: 2, at: [0, 0, lift] });
    },
  });
}
