// Physically plausible trim-sheet values per strip: albedo 30–240 sRGB (charcoal to fresh snow),
// roughness never mirror-like, metalness 0 or 1 (not a grey in between), tangent normals facing
// out of the surface. Catches the material mistakes that make an asset look "CG" in any engine.
//   it('sheet values are physical', () => assertValueRange(paintTrimSheet(mySheet)));

import { CLASSIC_STRIPS, STRIPS, stripRow } from '../material/index.ts';
import type { Finding } from '../qa/index.ts';
import { failOn } from './compiled.ts';
import { rowsOf, type SheetMaps } from './texture.ts';

export interface ValueRangeOptions {
  /** Mean albedo luminance per strip, sRGB 0–255. Default [30, 240]. */
  readonly albedo?: readonly [number, number];
  /** Strip ids to check. Default every built-in material/nature strip — classic strips are
   *  near-white multipliers of the vertex colour, so their albedo is not a material's. */
  readonly strips?: readonly string[];
}

/** Physically plausible values per strip row. Returns how many strips were checked. */
export function assertValueRange(sheet: SheetMaps, o: ValueRangeOptions = {}): number {
  const { h } = rowsOf(sheet.size);
  const [lo, hi] = o.albedo ?? [30, 240];
  const ids =
    o.strips ?? STRIPS.filter((id) => !(CLASSIC_STRIPS as readonly string[]).includes(id));
  const found: Finding[] = [];
  const mean = (
    px: Uint8Array,
    s: number,
    k: number,
    f: (v: number) => number = (v) => v,
  ): number => {
    let sum = 0;
    const start = s * h * sheet.size * 4;
    const end = (s + 1) * h * sheet.size * 4;
    for (let i = start + k; i < end; i += 4) sum += f(px[i] ?? 0);
    return sum / (h * sheet.size);
  };
  for (const id of ids) {
    const s = stripRow(id);
    if (s < 0) continue;
    const lum =
      (mean(sheet.albedo, s, 0) + mean(sheet.albedo, s, 1) + mean(sheet.albedo, s, 2)) / 3;
    if (lum < lo || lum > hi)
      found.push({
        gate: 'values',
        message: `'${id}' (row ${s}): mean albedo ${lum.toFixed(0)} outside ${lo}–${hi} sRGB`,
        fix:
          lum < lo
            ? 'nothing real is that dark (charcoal ≈ 50): raise the base colour, put darkness in AO/grime'
            : 'nothing real is that bright (fresh snow ≈ 240): lower the base colour',
      });
    if (sheet.orm) {
      const rough = mean(sheet.orm, s, 1) / 255;
      const midMetal = mean(sheet.orm, s, 2, (v) => (v > 51 && v < 204 ? 1 : 0));
      if (rough < 0.05)
        found.push({
          gate: 'values',
          message: `'${id}' (row ${s}): mean roughness ${rough.toFixed(3)} — a mirror`,
          fix: 'roughness ≥ 0.05 even for polished metal/glass',
        });
      if (midMetal > 0.2)
        found.push({
          gate: 'values',
          message: `'${id}' (row ${s}): ${(midMetal * 100).toFixed(0)}% of texels are half-metal (0.2–0.8)`,
          fix: 'metalness is 0 or 1; blend only at edges (rust over steel)',
        });
    }
    if (sheet.normal) {
      const back = mean(sheet.normal, s, 2, (v) => (v < 128 ? 1 : 0));
      if (back > 0.01)
        found.push({
          gate: 'values',
          message: `'${id}' (row ${s}): ${(back * 100).toFixed(1)}% of normal texels point into the surface (B < 128)`,
          fix: 'tangent-space normals need z > 0: renormalise, or the height→normal strength is too high',
        });
    }
  }
  failOn(
    'trim sheet values',
    found.map((finding) => ({ finding })),
  );
  return ids.length;
}
