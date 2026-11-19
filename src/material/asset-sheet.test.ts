import { afterAll, describe, expect, it } from 'bun:test';
import {
  type Asset,
  type CompiledAsset,
  compile,
  defineAsset,
  type Mesh,
  Ts23dError,
} from '../core/index.ts';
import { checkSheetFor, materialsOf, sheetFor, sheetWith } from './asset-sheet.ts';
import { defineMaterial, materialSnapshot, resetMaterials } from './define.ts';
import { DEFAULT_SHEET, paintTrimSheet } from './generator.ts';
import {
  CUSTOM_STRIP_SLOTS,
  type CustomStripId,
  STRIPS,
  type StripId,
  stripRect,
} from './trim-sheet.ts';

// Put back, last of all hooks, what other test files' recipes defined at import (D334).
const restoreMaterials = materialSnapshot();

const RECIPE = { ...DEFAULT_SHEET, size: 512 } as const;
const budget = { triangles: [100, 100, 100] as const };

/** One quad mapped onto `strip` (what every primitive does with its `strip` option). */
function quad(strip: StripId): Mesh {
  const r = stripRect(strip);
  return {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1]),
    normals: new Float32Array([0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0]),
    uvs: new Float32Array([r.u0, r.v0, r.u1, r.v0, r.u1, r.v1, r.u0, r.v1]),
    colors: new Float32Array(12).fill(1),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  };
}

/** A recipe module's worth: a material on `row` and the asset that maps onto it. */
const granite = () =>
  defineMaterial({ id: 'sheet_granite', roughness: 0.9, albedo: '#777770', row: 4 });
const scales = () =>
  defineMaterial({ id: 'sheet_scales', roughness: 0.3, albedo: '#304020', row: 4 });
const prop = (name: string, strips: () => readonly StripId[]): Asset =>
  defineAsset({
    name,
    kind: 'prop',
    budget,
    build: (ctx) => {
      strips().forEach((s, i) => {
        ctx.part(`face_${i}`, quad(s));
      });
    },
  });
const boulder = (): Asset => prop('sheet_boulder', () => [granite(), 'iron']);
const cobra = (): Asset => prop('sheet_cobra', () => [scales()]);

/** Everything an export reads: the compiled UVs and the three maps of the asset's sheet. */
function bytesOf(asset: Asset): string {
  const lods = ([0, 1, 2] as const).map((lod) => compile(asset, { lod }));
  const sheet = sheetFor(lods, RECIPE);
  const h = new Bun.CryptoHasher('sha256');
  for (const a of lods) for (const p of a.parts) if (p.mesh) h.update(p.mesh.uvs);
  for (const map of [sheet.albedo, sheet.normal, sheet.orm]) h.update(map);
  return h.digest('hex');
}

function thrown(fn: () => unknown): Ts23dError {
  try {
    fn();
  } catch (e) {
    if (e instanceof Ts23dError) return e;
    throw e;
  }
  throw new Error('did not throw');
}

resetMaterials();
afterAll(restoreMaterials);

