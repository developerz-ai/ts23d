import { afterAll, describe, expect, it } from 'bun:test';
import {
  type Asset,
  type CompiledAsset,
  compile,
  defineAsset,
  type Mesh,
  Ts23dError,
} from '../core/index.ts';
import { materialsOf, sheetFor } from './asset-sheet.ts';
import { defineMaterial, materialSnapshot, resetMaterials } from './define.ts';
import { DEFAULT_SHEET } from './generator.ts';
import { mappedOnto } from './mapped.ts';
import { outsideOnRow } from './slots.ts';
import { rectOf, type StripId, stripRect } from './trim-sheet.ts';

// Put back, last of all hooks, what other test files' recipes defined at import (D334).
const restoreMaterials = materialSnapshot();
afterAll(restoreMaterials);

const RECIPE = { ...DEFAULT_SHEET, size: 512 } as const;
const budget = { triangles: [100, 100, 100] as const };

/** A quad with hand-written UVs onto `strip`: it names no material unless `mappedOnto` says so. */
function bare(strip: StripId): Mesh {
  const r = rectOf(strip);
  return {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1]),
    normals: new Float32Array([0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0]),
    uvs: new Float32Array([r.u0, r.v0, r.u1, r.v0, r.u1, r.v1, r.u0, r.v1]),
    colors: new Float32Array(12).fill(1),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  };
}
/** What a primitive returns for its `strip`: the rectangle asked for and the mesh saying so. */
const quad = (strip: StripId): Mesh => {
  stripRect(strip);
  return mappedOnto(bare(strip), strip);
};

const granite = () =>
  defineMaterial({ id: 'map_granite', roughness: 0.9, albedo: '#d0d0c8', row: 4 });
const scales = () =>
  defineMaterial({ id: 'map_scales', roughness: 0.3, albedo: '#203010', row: 4 });
const G = 'map_granite' as StripId;
const S = 'map_scales' as StripId;
const prop = (name: string, build: Asset['build']): Asset =>
  defineAsset({ name, kind: 'prop', budget, build });

function thrown(fn: () => unknown): Ts23dError {
  try {
    fn();
  } catch (e) {
    if (e instanceof Ts23dError) return e;
    throw e;
  }
  throw new Error('did not throw');
}

/** Red of the sheet's albedo in the middle of custom row 4. */
function red(a: CompiledAsset): number {
  const r = rectOf(granite());
  const y = Math.round(((r.v0 + r.v1) / 2) * RECIPE.size);
  return sheetFor(a, RECIPE).albedo[(y * RECIPE.size + 40) * 4] ?? -1;
}

