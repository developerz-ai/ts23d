// connections on wrapped pixel lettering: a boxcar side's stencils painted across its posts and
// braces (`text({ surface, wrap: true })`) must hold to the side the way the flat decals do, with
// no piece hanging on by a point or an edge (T3D_CONNECT_POINT, D455).

import { describe, expect, it } from 'bun:test';
import { type BuildContext, compile, defineAsset } from '../core/index.ts';
import { boxcarSideBody, boxcarSideLettering } from '../primitives/text-wrap-fixtures.ts';
import { connectionReport } from './connections.ts';

const errors = (lod: 0 | 1, wrap: boolean): string[] =>
  connectionReport(
    compile(
      defineAsset({
        name: 'boxcar_side',
        kind: 'prop',
        budget: { triangles: [400000, 400000, 400000] },
        build: (ctx: BuildContext) => {
          ctx.part('body', boxcarSideBody());
          ctx.part('lettering', boxcarSideLettering(lod, wrap));
        },
      }),
      { lod },
    ),
  )
    .issues.filter((i) => i.severity === 'error')
    .map((i) => `${i.code}:${i.part}: ${i.message}`);

describe('connections: wrapped lettering', () => {
  it('flat stencils on the boxcar side are held (the fixture is sound)', () => {
    expect(errors(0, false)).toEqual([]);
  });

  it('wrapped stencils on the boxcar side are held by faces, never by points or edges', () => {
    expect(errors(0, true)).toEqual([]);
  });
});