describe('one trim sheet per asset (D299)', () => {
  it('fails before D299: two assets with different materials on one row build in one process, in either order, to the bytes of building each alone', () => {
    resetMaterials();
    const boulderAlone = bytesOf(boulder());
    resetMaterials();
    const cobraAlone = bytesOf(cobra());
    expect(boulderAlone).not.toBe(cobraAlone);
    for (const first of ['boulder', 'cobra'] as const) {
      resetMaterials();
      // Both recipe modules loaded (their materials defined), then both built, in this order.
      const order = first === 'boulder' ? [boulder(), cobra()] : [cobra(), boulder()];
      if (first === 'boulder') [granite(), scales()];
      else [scales(), granite()];
      const got = Object.fromEntries(order.map((a) => [a.name, bytesOf(a)]));
      expect(got).toEqual({ sheet_boulder: boulderAlone, sheet_cobra: cobraAlone });
      // Again after the other was built: nothing the other left behind changes it.
      expect(order.map(bytesOf)).toEqual(order.map((a) => got[a.name] ?? ''));
    }
  });

  it('paints each asset its own material on the shared row, and nothing of the other', () => {
    resetMaterials();
    const [b, c] = [compile(boulder()), compile(cobra())];
    expect(materialsOf(b)).toEqual(['sheet_granite']);
    expect(materialsOf(c)).toEqual(['sheet_scales']);
    const y = Math.round(((stripRect(granite()).v0 + stripRect(granite()).v1) / 2) * RECIPE.size);
    const red = (a: CompiledAsset): number =>
      sheetFor(a, RECIPE).albedo[(y * RECIPE.size + 40) * 4] ?? -1;
    expect(red(b)).toBeGreaterThan(red(c) + 40);
    expect(sheetFor(b, RECIPE).strips).toEqual(['sheet_granite']);
  });

  it('fails: one asset with two materials on one row is T3D_MATERIAL_CONFLICT with the fix', () => {
    resetMaterials();
    const both = prop('sheet_both', () => [granite(), scales()]);
    const e = thrown(() => compile(both));
    expect(e.code).toBe('T3D_MATERIAL_CONFLICT');
    expect(e.message).toContain("asset 'sheet_both'");
    expect(e.message).toContain("'sheet_granite' and 'sheet_scales'");
    expect(e.fix).toContain("defineMaterial({ id: 'sheet_scales', row:");
    // The fix works: the same material on a row the asset leaves free.
    resetMaterials();
    const moved = defineMaterial({ id: 'sheet_scales', roughness: 0.3, albedo: '#304020', row: 5 });
    expect(materialsOf(compile(prop('sheet_both', () => [granite(), moved])))).toEqual([
      'sheet_granite',
      'sheet_scales',
    ]);
  });

  it('fails: a composed asset whose used children bring two materials on one row, in either order', () => {
    resetMaterials();
    const children = [boulder(), cobra()];
    for (const order of [children, [...children].reverse()]) {
      const scene = defineAsset({
        name: 'sheet_scene',
        kind: 'prop',
        budget,
        build: (ctx) => {
          order.forEach((child, i) => {
            ctx.use(child, { prefix: `c${i}` });
          });
        },
      });
      const e = thrown(() => compile(scene));
      expect(e.code).toBe('T3D_MATERIAL_CONFLICT');
      expect(e.message).toContain("asset 'sheet_scene'");
      expect(e.fix).toContain('ctx.use');
    }
    // Children on different rows compose: the scene's sheet holds both.
    const bark = defineMaterial({ id: 'sheet_bark', roughness: 0.8, row: 9 });
    const scene = defineAsset({
      name: 'sheet_scene',
      kind: 'prop',
      budget,
      build: (ctx) => {
        ctx.use(boulder(), { prefix: 'rock' });
        ctx.use(
          prop('sheet_tree', () => [bark]),
          { prefix: 'tree' },
        );
      },
    });
    expect(sheetFor(compile(scene), RECIPE).strips).toEqual(['sheet_granite', 'sheet_bark']);
  });

  it('no longer refuses a second material on a row another recipe holds (the old process-wide conflict)', () => {
    resetMaterials();
    expect(() => [granite(), scales()]).not.toThrow();
    resetMaterials();
    expect(() => [scales(), granite()]).not.toThrow();
    // More materials than the sheet has custom rows may be defined; an asset holds 14 of them.
    const many = Array.from({ length: CUSTOM_STRIP_SLOTS + 1 }, (_, k) =>
      defineMaterial({ id: `sheet_many${k}`, roughness: 0.5, row: k % CUSTOM_STRIP_SLOTS }),
    );
    expect(() =>
      compile(prop('sheet_fits', () => many.slice(0, CUSTOM_STRIP_SLOTS))),
    ).not.toThrow();
    const full = prop('sheet_full', () => [...many.slice(1), many[0] as CustomStripId]);
    expect(thrown(() => compile(full)).code).toBe('T3D_SHEET_FULL');
  });
});