describe('a mesh built outside build() (D354)', () => {
  it('fails before D354: on material A in an asset that maps B on the same row, it is a coded conflict naming both', () => {
    resetMaterials();
    const rock = quad(granite()); // module level: no compile is running
    const both = prop('map_both', (ctx) => {
      ctx.part('snake', quad(scales()));
      ctx.part('rock', rock);
    });
    const e = thrown(() => compile(both));
    expect(e.code).toBe('T3D_MATERIAL_CONFLICT');
    expect(e.message).toContain("asset 'map_both'");
    expect(e.message).toContain("'map_scales' and 'map_granite'");
    expect(e.message).toContain("part 'rock'");
    expect(e.fix).toContain("defineMaterial({ id: 'map_granite', row:");
    // Whichever comes first, and at whatever depth of ctx.use.
    const reversed = prop('map_both', (ctx) => {
      ctx.part('rock', rock);
      ctx.part('snake', quad(scales()));
    });
    expect(thrown(() => compile(reversed)).message).toContain("'map_granite' and 'map_scales'");
    const scene = prop('map_scene', (ctx) => {
      ctx.part('snake', quad(scales()));
      ctx.use(
        prop('map_child', (c) => c.part('rock', rock)),
        { prefix: 'c' },
      );
    });
    expect(thrown(() => compile(scene)).code).toBe('T3D_MATERIAL_CONFLICT');
  });

  it('fails before D354: on material A alone it is painted A, with B defined on the same row', () => {
    resetMaterials();
    const rock = quad(granite());
    scales();
    const alone = compile(prop('map_alone', (ctx) => ctx.part('rock', rock)));
    expect(alone.materials).toEqual([{ id: 'map_granite', row: 4 }]);
    expect(materialsOf(alone)).toEqual(['map_granite']);
    const snake = compile(prop('map_snake', (ctx) => ctx.part('snake', quad(scales()))));
    // Granite is light, scales dark: the row shows granite, not blank and not the other.
    expect(red(alone)).toBeGreaterThan(red(snake) + 60);
    expect(sheetFor(alone, RECIPE).strips).toEqual(['map_granite']);
    // Through ctx.use the parent's sheet holds it too.
    const scene = compile(
      prop('map_scene', (ctx) => {
        ctx.use(
          prop('map_child', (c) => c.part('rock', rock)),
          { prefix: 'c' },
        );
      }),
    );
    expect(materialsOf(scene)).toEqual(['map_granite']);
  });

  it('a stale record (UVs re-pointed by hand since) claims no row', () => {
    resetMaterials();
    scales();
    // Mapped onto granite, then every UV moved onto the built-in iron strip, record kept.
    const moved: Mesh = { ...quad(granite()), uvs: bare('iron').uvs };
    expect(moved.mapped?.map((u) => u.id)).toEqual(['map_granite']);
    const both = compile(
      prop('map_stale', (ctx) => {
        ctx.part('snake', quad(scales()));
        ctx.part('rock', moved);
      }),
    );
    expect(both.materials).toEqual([{ id: 'map_scales', row: 4 }]);
    expect(materialsOf(both)).toEqual(['map_scales']);
  });

  it('module-level stripRect constants are no error, and record when a build reads them', () => {
    resetMaterials();
    scales();
    // What king_cobra, hydra and bluefin_tuna do: keep the rectangle, map by hand inside build().
    const RECT = stripRect(granite());
    const H = RECT.v1 - RECT.v0; // read outside every compile: plain numbers, nothing recorded
    expect(H).toBeGreaterThan(0);
    expect({ ...RECT }).toEqual(rectOf(G));
    const byHand = (): Mesh => {
      const m = bare('iron');
      const uvs = m.uvs.map((x, i) => (i % 2 ? RECT.v0 + (x > 0.01 ? H : 0) : RECT.u0 + x));
      return { ...m, uvs };
    };
    // Fails before D354: nothing in build() asked for the strip, so with a second material on
    // the row the asset was T3D_MATERIAL_UNKNOWN (and silently the other one, had it mapped it).
    const cobra = compile(prop('map_constants', (ctx) => ctx.part('hood', byHand())));
    expect(cobra.materials).toEqual([{ id: 'map_granite', row: 4 }]);
    expect(materialsOf(cobra)).toEqual(['map_granite']);
    // An asset that never reads the constant holds nothing of it, whatever its own row 4 shows.
    const other = compile(
      prop('map_other', (ctx) => {
        stripRect(S);
        ctx.part('skin', bare(S));
      }),
    );
    expect(materialsOf(other)).toEqual(['map_scales']);
    expect(outsideOnRow(4)).toEqual([]);
    // Reading it in a build that maps another material on the row is the conflict, by name.
    const both = prop('map_const_both', (ctx) => {
      ctx.part('skin', quad(S));
      ctx.part('hood', byHand());
    });
    const e = thrown(() => compile(both));
    expect(e.code).toBe('T3D_MATERIAL_CONFLICT');
    expect(e.message).toContain("'map_scales' and 'map_granite'");
  });

  it('fails before D354: a copy that dropped the record is refused, never painted as the other material', () => {
    resetMaterials();
    const rock = quad(granite());
    expect(outsideOnRow(4)).toEqual(['map_granite']);
    // A hand-rolled transform that builds a new mesh literal loses `mapped`.
    const copy: Mesh = {
      positions: rock.positions,
      normals: rock.normals,
      uvs: rock.uvs,
      colors: rock.colors,
      indices: rock.indices,
    };
    const lost = prop('map_lost', (ctx) => {
      ctx.part('snake', quad(scales()));
      ctx.part('rock', copy);
    });
    const c = compile(lost);
    const e = thrown(() => sheetFor(c, RECIPE));
    expect(e.code).toBe('T3D_MATERIAL_UNKNOWN');
    expect(e.message).toContain("part 'rock' of asset 'map_lost'");
    expect(e.message).toContain("'map_scales'");
    expect(e.message).toContain("'map_granite'");
    expect(e.fix).toContain("mappedOnto(mesh, 'map_scales')");
    // Saying what it is settles it either way: the conflict, or the recorded material.
    const said = prop('map_said', (ctx) => {
      ctx.part('snake', quad(scales()));
      ctx.part('rock', mappedOnto(copy, G));
    });
    expect(thrown(() => compile(said)).code).toBe('T3D_MATERIAL_CONFLICT');
    const same = prop('map_same', (ctx) => {
      ctx.part('snake', quad(scales()));
      ctx.part('more', mappedOnto(bare(S), S));
    });
    expect(materialsOf(compile(same))).toEqual(['map_scales']);
  });
});

describe('mappedOnto', () => {
  it('records custom strips by base id with their row and V band; built-ins add nothing', () => {
    resetMaterials();
    const id = granite();
    const m = bare('iron');
    expect(mappedOnto(m, 'iron', 'plain')).toBe(m);
    const r = rectOf(id);
    expect(mappedOnto(m, `${id}~3` as StripId, 'iron').mapped).toEqual([
      { id: 'map_granite', row: 4, v0: r.v0, v1: r.v1 },
    ]);
    // Inside a compile nothing is listed as built outside one.
    resetMaterials();
    granite();
    compile(prop('map_inside', (ctx) => ctx.part('rock', quad(G))));
    expect(outsideOnRow(4)).toEqual([]);
  });

  it('a material snapshot keeps what module-level meshes were mapped onto', () => {
    resetMaterials();
    quad(granite());
    const restore = materialSnapshot();
    resetMaterials();
    expect(outsideOnRow(4)).toEqual([]);
    restore();
    expect(outsideOnRow(4)).toEqual(['map_granite']);
  });
});
