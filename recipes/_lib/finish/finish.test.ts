// The shared finish passes: `reproject` puts a project material's triangles at that material's
// true scale (it used to skip every custom strip, leaving them on their authored UVs), and the
// weathering mud is earth that reads against the paint instead of the old shadow-black. Failure
// first: the custom-strip case is checked against the authored UVs it must leave behind.

import { describe, expect, it } from 'bun:test';
import {
  box,
  compile,
  createRng,
  defineAsset,
  defineMaterial,
  hex,
  type Mesh,
  type StripId,
  stripRect,
  type Vec3,
} from '@developerz.ai/ts23d';
import { reproject, tessellate, triangleRow, weatherer } from './finish.ts';
import { luminance, mudFor } from './wear.ts';

const SLAB = defineMaterial({
  id: 'finish_test_slab',
  kind: 'noise',
  scaleMetres: 0.5,
  roughness: 0.8,
  albedo: '#9a9a90',
  description: 'test slab for the reproject custom-strip case',
});

/** Compile one part through `f` inside a build (custom rows belong to a running compile). */
function built(f: (m: Mesh) => Mesh, strip: StripId): Mesh {
  let out: Mesh | undefined;
  compile(
    defineAsset({
      name: 'finish_reproject_probe',
      kind: 'prop',
      budget: { triangles: [5000, 5000, 5000] },
      build(ctx) {
        const m = f(tessellate(box({ size: [3, 1, 0.2], strip, color: [1, 1, 1] }), 0.25));
        out = m;
        ctx.part('slab', m);
      },
    }),
    { lod: 0 },
  );
  if (!out) throw new Error('build did not run');
  return out;
}

describe('reproject', () => {
  it('maps a project material at its own scale instead of skipping it', () => {
    const authored = built((m) => m, SLAB);
    const mapped = built(reproject, SLAB);
    expect(mapped.uvs).not.toEqual(authored.uvs);
    const r = stripRect(SLAB);
    // U is metres along X over the strip's span; every V stays inside the slab's own row.
    for (let i = 0; i < mapped.positions.length / 3; i++) {
      const v = mapped.uvs[i * 2 + 1] ?? 0;
      expect(v).toBeGreaterThanOrEqual(r.v0);
      expect(v).toBeLessThanOrEqual(r.v1);
    }
    const us = Array.from(
      { length: mapped.positions.length / 3 },
      (_, i) => mapped.uvs[i * 2] ?? 0,
    );
    const span = (Math.max(...us) - Math.min(...us)) * r.metres;
    expect(span / (r.u1 - r.u0)).toBeCloseTo(3, 1);
  });

  it('keeps a triangle straddling two strips on one of them, not the row between', () => {
    const plain = stripRect('plain');
    const steel = stripRect('steel_painted');
    const rowOf = (v: number): number => Math.floor(v / (plain.v1 - plain.v0));
    const mid = (r: { v0: number; v1: number }): number => (r.v0 + r.v1) / 2;
    // Two vertices restripped onto steel, one left plain (AO-darkened, say): steel wins.
    expect(triangleRow([steel.v0, mid(steel), mid(plain)])).toBe(rowOf(mid(steel)));
    expect(triangleRow([mid(plain), mid(plain), steel.v0])).toBe(rowOf(mid(plain)));
    // A triangle filling its strip, two vertices on the top edge: still its own strip.
    expect(triangleRow([plain.v0, plain.v1, plain.v1])).toBe(rowOf(mid(plain)));
  });

  it('still maps built-in strips', () => {
    const authored = built((m) => m, 'concrete');
    expect(built(reproject, 'concrete').uvs).not.toEqual(authored.uvs);
  });
});

describe('weatherer mud', () => {
  const at = (m: Mesh, i: number): Vec3 => [
    m.colors[i * 3] ?? 0,
    m.colors[i * 3 + 1] ?? 0,
    m.colors[i * 3 + 2] ?? 0,
  ];
  /** The colour of the lowest vertex after full-strength mud. */
  const mudOn = (paint: Vec3, mudColor?: Vec3): Vec3 => {
    const m = tessellate(box({ size: [1, 1, 1], color: paint }), 0.2);
    const w = weatherer(createRng(7))(m, {
      mud: 0.6,
      mudStrength: 1,
      ...(mudColor ? { mudColor } : {}),
    });
    let low = 0;
    for (let i = 0; i < m.positions.length / 3; i++)
      if ((m.positions[i * 3 + 2] ?? 0) < (m.positions[low * 3 + 2] ?? 0)) low = i;
    return at(w, low);
  };

  it('defaults to earth chosen against the paint, never shadow-black', () => {
    for (const paint of [hex('#1c1c1c'), hex('#8a8d8f'), hex('#e8e8e2')]) {
      const c = mudOn(paint);
      expect(luminance(c)).toBeGreaterThan(0.035);
      for (const k of [0, 1, 2]) expect(c[k]).toBeCloseTo(mudFor(paint)[k] ?? 0, 3);
    }
  });

  it('takes an explicit mud colour', () => {
    const red: Vec3 = [0.3, 0.05, 0.02];
    const c = mudOn(hex('#8a8d8f'), red);
    for (const k of [0, 1, 2]) expect(c[k]).toBeCloseTo(red[k] ?? 0, 3);
  });
});
