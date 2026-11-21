// Composing assets never repaints one asset's part with another's material (D600 investigation).
// A parent `ctx.use`s two children, each with its own project material, and adds a ground part on a
// third: every part must still sample the row its own material holds, the parent's sheet must show
// each material on that row exactly as the child's own sheet does, and adding a material must leave
// every other row's texels alone (rows come from the definition, never from what else is defined).
import { afterAll, describe, expect, it } from 'bun:test';
import { type Asset, compile, defineAsset, type Mesh } from '../core/index.ts';
import { materialsOf, sheetFor, sheetWith } from './asset-sheet.ts';
import { defineMaterial, materialSnapshot } from './define.ts';
import { DEFAULT_SHEET } from './generator.ts';
import { rowsSampled } from './rows-sampled.ts';
import { customIndex } from './slots.ts';
import { STRIP_H, STRIPS, type StripId, stripRect } from './trim-sheet.ts';

const restoreMaterials = materialSnapshot();
afterAll(restoreMaterials);

const RECIPE = { ...DEFAULT_SHEET, size: 512 } as const;
const budget = { triangles: [100, 100, 100] as const };

function quad(strip: StripId): Mesh {
  const r = stripRect(strip);
  return {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uvs: new Float32Array([r.u0, r.v0, r.u1, r.v0, r.u1, r.v1, r.u0, r.v1]),
    colors: new Float32Array(12).fill(1),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  };
}

// No `row`: each takes its id's hash, as the tank's enamel and steel did.
const enamel = defineMaterial({
  id: 'compose_enamel',
  kind: 'metal',
  albedo: '#e0dcd0',
  roughness: 0.5,
});
const steel = defineMaterial({
  id: 'compose_steel',
  kind: 'metal',
  albedo: '#707274',
  roughness: 0.34,
});
const joinery = defineMaterial({
  id: 'compose_joinery',
  kind: 'planks',
  albedo: '#a08c74',
  roughness: 0.8,
});
const salt = defineMaterial({
  id: 'compose_salt',
  kind: 'concrete',
  albedo: '#aaa497',
  roughness: 0.9,
});

const child = (name: string, strips: readonly StripId[]): Asset =>
  defineAsset({
    name,
    kind: 'prop',
    budget,
    build: (ctx) => {
      for (const s of strips) ctx.part(s, quad(s));
    },
  });
const tank = child('compose_tank', [enamel, steel, 'iron']);
const hall = child('compose_hall', [joinery, 'concrete']);
const scene = defineAsset({
  name: 'compose_scene',
  kind: 'prop',
  budget,
  build: (ctx) => {
    ctx.part('ground', quad(salt));
    ctx.part('plaza', quad('concrete'));
    ctx.use(tank, { prefix: 'tank', at: [4, 0, 0] });
    ctx.use(hall, { prefix: 'hall', at: [-4, 0, 0] });
  },
});

/** The strip id a part's triangles sample: built-in by row, project by the compile's record. */
function stripsOf(mesh: Mesh, materials: readonly string[]): string[] {
  const vs = mesh.uvs.filter((_, i) => i % 2 === 1);
  return [...rowsSampled(vs, mesh.indices)].map((row) => {
    if (row < STRIPS.length) return STRIPS[row] ?? '?';
    return materials.find((id) => customIndex(id) === row - STRIPS.length) ?? `row ${row}`;
  });
}

/** One sheet row's albedo bytes (the buffer's first line is V = 0). */
function rowBytes(sheet: { size: number; albedo: Uint8Array }, row: number): Uint8Array {
  const px = sheet.size * STRIP_H;
  const top = row * px;
  return sheet.albedo.slice(top * sheet.size * 4, (top + px) * sheet.size * 4);
}

describe('composing assets with ctx.use', () => {
  it('the four materials hold four rows (the fixture would prove nothing otherwise)', () => {
    const rows = [enamel, steel, joinery, salt].map(customIndex);
    expect(new Set(rows).size).toBe(4);
  });

  it('every part samples its own material, whoever used it', () => {
    const c = compile(scene, { lod: 0 });
    const ids = materialsOf(c);
    expect([...ids].sort()).toEqual([enamel, joinery, salt, steel].sort());
    const want: Record<string, string> = {
      ground: salt,
      plaza: 'concrete',
      [`tank_${enamel}`]: enamel,
      [`tank_${steel}`]: steel,
      tank_iron: 'iron',
      [`hall_${joinery}`]: joinery,
      hall_concrete: 'concrete',
    };
    const got: Record<string, string> = {};
    for (const p of c.parts) if (p.mesh) got[p.name] = stripsOf(p.mesh, ids).join(',');
    expect(got).toEqual(want);
  });

  it("the scene's sheet shows each child's material on the row its parts sample", () => {
    const own = sheetFor(compile(tank, { lod: 0 }), RECIPE);
    const composed = sheetFor(compile(scene, { lod: 0 }), RECIPE);
    for (const id of [enamel, steel]) {
      const row = STRIPS.length + customIndex(id);
      expect(rowBytes(composed, row)).toEqual(rowBytes(own, row));
    }
  });

  it('one more project material changes its own row and no other', () => {
    const before = sheetWith([enamel, joinery, salt], RECIPE);
    const after = sheetWith([enamel, joinery, salt, steel], RECIPE);
    const steelRow = STRIPS.length + customIndex(steel);
    const changed: number[] = [];
    for (let row = 0; row < 1 / STRIP_H; row++)
      if (!Bun.deepEquals(rowBytes(before, row), rowBytes(after, row))) changed.push(row);
    expect(changed).toEqual([steelRow]);
  });
});
