import { describe, expect, it } from 'bun:test';
import { PARTS } from '../recipes/_parts/index.ts';
import { compile, definePart, MeshBuilder, type PartInfo, runQa } from '../src/index.ts';
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
      const findings = runQa(compile(partAsset(p)));
      expect(findings, p.info.name).toEqual([]);
    }
  });
});
