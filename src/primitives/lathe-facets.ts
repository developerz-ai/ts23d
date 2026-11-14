// Faceted bands for `lathe({ faceted: true })`: every segment quad gets four vertices of its own
// and the exact normal of its facet plane, so an n-sided tank, tower or roof shades flat.

import type { Vec2, Vec3 } from '../core/index.ts';

/** The profile and segment count lathe was given. */
interface Facetable {
  readonly profile: readonly Vec2[];
  readonly segments: number;
}

export /** Flat-shaded bands: four own vertices per segment quad, normal of the facet plane. */
function facets(
  o: Facetable,
  put: (p: Vec3, n: Vec3, uv: Vec2) => number,
  tri: (a: number, b: number, c: number) => void,
  sideUv: (s: number, i: number, r: number) => Vec2,
  poleRadius: number,
): void {
  const half = Math.PI / o.segments;
  const corner = (s: number): [number, number] => {
    const t = (s / o.segments) * Math.PI * 2 - Math.PI / 2;
    return [Math.cos(t), Math.sin(t)];
  };
  for (let i = 0; i + 1 < o.profile.length; i++) {
    const [r0 = 0, z0 = 0] = o.profile[i] ?? [];
    const [r1 = 0, z1 = 0] = o.profile[i + 1] ?? [];
    for (let s = 0; s < o.segments; s++) {
      const tm = ((s + 0.5) / o.segments) * Math.PI * 2 - Math.PI / 2;
      // The facet's chord sits cos(half) inside the ring, which tilts its normal by that much.
      const nx = (z1 - z0) * Math.cos(tm);
      const ny = (z1 - z0) * Math.sin(tm);
      const nz = -(r1 - r0) * Math.cos(half);
      const l = Math.hypot(nx, ny, nz) || 1;
      const n: Vec3 = [nx / l, ny / l, nz / l];
      const [c0, s0] = corner(s);
      const [c1, s1] = corner(s + 1);
      const a = put([r0 * c0, r0 * s0, z0], n, sideUv(s, i, r0));
      const bb = put([r0 * c1, r0 * s1, z0], n, sideUv(s + 1, i, r0));
      const c = put([r1 * c1, r1 * s1, z1], n, sideUv(s + 1, i + 1, r1));
      const d = put([r1 * c0, r1 * s0, z1], n, sideUv(s, i + 1, r1));
      // A pole ring (r = 0) keeps only the triangle that reaches the other ring.
      if (r0 > poleRadius) tri(a, bb, c);
      if (r1 > poleRadius) tri(a, c, d);
    }
  }
}
