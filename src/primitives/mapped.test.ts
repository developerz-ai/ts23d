// D354: every primitive says which project material it mapped its UVs onto (`Mesh.mapped`), so
// a mesh built at module level registers its material in the asset that USES it. The last test
// is the guard: a file here or in /passes, /finish, /export or /cli that maps onto a strip or
// builds a mesh by hand and does not carry the record fails it.

import { afterAll, describe, expect, it } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { compile, defineAsset, type Mesh, Ts23dError } from '../core/index.ts';
import {
  defineMaterial,
  materialSnapshot,
  materialsOf,
  resetMaterials,
  type StripId,
} from '../material/index.ts';
import {
  applyWarp,
  beam,
  box,
  cell,
  cylinder,
  displaceMesh,
  extrudeSvg,
  heightfield,
  lathe,
  latheSvg,
  lattice,
  loft,
  planar,
  prism,
  ringXY,
  sculpt,
  sd,
  sdf,
  sweep,
  text,
  tiled,
  tpsWarp,
  warpMesh,
} from './index.ts';

// Put back, last of all hooks, what other test files' recipes defined at import (D334).
const restoreMaterials = materialSnapshot();
afterAll(restoreMaterials);

const C = [1, 1, 1] as const;
const budget = { triangles: [5000, 5000, 5000] as const };
const granite = (): StripId =>
  defineMaterial({ id: 'prim_granite', roughness: 0.9, albedo: '#d0d0c8', row: 6 });
const scales = (): StripId =>
  defineMaterial({ id: 'prim_scales', roughness: 0.3, albedo: '#203010', row: 6 });
const SQUARE = '<svg viewBox="0 0 10 10"><path d="M1 1 H9 V9 H1 Z"/></svg>';
const VASE = '<svg viewBox="0 0 50 100"><path d="M10 100 L20 50 L10 0"/></svg>';

