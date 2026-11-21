// The Brinehound's bare steel takes a highlight (D595): every fitting authored in IRON (bolts,
// rails, the gun sleeve, sprocket teeth) lands on a true metal of low roughness instead of the
// rough cast iron the panel saw as "no metal sheen". Failure first: the cast-iron strip it used
// to sit on fails the same rule.

import { describe, expect, it } from 'bun:test';
import { compile, MATERIAL_LIBRARY, type MaterialDef, type Vec3 } from '@developerz.ai/ts23d';
import { STEEL_STRIP, STEEL_TINT } from './metal.ts';
import { rts_tank } from './rts_tank.ts';

/** A metal that catches a highlight: fully metallic, roughness at most 0.4. */
const sheen = (m: MaterialDef): boolean =>
  m.kind === 'metal' && (m.metalness ?? 0) >= 1 && m.roughness <= 0.4;

/** Share of a part's vertices whose colour is within `tol` of `c`. */
function shareNear(colors: Float32Array, c: Vec3, tol = 0.02): number {
  let n = 0;
  for (let i = 0; i < colors.length; i += 3)
    if (
      Math.abs((colors[i] ?? 0) - c[0]) < tol &&
      Math.abs((colors[i + 1] ?? 0) - c[1]) < tol &&
      Math.abs((colors[i + 2] ?? 0) - c[2]) < tol
    )
      n++;
  return n / Math.max(1, colors.length / 3);
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

  it('LOD0: the turret bolts are on the steel, and the hull kit carries some', () => {
    const c = compile(rts_tank, { lod: 0 });
    const share = (name: string): number =>
      shareNear(
        c.parts.find((p) => p.name === name)?.mesh?.colors ?? new Float32Array(),
        STEEL_TINT,
      );
    expect(share('turret_bolts')).toBeGreaterThan(0.5);
    expect(share('hull_kit')).toBeGreaterThan(0.1);
  });
});
