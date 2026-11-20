// The cobra's one strip and where each surface samples it. U runs a tileable ramp from a scale's
// matte, darker rim (t 0) to its glossy keratin crown (t 1); V holds two rows of that ramp: fresh
// scales, and the milky, dull scales of a pre-shed patch. A scale's corners sample the rim and its
// peak the crown, so every scale carries its own roughness gradient on the one material. The story
// marks (a pre-shed patch, a healed bite scar, scuffed tail scutes, dust on the lowest turn) live here too, so the scale
// geometry, the tube's vertex colour and the LOD2 average all agree on them.

import {
  defineMaterial,
  dmath,
  hex,
  type Mesh,
  stripRect,
  tex,
  type Vec3,
} from '@developerz.ai/ts23d';
import { fbm, gauss, mix, mixRgb, smooth } from '../_lib/body-plan-kit.ts';
import { frameAt } from './shape.ts';

const tri = (xm: number, tile: number): number =>
  1 - Math.abs((2 * (((xm % tile) + tile) % tile)) / tile - 1);
const dullRow = (ym: number, h: number): number => smooth(0.45, 0.55, ym / h);

export const SCALE_STRIP = defineMaterial({
  id: 'cobra_scale',
  scaleMetres: 0.2,
  roughness: 0.34,
  graph: tex.material({
    height: tex.fn((xm, _ym, c) => tri(xm, c.tileU), 'crown'),
    depth: 0.0003,
    // Fresh keratin: rim 0.38 to crown 0.12 (glossy snake scale); pre-shed or dusty: 0.74 to 0.6.
    roughness: tex.fn((xm, ym, c) => {
      const t = tri(xm, c.tileU);
      return mix(mix(0.38, 0.12, t), mix(0.74, 0.6, t), dullRow(ym, c.metresV));
    }, 'cobra_roughness'),
    // A grey tone the vertex colour tints: rims a shade darker, the pre-shed cap milky and flat.
    albedo: tex.fn((xm, ym, c) => {
      const t = tri(xm, c.tileU);
      return mix(0.8 + 0.2 * t, 0.97, dullRow(ym, c.metresV));
    }, 'cobra_tone'),
  }),
  description:
    'Snake scale keratin: glossy crowns, matte rims; a dull milky row for scales about to be shed (vertex colour tints).',
});

const RECT = stripRect(SCALE_STRIP);

/** UV of a point `t` along the rim-to-crown ramp, on the fresh or the pre-shed row. */
export const scaleUv = (t: number, dull = 0): [number, number] => [
  RECT.u0 + 0.5 * Math.max(0, Math.min(1, t)),
  RECT.v0 + (dull > 0.5 ? 0.75 : 0.25) * (RECT.v1 - RECT.v0),
];

/** Re-point every vertex of a loft (rows of `sides + 1`, two poles last) at its own ramp UV. */
export function pinLoftUv(
  mesh: Mesh,
  us: readonly number[],
  sides: number,
  at: (s: number, a: number) => readonly [number, number],
): Mesh {
  const uvs = new Float32Array(mesh.uvs);
  const count = mesh.positions.length / 3;
  const ring = sides + 1;
  for (let v = 0; v < count; v++) {
    const pole = v >= us.length * ring;
    const i = pole ? (v === us.length * ring ? 0 : us.length - 1) : Math.floor(v / ring);
    const a = pole ? 0 : ((v % ring) / sides) * Math.PI * 2;
    const [t, dull] = at(us[i] ?? 0, a);
    const [u, w] = scaleUv(t, dull);
    uvs[v * 2] = u;
    uvs[v * 2 + 1] = w;
  }
  return { ...mesh, uvs };
}

/** Pin a whole mesh at one ramp point (eyes, tongue). */
export function pinUv(mesh: Mesh, t: number): Mesh {
  const [u, v] = scaleUv(t);
  const uvs = new Float32Array(mesh.uvs.length);
  for (let i = 0; i < uvs.length; i += 2) [uvs[i], uvs[i + 1]] = [u, v];
  return { ...mesh, uvs };
}

/** Milky, papery grey of old skin lifting off the new one: the pattern ghosts through it. */
const SHED_TINT: Vec3 = hex('#dcd9cf');
/** The lifted old skin's torn rim casts a thin dark line round the patch. */
const SHED_RIM: Vec3 = hex('#1a1813');
/** Healed scar tissue: pale, pinkish grey, no pattern. */
const SCAR_TINT: Vec3 = hex('#e6d2bc');
/** Dry loam the lowest turn has lain in. */
export const DUST: Vec3 = hex('#b4a27c');
/**
 * Share of the dust the far tube takes. Its 6-sided rings put most vertices on the coil's flanks,
 * where the dust lies: at 0.9 the whole far coil went pale tan and the LOD switch popped from
 * the dark olive pile (D480). The far coil keeps the olive and a hint of the loam.
 */
