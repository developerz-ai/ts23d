// Own texture sets on imported parts: a missing part fails with its fix; the named part (on every
// LOD tree) gets its own albedo + normal material, TANGENT, no COLOR_0; the GLB stays
// Khronos-valid; tangents agree in handedness with /export's tangentsOf.

import { describe, expect, it } from 'bun:test';
import { validateBytes } from 'gltf-validator';
import { compile, defineAsset, encodePng, type Lod, MeshBuilder } from '../core/index.ts';
import { readAccessor, readGlb } from '../neural/index.ts';
import { uvTangents } from '../passes/index.ts';
import { box } from '../primitives/index.ts';
import { toLodGlb } from './glb.ts';
import { withOwnTextures } from './own-textures.ts';
import { tangentsOf } from './tangents.ts';

/** A curved strip (quarter cylinder) with UVs: a smooth surface, not a flat quad. */
function strip(): ReturnType<MeshBuilder['build']> {
  const b = new MeshBuilder();
  const n = 8;
  const id: number[] = [];
  for (let j = 0; j <= 1; j++)
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * (Math.PI / 2);
      id.push(
        b.vertex({
          p: [0.3 * Math.cos(a), 0.3 * Math.sin(a), j * 0.4 + 0.2],
          n: [Math.cos(a), Math.sin(a), 0],
          uv: [i / n, 1 - j],
          color: [1, 1, 1],
        }),
      );
    }
  for (let i = 0; i < n; i++)
    b.quad(id[i] ?? 0, id[i + 1] ?? 0, id[n + 2 + i] ?? 0, id[n + 1 + i] ?? 0);
  return b.build();
}

const asset = defineAsset({
  name: 'scan_on_base',
  kind: 'prop',
  budget: { triangles: [999, 999, 999] },
  build(ctx) {
    ctx.part('base', box({ size: [0.5, 0.5, 0.2], at: [0, 0, 0.1], color: [0.4, 0.4, 0.4] }));
    ctx.part('scan', strip());
  },
});
const lods = ([0, 1, 2] as Lod[]).map((lod) => compile(asset, { lod }));
const png = encodePng(2, 2, new Uint8Array(16).fill(200));

describe('withOwnTextures', () => {
  it('fails on a part that is not a node with a mesh', () => {
    expect(() =>
      withOwnTextures(toLodGlb(lods, { keepParts: true }), [
        { part: 'nope', albedo: png, normal: png },
      ]),
    ).toThrow('T3D_RECIPE_INVALID');
  });
  it('gives the part its own material on every LOD, with tangents and no vertex colour', async () => {
    const glb = withOwnTextures(toLodGlb(lods, { keepParts: true }), [
      { part: 'scan', albedo: png, normal: png },
    ]);
    const doc = readGlb(glb);
    const j = doc.json as {
      nodes: { name?: string; mesh?: number }[];
      meshes: { primitives: { attributes: Record<string, number>; material: number }[] }[];
      materials: { name?: string; normalTexture?: unknown }[];
      extras: { ts23d: { ownMaterials: { part: string; material: string; nodes: number }[] } };
    };
    const scans = j.nodes.filter((n) => n.name === 'scan');
    expect(scans.length).toBe(3);
    for (const n of scans) {
      const p = j.meshes[n.mesh ?? -1]?.primitives[0];
      expect(p?.attributes['COLOR_0']).toBeUndefined();
      expect(j.materials[p?.material ?? -1]?.name).toBe('scan_own');
      const t = readAccessor(doc, p?.attributes['TANGENT'] ?? -1);
      expect(t.count).toBe(readAccessor(doc, p?.attributes['POSITION'] ?? -1).count);
    }
    expect(j.extras.ts23d.ownMaterials).toEqual([{ part: 'scan', material: 'scan_own', nodes: 3 }]);
    // The validator calls Math.random (sealed in tests): give it a seeded one for this call.
    const sealed = Math.random;
    let s = 1;
    Math.random = () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
    try {
      const report = await validateBytes(glb);
      const bad = report.issues.messages.filter((m: { severity: number }) => m.severity <= 1);
      expect(bad).toEqual([]);
    } finally {
      Math.random = sealed;
    }
  });
  it("bake tangents match the exporter's convention (same handedness, ~same direction)", () => {
    const m = strip();
    const a = uvTangents(m);
    const b = tangentsOf(m);
    for (let i = 0; i < a.length; i += 4) {
      expect(a[i + 3]).toBe(b[i + 3] ?? 0);
      const d =
        (a[i] ?? 0) * (b[i] ?? 0) +
        (a[i + 1] ?? 0) * (b[i + 1] ?? 0) +
        (a[i + 2] ?? 0) * (b[i + 2] ?? 0);
      expect(d).toBeGreaterThan(0.99);
    }
  });
});