/** Every primitive that takes a strip, called with `strip`. A new one belongs in this table. */
const MAPPERS: Readonly<Record<string, (strip: StripId) => Mesh>> = {
  box: (strip) => box({ size: [1, 1, 1], color: C, strip }),
  'box (bevel)': (strip) => box({ size: [1, 1, 1], color: C, strip, bevel: 0.05 }),
  beam: (strip) =>
    beam({ from: [0, 0, 0], to: [2, 0, 0], width: 0.1, height: 0.2, color: C, strip }),
  cell: (reveal) =>
    cell({
      origin: [0, 0, 0],
      u: [0, 1, 0],
      v: [0, 0, 1],
      color: C,
      cell: 'window_sash',
      inset: 0.1,
      reveal,
    }),
  cylinder: (strip) => cylinder({ radius: 0.3, length: 1, segments: 6, color: C, strip }),
  extrudeSvg: (strip) => extrudeSvg(SQUARE, { size: 1, depth: 0.1, color: C, strip }),
  heightfield: (strip) =>
    heightfield({ rect: [0, 0, 2, 2], cells: [2, 2], height: () => 0, color: C, strip }),
  lathe: (strip) =>
    lathe({
      profile: [
        [1, 0],
        [1, 1],
      ],
      segments: 6,
      color: C,
      strip,
    }),
  latheSvg: (strip) => latheSvg(VASE, { size: 0.5, segments: 6, color: C, strip }),
  lattice: (strip) =>
    lattice({ from: [0, 0, 0], to: [12, 0, 0], depth: 2, chord: 0.2, color: C, strip }),
  loft: (strip) =>
    loft({ rings: [ringXY([0, 0, 0], 1, 1, 6), ringXY([0, 0, 1], 1, 1, 6)], color: C, strip }),
  planar: (strip) =>
    planar({
      points: [
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
      ],
      color: C,
      strip,
    }),
  prism: (strip) =>
    prism({
      profile: [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
      depth: 1,
      color: C,
      strip,
    }),
  sculpt: (strip) =>
    sculpt({
      edits: [{ shape: 'sphere', at: [0, 0, 0], size: 0.6 }],
      resolution: 0.1,
      color: C,
      strip,
    }),
  sdf: (strip) =>
    sdf({
      field: sd.sphere([0, 0, 0], 1),
      bounds: [
        [-1.2, -1.2, -1.2],
        [1.2, 1.2, 1.2],
      ],
      resolution: 0.4,
      color: C,
      strip,
    }),
  sweep: (strip) =>
    sweep({
      section: { radius: 0.1, segments: 6 },
      path: [
        [0, 0, 0],
        [1, 0, 0],
      ],
      color: C,
      strip,
    }),
  'text (pixel)': (strip) => text('A1', { origin: [0, 0, 0], height: 0.5, color: C, strip }),
  'text (vector)': (strip) =>
    text('A1', { origin: [0, 0, 0], height: 0.5, color: C, strip, font: 'sans' }),
  tiled: (strip) => tiled({ origin: [0, 0, 0], u: [0, 4, 0], v: [0, 0, 3], color: C, strip }),
};

function thrown(fn: () => unknown): Ts23dError {
  try {
    fn();
  } catch (e) {
    if (e instanceof Ts23dError) return e;
    throw e;
  }
  throw new Error('did not throw');
}

describe('primitives record the material they map onto (D354)', () => {
  it('fails before D354: a module-level box on A in an asset whose build maps B on the same row is a coded conflict', () => {
    resetMaterials();
    const PLINTH = box({ size: [1, 1, 1], color: C, strip: granite() }); // no compile running
    const asset = defineAsset({
      name: 'prim_both',
      kind: 'prop',
      budget,
      build: (ctx) => {
        ctx.part('snake', box({ size: [1, 1, 1], color: C, strip: scales() }));
        ctx.part('plinth', PLINTH, { at: [2, 0, 0] });
      },
    });
    const e = thrown(() => compile(asset));
    expect(e.code).toBe('T3D_MATERIAL_CONFLICT');
    expect(e.message).toContain("'prim_scales' and 'prim_granite'");
    expect(e.message).toContain("part 'plinth'");
    expect(e.fix).toContain("defineMaterial({ id: 'prim_granite', row:");
  });

  it('fails before D354: alone, the module-level box is recorded as A although B holds the row too', () => {
    resetMaterials();
    const PLINTH = box({ size: [1, 1, 1], color: C, strip: granite() });
    scales();
    const asset = defineAsset({
      name: 'prim_alone',
      kind: 'prop',
      budget,
      build: (ctx) => ctx.part('plinth', PLINTH),
    });
    expect(materialsOf(compile(asset))).toEqual(['prim_granite']);
  });

  for (const [name, make] of Object.entries(MAPPERS))
    it(`${name}: a custom strip is recorded on the mesh, a built-in adds nothing`, () => {
      resetMaterials();
      const id = granite();
      expect(make(id).mapped?.map((u) => [u.id, u.row])).toEqual([['prim_granite', 6]]);
      expect(make('iron').mapped).toBeUndefined();
    });

  it('mesh-to-mesh primitives keep the record', () => {
    resetMaterials();
    const m = box({ size: [1, 1, 1], color: C, strip: granite() });
    const corners = [0, 1].flatMap((x) =>
      [0, 1].flatMap((y) => [0, 1].map((z): [number, number, number] => [x, y, z])),
    );
    expect(applyWarp(m, tpsWarp(corners, corners)).mapped).toEqual(m.mapped);
    expect(warpMesh(m, () => [0, 0, 0.1]).mapped).toEqual(m.mapped);
    expect(displaceMesh(m, () => 0.01).mapped).toEqual(m.mapped);
  });
});

/** Files that build a mesh literal or a MeshBuilder and need not carry the record, with why. */
const NO_RECORD: Readonly<Record<string, string>> = {
  'core/mesh.ts': 'MeshBuilder.build(): its caller knows the strip and records it; merge carries',
  'core/joint-fit.ts': 'a geometry-only copy for measuring a joint, never a part',
  'primitives/text-vector.ts': 'takes a rectangle, not a strip: text() records it',
  'primitives/warp.ts': 'spreads its input mesh',
  'passes/belt-seam.ts': 'reads a mesh, builds none',
  'passes/belt-run.ts': 'reads a mesh, builds none',
  'passes/hair-cards.ts':
    'takes strand-atlas rectangles, not a strip: strandCells() asks in build()',
  'export/own-textures.ts': 'rewrites a written GLB for a part with its own texture set',
  'export/physics-engines.ts': 'a collider mesh with zero UVs, never a part',
  'export/texture-uvs.ts': 'reads a mesh, builds none',
  'finish/atlas.ts': "atlas UVs address the layer's own texture: its parts carry `atlas` (D533)",
  'finish/hero-detail.ts': 'spreads its input mesh, for tangent frames only, never a part',
};

describe('guard: no primitive or pass forgets the record (D354)', () => {
  it('every file that maps onto a strip or builds a mesh by hand carries `mapped`', async () => {
    const src = join(import.meta.dir, '..');
    const offenders: string[] = [];
    const seen = new Set<string>();
    // The library paths that build or rebuild meshes after a compile too (D532/D533): the finish
    // and hero layers, the GLB writer, the CLI.
    for (const dir of ['core', 'primitives', 'passes', 'finish', 'export', 'cli'])
      for (const f of (await readdir(join(src, dir))).sort()) {
        if (!f.endsWith('.ts') || /(\.test|fixtures)\.ts$/.test(f)) continue;
        const text = await Bun.file(join(src, dir, f)).text();
        const code = text.replace(/^\s*\/\/.*$/gm, '');
        const maps = /\b(stripRect|rectOf)\(/.test(code);
        const builds = /new MeshBuilder\b/.test(code) || /(^|[{,\s])uvs\s*[:,]/m.test(code);
        if (!maps && !builds) continue;
        const key = `${dir}/${f}`;
        seen.add(key);
        const carries = maps ? /\bmappedOnto\(/.test(code) : /\bmapped(Onto|Of)\(/.test(code);
        if (!carries && NO_RECORD[key] === undefined) offenders.push(key);
      }
    // fix: `return mappedOnto(b.build(), strip)` where the strip is mapped, `...mappedOf(mesh)`
    // in a mesh literal built from a mesh; or list the file above with the reason it needs none.
    expect(offenders).toEqual([]);
    // The table names only files that still build a mesh: a stale entry hides the next one.
    expect(Object.keys(NO_RECORD).filter((k) => !seen.has(k))).toEqual([]);
    expect(seen.size).toBeGreaterThan(20);
  });
});