describe('sheetFor', () => {
  it("equals a whole paint of the asset's materials, and shares the built-in rows", () => {
    resetMaterials();
    const b = compile(boulder());
    scales();
    const whole = paintTrimSheet(RECIPE, ['sheet_granite']);
    const mine = sheetFor(b, RECIPE);
    for (const map of ['albedo', 'normal', 'orm'] as const)
      expect(Buffer.compare(mine[map], whole[map])).toBe(0);
    expect(sheetFor(b, { ...RECIPE })).toBe(mine);
    // No project material: the cached built-in sheet itself, the same for every such asset.
    const plain = compile(prop('sheet_plain', () => ['brick']));
    expect(sheetFor(plain, RECIPE)).toBe(sheetWith([], RECIPE));
    expect(Buffer.compare(sheetWith([], RECIPE).albedo, paintTrimSheet(RECIPE, []).albedo)).toBe(0);
    // Every defined material at once no longer fits one sheet, and says what to do instead.
    const e = thrown(() => paintTrimSheet(RECIPE));
    expect(e.code).toBe('T3D_MATERIAL_CONFLICT');
    expect(e.fix).toContain('sheetFor(');
  });

  it('keeps a bounded cache of built-in sheets: a long run of seeds does not retain every atlas', () => {
    resetMaterials();
    const first = sheetWith([], { ...RECIPE, seed: 1 });
    expect(sheetWith([], { ...RECIPE, seed: 1 })).toBe(first);
    // More seeds than the cache keeps: the oldest is painted again, the newest stays cached.
    for (let seed = 2; seed <= 6; seed++) sheetWith([], { ...RECIPE, seed });
    expect(sheetWith([], { ...RECIPE, seed: 1 })).not.toBe(first);
    const last = sheetWith([], { ...RECIPE, seed: 6 });
    expect(sheetWith([], { ...RECIPE, seed: 6 })).toBe(last);
  });

  it('refuses LODs that put different materials on one row: they share the sheet', () => {
    resetMaterials();
    const gated = defineAsset({
      name: 'sheet_gated',
      kind: 'prop',
      budget,
      build: (ctx) => ctx.part('face', quad(ctx.lod === 0 ? granite() : scales())),
    });
    const lods = ([0, 2] as const).map((lod) => compile(gated, { lod }));
    expect(thrown(() => sheetFor(lods, RECIPE)).code).toBe('T3D_MATERIAL_CONFLICT');
  });

  it('reads a mesh built outside build() from its UVs while one material holds the row', () => {
    resetMaterials();
    const built = quad(granite());
    const outside = defineAsset({
      name: 'sheet_outside',
      kind: 'prop',
      budget,
      build: (ctx) => ctx.part('face', built),
    });
    const c = compile(outside);
    expect(c.materials).toBeUndefined();
    expect(materialsOf(c)).toEqual(['sheet_granite']);
    scales();
    const e = thrown(() => materialsOf(c));
    expect(e.code).toBe('T3D_MATERIAL_UNKNOWN');
    expect(e.fix).toContain('inside build()');
  });
});

describe('checkSheetFor (D47)', () => {
  it("fails: a sheet without the asset's material, or with another asset's on its row, is refused", () => {
    resetMaterials();
    const [b, c] = [compile(boulder()), compile(cobra())];
    const early = sheetWith([], RECIPE);
    expect(() => checkSheetFor(early, b)).toThrow(/painted without material 'sheet_granite'/);
    expect(() => checkSheetFor(sheetFor(c, RECIPE), b)).toThrow('T3D_MATERIAL_UNKNOWN');
    expect(() => checkSheetFor(sheetFor(b, RECIPE), b)).not.toThrow();
    expect(() =>
      checkSheetFor(sheetFor(b, RECIPE), [b, compile(prop('sheet_plain', () => ['oak']))]),
    ).not.toThrow();
    // A hand-built sheet lists no strips and is taken as given.
    const { strips: _listed, ...handBuilt } = early;
    expect(() => checkSheetFor(handBuilt, b)).not.toThrow();
    expect(STRIPS.length + CUSTOM_STRIP_SLOTS).toBe(56);
  });
});
