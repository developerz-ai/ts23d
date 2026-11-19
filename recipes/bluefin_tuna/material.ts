// The tuna's one strip, four bands across V: the corselet (the band of thick, larger scales behind
// the head: metal, duller and scaled), the smooth flank (guanine under tiny scales: metal,
// polished), the fin membrane (dielectric, satin) and the frayed fin margin (rough). Every
// mesh re-points its V into its band with `toBand`, keeping its own U so the fine scale texture
// stays at true size. One row instead of two: the trim sheet's custom rows are nearly all taken.

import { defineMaterial, type Mesh, stripRect, tex } from '@developerz.ai/ts23d';
import { smooth } from '../_lib/body-plan-kit.ts';

export type Band = 'flank' | 'corselet' | 'fin' | 'edge';
// Bands that blend into each other are neighbours (corselet-flank, fin-edge); the polished flank
// sits mid-row, away from the neighbouring rows' bleed at small mips.
const BANDS: readonly Band[] = ['corselet', 'flank', 'fin', 'edge'];

const bandOf = (ym: number, h: number): number => Math.min(3, Math.floor((ym / h) * 4));
const pick = (ym: number, h: number, v: readonly [number, number, number, number]): number =>
  v[bandOf(ym, h)] ?? v[0];

/** Rows of tiny scales along the body: roughness breakup in streaks (V is 1.6 cm a texel, U 0.5 mm). */
const fine = tex.noise({ size: 0.004, sizeV: 0.1, octaves: 2, seed: 21 });
/** Corselet scales: the coarsest cells the band holds (about 4 cm), a patch at hero distance. */
const big = tex.cells({ size: 0.04, seed: 22 });
/** Fin membrane: soft mottling, no structure (rays are geometry). */
const soft = tex.noise({ size: 0.03, octaves: 2, seed: 23 });

const band = (f: (b: number) => number) => tex.fn((_xm, ym, c) => f(bandOf(ym, c.metresV)), 'band');

export const SKIN = defineMaterial({
  id: 'tuna_skin',
  scaleMetres: 1,
  spanMetres: 2,
  roughness: 0.3,
  graph: tex.material({
    height: tex
      .fn(() => 0.5, 'base')
      .add(big.mul(band((b) => (b === 0 ? 0.5 : 0))))
      .add(soft.mul(band((b) => (b >= 2 ? 0.3 : 0)))),
    depth: 0.0006,
    albedo: tex
      .fn((_xm, ym, c) => pick(ym, c.metresV, [0.9, 0.97, 0.95, 0.88]), 'tone')
      .add(big.mul(band((b) => (b === 0 ? 0.08 : 0))))
      .clamp(0, 1),
    // Corselet 0.34, polished flank 0.2 (sharper and the studio horizon breaks up on the facets),
    // fin membrane 0.42, frayed margin 0.68.
    roughness: tex
      .fn((_xm, ym, c) => pick(ym, c.metresV, [0.34, 0.2, 0.42, 0.68]), 'rough')
      .add(fine.mul(band((b) => (b === 1 ? 0.06 : 0))))
      .add(big.mul(band((b) => (b === 0 ? 0.12 : 0)))),
    metalness: band((b) => (b < 2 ? 1 : 0)),
  }),
  description:
    'Tuna skin and fins: polished metallic flank, scaled corselet, satin fin membrane, rough frayed fin margin (vertex colour tints).',
});

const R = stripRect(SKIN);
const H = R.v1 - R.v0;

/**
 * Re-point a mesh's V into one band (or, per vertex, between two bands by `mix` 0..1), keeping its
 * U. The V inside the band follows the mesh's own V, squeezed to stay clear of the band's edges.
 */
export function toBand(
  mesh: Mesh,
  at: Band | ((i: number) => readonly [Band, Band, number]),
): Mesh {
  const uvs = new Float32Array(mesh.uvs);
  for (let i = 0; i < uvs.length / 2; i++) {
    const own = Math.min(1, Math.max(0, ((mesh.uvs[i * 2 + 1] ?? R.v0) - R.v0) / H));
    const [a, b, k] = typeof at === 'string' ? [at, at, 0] : at(i);
    const q = BANDS.indexOf(a) + smooth(0.35, 0.65, k) * (BANDS.indexOf(b) - BANDS.indexOf(a));
    uvs[i * 2 + 1] = R.v0 + ((q + 0.3 + 0.4 * own) / 4) * H;
  }
  return { ...mesh, uvs };
}
