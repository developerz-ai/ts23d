import { describe, expect, it } from 'bun:test';
import { compile, dmath, type Mesh, sculpt } from '@developerz.ai/ts23d';
import { add, dot, mul, sub, type V } from '../_lib/bust/kit.ts';
import { cap } from './fittings.ts';
import { orc_head } from './orc_head.ts';
import { C } from './palette.ts';
import { EYE } from './spec.ts';

const far = compile(orc_head, { lod: 2 });
const part = (name: string) => far.parts.find((p) => p.name === name);
const tris = (name: string): number => (part(name)?.mesh?.indices.length ?? 0) / 3;

/** D549: the far pauldron keeps the near LODs' round, flared lip. Its rim vertices (just under
 *  the dome's base plane, outside 95 % of its radius) must be a ring at the lip's radius. */
function rimFindings(m: Mesh | null | undefined, s: number): string[] {
  if (!m) return ['no pauldrons'];
  const { at, axis, R } = cap(s);
  const radii: number[] = [];
  for (let i = 0; i < m.positions.length; i += 3) {
    const d = sub([m.positions[i] ?? 0, m.positions[i + 1] ?? 0, m.positions[i + 2] ?? 0], at);
    const h = dot(d, axis);
    const r = dmath.hypot(d[0] - axis[0] * h, d[1] - axis[1] * h, d[2] - axis[2] * h);
    if (h > -0.017 && h < -0.011 && r > R * 0.95 && r < R * 1.3) radii.push(r);
  }
  if (radii.length < 8) return [`${radii.length} rim vertices (want a ring of ≥ 8)`];
  const off = Math.max(...radii.map((r) => Math.abs(r - R * 1.09)));
  return off > 0.004 ? [`rim ${(off * 1000).toFixed(1)} mm off the lip's circle (want ≤ 4)`] : [];
}

/** The pauldron the far LOD had: a cap of a sphere sculpted at a 3.2 cm cell. */
function sculptedDome(s: number): Mesh {
  const { at, axis, R, H } = cap(s);
  const rs = (R * R + H * H) / (2 * H);
  const everywhere: [V, V] = [
    [-1, -1, -1],
    [1, 1, 2],
  ];
  return sculpt({
    edits: [
      {
        group: [
          { shape: 'sphere', at: add(at, mul(axis, H - rs)), size: rs },
          {
            field: (p) => -dot(sub(p, at), axis) - 0.012,
            bounds: everywhere,
            op: 'intersect',
            blend: 0,
          },
        ],
      },
    ],
    resolution: 0.032,
    color: C.plate,
  });
}

/** The far head's skin front (largest x of the head mesh) on the line along X through (y, z). */
function skinFront(m: Mesh, y: number, z: number): number {
  let best = Number.NEGATIVE_INFINITY;
  const P = m.positions;
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [m.indices[t] ?? 0, m.indices[t + 1] ?? 0, m.indices[t + 2] ?? 0].map(
      (v): V => [P[v * 3] ?? 0, P[v * 3 + 1] ?? 0, P[v * 3 + 2] ?? 0],
    ) as [V, V, V];
    // Barycentric coordinates of (y, z) in the triangle's YZ projection.
    const den = (b[2] - c[2]) * (a[1] - c[1]) + (c[1] - b[1]) * (a[2] - c[2]);
    if (Math.abs(den) < 1e-12) continue;
    const u = ((b[2] - c[2]) * (y - c[1]) + (c[1] - b[1]) * (z - c[2])) / den;
    const v = ((c[2] - a[2]) * (y - c[1]) + (a[1] - c[1]) * (z - c[2])) / den;
    if (u < 0 || v < 0 || u + v > 1) continue;
    best = Math.max(best, u * a[0] + v * b[0] + (1 - u - v) * c[0]);
  }
  return best;
}

/** Bumps along the face's midline profile (the skin front at y = 0, every 5 mm up the face):
 *  forward peaks standing at least `rise` proud of the profile 3 cm above and below. A brow, a
 *  nose and a chin each make one; a smooth egg makes none, however many triangles it has. */
