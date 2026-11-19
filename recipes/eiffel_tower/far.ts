// The far LOD's see-through lattice: one alpha-cutout material strip (`eiffel_far_lattice`) painted
// with the tower's panel pattern — corner posts, a horizontal at each panel joint and a St Andrew's
// cross per panel — and open frustum shells whose faces carry it, cut into panel-high bands with
// a whole number of panels across. On a `surface: 'cutout'` part the holes are alpha-tested away,
// so the legs and shaft stay a lattice at distance for two triangles a panel row, not a solid pylon.

import {
  add,
  cross,
  defineMaterial,
  dot,
  type MaterialPainter,
  type Mesh,
  MeshBuilder,
  normalize,
  scale,
  stripRect,
  sub,
  TRIM_SHEET_SIZE,
  type Vec3,
} from '@developerz.ai/ts23d';

/** Panels the strip holds along U before it repeats; one band of V is one panel tall. */
const PANELS = 4;
/** Bar half-widths in panel units: corner posts, joint horizontals, the cross. */
const POST = 0.085;
const RAIL = 0.07;
const DIAG = 0.065;

/** Coverage of the lattice at (cu, cv) in one panel, 0..1, with a one-texel soft edge `e`. */
export function lattice(cu: number, cv: number, eu: number, ev: number): number {
  const bar = (d: number, w: number, e: number): number =>
    Math.min(1, Math.max(0, (w - d) / e + 0.5));
  const post = bar(Math.min(cu, 1 - cu), POST, eu);
  const rail = bar(Math.min(cv, 1 - cv), RAIL, ev);
  // A diagonal's distance, measured across the bar in panel units (the panel is square).
  const e = Math.max(eu, ev);
  const d1 = bar(Math.abs(cu - cv) / Math.SQRT2, DIAG, e);
  const d2 = bar(Math.abs(cu + cv - 1) / Math.SQRT2, DIAG, e);
  return Math.max(post, rail, d1, d2);
}

/** Paints the lattice: alpha = bars, a grey tone the vertex colour tints, a rounded relief. */
const paintLattice: MaterialPainter = (s) => {
  const rgba = new Uint8Array(s.w * s.h * 4);
  const eu = PANELS / s.w;
  const ev = 1 / s.h;
  for (let y = 0; y < s.h; y++) {
    const cv = (y + 0.5) / s.h;
    for (let x = 0; x < s.w; x++) {
      const cu = (((x + 0.5) / s.w) * PANELS) % 1;
      const a = lattice(cu, cv, eu, ev);
      const i = y * s.w + x;
      const g = Math.round(255 * (0.72 + 0.1 * a) ** (1 / 2.2));
      rgba.set([g, g, g, Math.round(a * 255)], i * 4);
      s.height[i] = a * 0.02;
      s.rough[i] = 0.55;
    }
  }
  s.rgba = rgba;
};

export const FAR_LATTICE = defineMaterial({
  id: 'eiffel_far_lattice',
  kind: 'flat',
  scaleMetres: 1,
  spanMetres: PANELS,
  roughness: 0.55,
  paint: paintLattice,
  description:
    'Far-LOD lattice for the Eiffel Tower shell: corner posts, joint horizontals and a St Andrew’s cross per panel; alpha cuts the holes (surface: cutout).',
});

const RECT = stripRect(FAR_LATTICE);
const HALF = 0.5 / TRIM_SHEET_SIZE;
/** UV for `panels` across (U) and a fraction of one band (V). */
const uvAt = (panels: number, fv: number): [number, number] => [
  RECT.u0 + (panels / PANELS) * (RECT.u1 - RECT.u0),
  RECT.v0 + HALF + fv * (RECT.v1 - RECT.v0 - 2 * HALF),
];

/**
 * The open sides of a frustum from ring `lo` to ring `hi` (four corners each, any winding), each
 * face cut into bands about `panel` metres tall with a whole number of square-ish panels across;
 * normals face out of the frustum. No caps: the decks close it where the tower has floors.
 */
export function latticeFrustum(
  lo: readonly Vec3[],
  hi: readonly Vec3[],
  panel: number,
  color: Vec3,
): Mesh {
  const b = new MeshBuilder();
  const all = [...lo, ...hi];
  const c = scale(
    all.reduce((s, p) => add(s, p), [0, 0, 0] as Vec3),
    1 / all.length,
  );
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const [a0, a1, b0, b1] = [lo[i], lo[j], hi[i], hi[j]].map((p) => p ?? c) as [
      Vec3,
      Vec3,
      Vec3,
      Vec3,
    ];
    const h = Math.abs((b0[2] ?? 0) - (a0[2] ?? 0));
    const bands = Math.max(1, Math.round(h / panel));
    const width = (Math.hypot(...sub(a1, a0)) + Math.hypot(...sub(b1, b0))) / 2;
    const across = Math.max(1, Math.round(width / (h / bands)));
    let n = normalize(cross(sub(a1, a0), sub(b0, a0)));
    const mid = scale(add(add(a0, a1), add(b0, b1)), 0.25);
    const flip = dot(n, sub(mid, c)) < 0;
    if (flip) n = scale(n, -1);
    for (let k = 0; k < bands; k++) {
      const [t0, t1] = [k / bands, (k + 1) / bands];
      const at = (l: Vec3, u: Vec3, t: number): Vec3 => add(l, scale(sub(u, l), t));
      const quad = [at(a0, b0, t0), at(a1, b1, t0), at(a1, b1, t1), at(a0, b0, t1)];
      const uv = [uvAt(0, 0), uvAt(across, 0), uvAt(across, 1), uvAt(0, 1)];
      const ids = quad.map((p, q) => b.vertex({ p, n, uv: uv[q] ?? [0, 0], color }));
      const [i0 = 0, i1 = 0, i2 = 0, i3 = 0] = ids;
      if (flip) b.quad(i0, i3, i2, i1);
      else b.quad(i0, i1, i2, i3);
    }
  }
  return b.build();
}
