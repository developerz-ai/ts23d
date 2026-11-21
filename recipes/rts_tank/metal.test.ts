// The Brinehound's bare steel takes a highlight (D595): every fitting authored in IRON (bolts,
// rails, the gun sleeve, sprocket teeth) lands on a true metal of low roughness instead of the
// rough cast iron the panel saw as "no metal sheen". Failure first: the cast-iron strip it used
// to sit on fails the same rule.

import { describe, expect, it } from 'bun:test';
import {
  compile,
  MATERIAL_LIBRARY,
  type MaterialDef,
  type Mesh,
  stripAtV,
  stripRect,
  type Vec3,
} from '@developerz.ai/ts23d';
import { STEEL_STRIP, STEEL_TINT } from './metal.ts';
import { rts_tank } from './rts_tank.ts';

/** A metal that catches a highlight: fully metallic, roughness at most 0.4. */
const sheen = (m: MaterialDef): boolean =>
  m.kind === 'metal' && (m.metalness ?? 0) >= 1 && m.roughness <= 0.4;

const tinted = (m: Mesh, v: number, tol = 0.02): boolean =>
  [0, 1, 2].every((c) => Math.abs((m.colors[v * 3 + c] ?? 0) - (STEEL_TINT as Vec3)[c as 0]) < tol);

/** Share of a mesh's triangles in the steel tint AND on the steel strip's UV row. */
function steelShare(m: Mesh): number {
  const tris = m.indices.length / 3;
  let n = 0;
  for (let t = 0; t < tris; t++) {
    const [a = 0, b = 0, c = 0] = [m.indices[t * 3], m.indices[t * 3 + 1], m.indices[t * 3 + 2]];
    const row = stripAtV(m.uvs[a * 2 + 1] ?? 0, m.uvs[b * 2 + 1] ?? 0, m.uvs[c * 2 + 1] ?? 0);
    if (row === STEEL_STRIP && tinted(m, a) && tinted(m, b) && tinted(m, c)) n++;
  }
  return n / Math.max(1, tris);
}

/** The same mesh and colours with its steel UVs moved to the cast-iron row. */
function onCastIron(m: Mesh): Mesh {
  const [from, to] = [stripRect(STEEL_STRIP), stripRect('iron_cast')];
  const uvs = new Float32Array(m.uvs);
  for (let i = 1; i < uvs.length; i += 2) {
    const v = uvs[i] ?? 0;
    if (v >= from.v0 && v <= from.v1) uvs[i] = to.v0 + (v - from.v0);
  }
  return { ...m, uvs };
}

describe('bare steel', () => {
  it('fails the old cast-iron strip', () => {
    expect(sheen(MATERIAL_LIBRARY.iron_cast)).toBe(false);
  });

  it('the steel strip is a metal that catches a highlight', () => {
    const def = (MATERIAL_LIBRARY as Readonly<Record<string, MaterialDef>>)[STEEL_STRIP];
    if (!def) throw new Error(`no library material ${STEEL_STRIP}`);
    expect(sheen(def)).toBe(true);
  });

  const part = (name: string): Mesh => {
    const m = compile(rts_tank, { lod: 0 }).parts.find((p) => p.name === name)?.mesh;
    if (!m) throw new Error(`no ${name}`);
    return m;
  };

  it('fails bolts and kit remapped to cast iron with the steel tint kept', () => {
    expect(steelShare(onCastIron(part('turret_bolts')))).toBe(0);
    expect(steelShare(onCastIron(part('hull_kit')))).toBe(0);
  });

  it('LOD0: the turret bolts and hull kit sit on the steel row in the steel tint', () => {
    expect(steelShare(part('turret_bolts'))).toBeGreaterThan(0.5);
    expect(steelShare(part('hull_kit'))).toBeGreaterThan(0.1);
  });
});