function profilePeaks(m: Mesh, rise = 0.004): number {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (let i = 2; i < m.positions.length; i += 3) {
    lo = Math.min(lo, m.positions[i] ?? 0);
    hi = Math.max(hi, m.positions[i] ?? 0);
  }
  const zs: number[] = [];
  for (let z = lo + 0.03; z <= hi - 0.03; z += 0.005) zs.push(z);
  const x = zs.map((z) => skinFront(m, 0, z));
  let peaks = 0;
  for (let i = 6; i < zs.length - 6; i++) {
    const at = x[i] ?? Number.NEGATIVE_INFINITY;
    if (!Number.isFinite(at)) continue;
    const isMax = x.slice(i - 2, i + 3).every((v) => v <= at);
    const below = x[i - 6] ?? Number.POSITIVE_INFINITY;
    const above = x[i + 6] ?? Number.POSITIVE_INFINITY;
    if (isMax && at - below >= rise && at - above >= rise) peaks++;
  }
  return peaks;
}

/** A smooth head: an egg sculpted at the far cell, with no brow, nose or jaw. */
const egg = (): Mesh =>
  sculpt({
    edits: [{ shape: 'ellipsoid', at: [0, 0, 0.2], size: [0.1, 0.09, 0.13] }],
    resolution: 0.012,
    color: C.plate,
  });

/** The orbit's rim at the far cell: the skin's front beside and under the left eye, 1.4 ball
 *  radii off its axis (not above: that is the brow shelf, which overhangs every orc eye). */
function orbitRim(head: Mesh): number {
  const [, ey, ez] = EYE.centre;
  const ring = [180, 225, 270, 315, 360].map((deg) => {
    const a = (deg * Math.PI) / 180;
    return skinFront(head, ey + EYE.r * 1.4 * dmath.cos(a), ez + EYE.r * 1.4 * dmath.sin(a));
  });
  return Math.max(...ring);
}

/** D549: an ember eye must show at a distance: the ball's front out past the orbit's rim (a
 *  ball sunk behind it is a dark pit from any view but straight on). */
function eyeFindings(ballX: number, head: Mesh | null | undefined): string[] {
  if (!head) return ['no head'];
  const proud = ballX + EYE.r - orbitRim(head);
  return proud < 0.001
    ? [`eyeball front ${(proud * 1000).toFixed(1)} mm past the far orbit's rim (want ≥ 1)`]
    : [];
}

/** D549: the far beard is one solid mass, not a handful of cards. */
function beardFindings(count: (name: string) => number): string[] {
  const out: string[] = [];
  if (count('beard') < 100) out.push(`far beard mass has ${count('beard')} triangles (want ≥ 100)`);
  if (count('hair') > 120)
    out.push(`${count('hair')} card triangles at the far LOD (brows only: ≤ 120)`);
  return out;
}

describe('orc far LOD (D549)', () => {
  it('a dome sculpted at the far cell has no lip ring and is caught', () => {
    expect(rimFindings(sculptedDome(1), 1).length).toBeGreaterThan(0);
  });
  it('both far pauldrons keep the round flared lip', () => {
    const m = part('pauldrons')?.mesh;
    expect(rimFindings(m, 1)).toEqual([]);
    expect(rimFindings(m, -1)).toEqual([]);
  });
  it('an eyeball left at its anatomical centre sits behind the far orbit rim and is caught', () => {
    expect(eyeFindings(EYE.centre[0], part('head')?.mesh).length).toBeGreaterThan(0);
  });
  it('the far eyes stand out past the orbit rim', () => {
    expect(eyeFindings(part('eye_l')?.at?.[0] ?? 0, part('head')?.mesh)).toEqual([]);
  });
  it('a far LOD whose beard is cards is caught', () => {
    expect(beardFindings((n) => (n === 'hair' ? 212 : 0))).toHaveLength(2);
  });
  it('the far beard is a solid mass and only the brows stay cards', () => {
    expect(beardFindings(tris)).toEqual([]);
  });
  it('a smooth egg of a head has no brow, nose or chin on its profile and is caught', () => {
    expect(profilePeaks(egg())).toBe(0);
  });
  it('the far head keeps a brow, a nose and a jaw on its midline profile', () => {
    const head = part('head')?.mesh;
    expect(head ? profilePeaks(head) : 0).toBeGreaterThanOrEqual(2);
    expect(tris('pauldrons') + tris('spikes')).toBeLessThan(900);
  });
});