export const FAR_DUST = 0.2;

/**
 * Pre-shed patch on the outer flank of the top turn of the pile, where the hero camera looks: 0..1.
 * A ragged oval: the old skin has started to cloud from the edges in.
 */
export const shedAt = (s: number, a: number): number => shedOf(shedField(s, a));
/** The patch's raw field (0 off it); `shedOf` and `rimOf` read it, so `marked` derives it once. */
const shedField = (s: number, a: number): number => {
  const fromRidge = Math.abs(dmath.atan2(dmath.sin(a), dmath.cos(a)));
  // 9 cm either way: at 13 cm the milky patch covered the whole near half of the top turn and
  // took its crossbands with it (D480).
  const along = gauss(s - SHED_AT, 0.09);
  const ragged = 0.75 + 0.25 * dmath.sin(s * 61 + a * 7) * dmath.sin(s * 23 - a * 5);
  return along * ragged * (1 - smooth(2, 2.5, fromRidge));
};
const shedOf = (f: number): number => smooth(0.35, 0.6, f);
/** The torn rim of the lifted skin, just outside the patch: 0..1. */
const rimOf = (f: number): number => gauss(f - 0.31, 0.035) * smooth(0.15, 0.25, f);
/** Centre of the pre-shed patch along the body, metres from the snout: the top turn's near side. */
export const SHED_AT = 1.56;

/**
 * A healed bite scar across the back of the raised neck's base: two parallel diagonal grooves
 * (a prey snake's or a mongoose's teeth), 0..1 along each groove.
 */
export function scarAt(s: number, a: number): number {
  const across = dmath.atan2(dmath.sin(a), dmath.cos(a));
  const line = (k: number): number => gauss(s - SCAR_AT - k - across * 0.12, 0.026);
  const reach = 1 - smooth(1.1, 1.7, Math.abs(across));
  return Math.min(1, Math.max(line(0), 0.85 * line(0.06))) * reach;
}
/** Where the scar crosses the dorsal ridge, metres from the snout: the top turn, in the hero's view. */
export const SCAR_AT = 1.84;

/** Scuffs on the tail's ventral scutes, worn by dragging over rock: 0..1. */
export const scuffAt = (s: number, k: number): number =>
  smooth(TAIL_WEAR, TAIL_WEAR + 0.4, s) * dmath.pow(0.5 + 0.5 * dmath.sin(s * 173 + k * 2.1), 3);
const TAIL_WEAR = 2.6;

/**
 * Dust on the turns lying on the ground, 0..1: the lower flanks and belly of the bottom turn
 * coated, its back lightly; the top turn only where it hangs down to the floor. Broad and patchy,
 * so it reads from the hero distance.
 */
export function dustAt(s: number, a: number): number {
  const onGround = smooth(0.9, 1.25, s);
  if (onGround === 0) return 0;
  const low = 1 - smooth(0.03, 0.06, frameAt(s).p[2]);
  const flank = smooth(1.05, 1.95, Math.abs(dmath.atan2(dmath.sin(a), dmath.cos(a))));
  const patchy = 0.45 + 0.55 * fbm(s * 13, a * 2.3, 3);
  return Math.min(1, onGround * (0.45 * low + flank * (0.5 + 0.5 * low)) * patchy * 1.6);
}

/** Colour after the story marks: pre-shed clouding with its torn rim, the scar, then dust. `far`
 *  (LOD2) keeps only the dust: a small mark sampled on a coarse ring paints a whole segment. */
export function marked(c: Vec3, s: number, a: number, far = false): Vec3 {
  if (far) return mixRgb(c, DUST, dustAt(s, a) * FAR_DUST);
  const dusty = (v: Vec3): Vec3 => mixRgb(v, DUST, dustAt(s, a) * 0.75);
  const f = shedField(s, a);
  // The bands ghost through the milky old skin (at 0.18 the patch hid the near turn's bands).
  const clouded = mixRgb(c, mixRgb(SHED_TINT, c, 0.45), shedOf(f) * 0.92);
  const rimmed = mixRgb(clouded, SHED_RIM, rimOf(f) * 0.8);
  return dusty(mixRgb(rimmed, SCAR_TINT, scarAt(s, a) * 0.9));
}
