// The cobra's one strip and where each surface samples it. U runs a tileable ramp from a scale's
// matte, darker rim (t 0) to its glossy keratin crown (t 1); V holds two rows of that ramp: fresh
// scales, and the milky, dull scales of a pre-shed patch. A scale's corners sample the rim and its
// peak the crown, so every scale carries its own roughness gradient on the one material. The story
// marks (a pre-shed patch, a healed bite scar, scuffed tail scutes) live here too, so the scale
// geometry, the tube's vertex colour and the LOD2 average all agree on them.

import { defineMaterial, type Mesh, stripRect, tex, type Vec3 } from '@developerz.ai/ts23d';
import { gauss, mix, mixRgb, smooth } from '../_lib/body-plan-kit.ts';

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
    // Fresh keratin: rim 0.52 to crown 0.14 (glossy snake scale); pre-shed: dull 0.74 to 0.6.
    roughness: tex.fn((xm, ym, c) => {
      const t = tri(xm, c.tileU);
      return mix(mix(0.52, 0.14, t), mix(0.74, 0.6, t), dullRow(ym, c.metresV));
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

/** Milky blue-grey of scales whose old skin has lifted off the new one (eyes go blue too). */
const SHED_TINT: Vec3 = [0.36, 0.38, 0.4];
/** Healed scar tissue: pale, pinkish grey, no pattern. */
const SCAR_TINT: Vec3 = [0.42, 0.33, 0.3];

/**
 * Pre-shed patch on the outer flank of the top turn of the pile, where the hero camera looks: 0..1.
 * A ragged oval: the old skin has started to cloud from the edges in.
 */
export function shedAt(s: number, a: number): number {
  const fromRidge = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
  const along = gauss(s - SHED_AT, 0.17);
  const ragged = 0.75 + 0.25 * Math.sin(s * 61 + a * 7) * Math.sin(s * 23 - a * 5);
  return smooth(0.35, 0.6, along * ragged * (1 - smooth(1.5, 2.0, fromRidge)));
}
/** Centre of the pre-shed patch along the body, metres from the snout. */
export const SHED_AT = 1.95;

/**
 * A healed bite scar across the back of the raised neck's base: two parallel diagonal grooves
 * (a prey snake's or a mongoose's teeth), 0..1 along each groove.
 */
export function scarAt(s: number, a: number): number {
  const across = Math.atan2(Math.sin(a), Math.cos(a));
  const line = (k: number): number => gauss(s - SCAR_AT - k - across * 0.04, 0.007);
  const reach = 1 - smooth(0.9, 1.5, Math.abs(across));
  return Math.min(1, Math.max(line(0), 0.8 * line(0.024))) * reach;
}
/** Where the scar crosses the dorsal ridge, metres from the snout. */
export const SCAR_AT = 1.55;

/** Scuffs on the tail's ventral scutes, worn by dragging over rock: 0..1. */
export const scuffAt = (s: number, k: number): number =>
  smooth(TAIL_WEAR, TAIL_WEAR + 0.4, s) * (0.5 + 0.5 * Math.sin(s * 173 + k * 2.1)) ** 3;
const TAIL_WEAR = 2.6;

/** Colour after the story marks: pre-shed clouding, then the scar. */
export function marked(c: Vec3, s: number, a: number): Vec3 {
  const shed = shedAt(s, a);
  const clouded = mixRgb(c, mixRgb(SHED_TINT, c, 0.25), shed * 0.9);
  return mixRgb(clouded, SCAR_TINT, scarAt(s, a) * 0.85);
}
