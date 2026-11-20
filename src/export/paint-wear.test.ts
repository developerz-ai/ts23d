// Wear slots in the GLB: bare triangles of a `wear: true` slot leave the paint primitive (and with
// it every KHR_materials_variants mapping) for the pivot's trim-sheet mesh, carrying their own
// colour in COLOR_0; the paint keeps its slot material and liveries. Khronos-valid; no extra draw
// when the pivot already has unpainted geometry; `<part>_bare` children with keepParts. Without
// `wear` the chip is flattened onto the slot and a livery recolours it (the defect).

import { describe, expect, it } from 'bun:test';
import { validateBytes } from 'gltf-validator';
import { type AssetDefinition, compile, defineAsset, type Mesh, type Vec3 } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { glbContents } from './draw-budget.ts';
import { toGlb } from './glb.ts';

const RED: Vec3 = [0.5, 0.04, 0.03];
const STEEL: Vec3 = [0.3, 0.3, 0.29];

/** A red box whose vertices above z = 0.5 are bare steel (the whole top face is chipped). */
function chipped(): Mesh {
  const m = box({ size: [1, 1, 1], at: [0, 0, 0.5], color: RED });
  const colors = new Float32Array(m.colors);
  for (let v = 0; v < colors.length / 3; v++)
    if ((m.positions[v * 3 + 2] ?? 0) > 0.9) colors.set(STEEL, v * 3);
  return { ...m, colors };
}

const def = (wear: boolean): AssetDefinition => ({
  name: 'worn_crate',
  kind: 'prop',
  budget: { triangles: [999, 999, 999] },
  paint: { team: wear ? { colour: RED, wear: true } : RED },
  variants: { blue: { team: [0.03, 0.08, 0.5] } },
  build(ctx) {
    ctx.part('crate', chipped(), { paint: 'team' });
    ctx.part('skid', box({ size: [1.2, 0.2, 0.1], at: [0, 0, -0.05], color: [0.1, 0.1, 0.1] }));
  },
});

type Prim = { material: number; extensions?: Record<string, unknown> };
interface Gltf {
  nodes: { name: string; mesh?: number; children?: number[] }[];
  meshes: { name: string; primitives: Prim[] }[];
  materials: { name: string }[];
}
const json = (glb: Uint8Array): Gltf => {
  const len = new DataView(glb.buffer, glb.byteOffset).getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + len)));
};

async function errors(glb: Uint8Array) {
  const sealed = Math.random;
  let s = 1;
  Math.random = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  try {
    const report = await validateBytes(glb);
    return report.issues.messages.filter((m: { severity: number }) => m.severity <= 1);
  } finally {
    Math.random = sealed;
  }
}

describe('wear slots in the GLB', () => {
  it('without wear a steel chip is flattened into the paint: a livery turns it blue', () => {
    const blue = compile(defineAsset(def(false)), { variant: 'blue' }).parts[0]?.mesh as Mesh;
    const top = [...blue.positions].findIndex((z, i) => i % 3 === 2 && z > 0.9);
    const c = blue.colors.subarray(top - 2, top + 1);
    expect(c[2] ?? 0).toBeGreaterThan(3 * (c[0] ?? 0));
    expect(glbContents(compile(defineAsset(def(false)))).triangles).toBe(24);
  });

  it('bare triangles go to the trim material with no variant mapping; paint keeps its livery', () => {
    const g = json(toGlb(compile(defineAsset(def(true)))));
    const byName = new Map(g.meshes.map((m) => [m.name, m.primitives[0] as Prim]));
    const paint = byName.get('body_paint_team');
    expect(g.materials[paint?.material ?? -1]?.name).toBe('ts23d_paint_team');
    expect(paint?.extensions?.['KHR_materials_variants']).toBeDefined();
    const body = byName.get('body');
    expect(g.materials[body?.material ?? -1]?.name).toBe('ts23d_trim');
    expect(body?.extensions).toBeUndefined();
  });

  it('costs no extra draw when the pivot already has unpainted geometry', () => {
    const a = compile(defineAsset(def(true)));
    // body (skid + chipped top) + body_paint_team: the same two draws as an unworn crate.
    expect(glbContents(a).draws).toBe(2);
    const triangles = (a.parts[0]?.mesh?.indices.length ?? 0) / 3;
    expect(glbContents(a).triangles).toBe(triangles + 12);
  });

  it('keepParts writes the bare triangles as a <part>_bare child of the part', () => {
    const g = json(toGlb(compile(defineAsset(def(true))), { keepParts: true }));
    const crate = g.nodes.find((n) => n.name === 'crate');
    const bare = g.nodes.findIndex((n) => n.name === 'crate_bare');
    expect(bare).toBeGreaterThanOrEqual(0);
    expect(crate?.children).toContain(bare);
  });

  it('refuses a part already named like the generated bare child', () => {
    const clash: AssetDefinition = {
      ...def(true),
      build(ctx) {
        ctx.part('crate', chipped(), { paint: 'team' });
        ctx.part('crate_bare', box({ size: [0.2, 0.2, 0.2], at: [0, 0, 1.1], color: STEEL }));
      },
    };
    expect(() => toGlb(compile(defineAsset(clash)))).toThrow(/has a part .crate_bare./);
  });

  it('is Khronos-valid', async () => {
    expect(await errors(toGlb(compile(defineAsset(def(true)))))).toEqual([]);
  });
});
