// The tooth rows in the mouth, for the warped faces (bust.ts) and the sculpted busts: `crooked`
// (an orc's: blunt, uneven, gapped, yellowed, the lower row the bigger in front of the upper behind
// an underbite, gaps at the canines for the tusks), `sharp` (a goblin's: small pointed irregular
// teeth, two short lower fangs rising) or `human`; a dark mouth interior behind them. Every tooth
// is yellowed enamel with a darker stained neck. The orc tusks are ./tusks.ts. Positions come
// from the face's warp, so they follow every race.

import { dmath, type Mesh, merge, sweep, type Vec3 } from '@developerz.ai/ts23d';
import type { FaceHead } from './head.ts';
import { LEFT, MIDLINE } from './landmarks.ts';

export type TeethStyle = 'human' | 'crooked' | 'sharp';

/** Linear albedo: yellowed enamel at the edge, a darker stained neck, the mouth's interior. */
const ENAMEL: Vec3 = [0.52, 0.44, 0.27];
const NECK: Vec3 = [0.26, 0.18, 0.09];
const HUMAN_ENAMEL: Vec3 = [0.72, 0.68, 0.56];
const MOUTH: Vec3 = [0.05, 0.018, 0.016];
export const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** Per-tooth irregularity (a fixed table, so every build is the same): length ×, lean (rad),
 *  width ×, colour darkening; index 3 on the upper row is missing in a crooked mouth. */
const JITTER: ReadonlyArray<readonly [number, number, number, number]> = [
  [1.0, 0.0, 1.0, 0.0],
  [0.62, 0.32, 0.9, 0.18],
  [1.25, -0.22, 1.12, 0.06],
  [0.8, 0.4, 0.8, 0.3],
  [1.1, -0.15, 1.05, 0.12],
  [0.55, 0.25, 0.95, 0.38],
  [0.95, -0.35, 1.15, 0.2],
];

/** A tooth: a tapered sweep along `dir` from `root`, its neck stained toward `neck` (sharp: a
 *  pointed fang, else a blunt peg). */
export function tooth(
  root: Vec3,
  dir: Vec3,
  len: number,
  r: number,
  edge: Vec3,
  seg: number,
  sharp: boolean,
): Mesh {
  const path: Vec3[] = [];
  const scale: number[] = [];
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    path.push([root[0] + dir[0] * len * t, root[1] + dir[1] * len * t, root[2] + dir[2] * len * t]);
    scale.push(sharp ? Math.max(0.06, 1 - dmath.pow(t, 1.3) * 0.94) : 1 - 0.35 * t * t);
  }
  const m = sweep({
    section: { radius: r, segments: seg },
    path,
    scale,
    color: edge,
    strip: 'plain',
    caps: true,
  });
  return stainAlong(m, path, (t) => mix(NECK, edge, Math.min(1, t * 1.8)));
}

/** Recolour a swept mesh by each vertex's share along `path` (nearest path point). */
export function stainAlong(m: Mesh, path: readonly Vec3[], color: (t: number) => Vec3): Mesh {
  const colors = new Float32Array(m.colors.length);
  const P = m.positions;
  for (let v = 0; v < P.length / 3; v++) {
    const q: Vec3 = [P[v * 3] ?? 0, P[v * 3 + 1] ?? 0, P[v * 3 + 2] ?? 0];
    let best = 0;
    let bd = Number.POSITIVE_INFINITY;
    for (let i = 0; i < path.length; i++) {
      const c = path[i] ?? q;
      const d =
        (q[0] - c[0]) * (q[0] - c[0]) +
        (q[1] - c[1]) * (q[1] - c[1]) +
        (q[2] - c[2]) * (q[2] - c[2]);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    const c = color(best / Math.max(1, path.length - 1));
    colors[v * 3] = c[0];
    colors[v * 3 + 1] = c[1];
    colors[v * 3 + 2] = c[2];
  }
  return { ...m, colors };
}

/** Upper and lower tooth rows following the warped mouth, with the dark mouth behind them. A
 *  crooked row leaves the canine gaps to the tusks; a sharp row adds two short lower fangs. */
export function teethRows(head: FaceHead, lod: number, style: TeethStyle = 'human'): Mesh {
  const sup = head.map(MIDLINE.labraleSup);
  const inf = head.map(MIDLINE.labraleInf);
  const cl = head.map(LEFT.cheilion);
  const s = head.scale;
  const mid: Vec3 = [(sup[0] + inf[0]) / 2, 0, (sup[2] + inf[2]) / 2];
  const halfW = Math.abs(cl[1]) * 0.78;
  const seg = lod === 0 ? 8 : 5;
  const out: Mesh[] = [];
  const n = lod === 0 ? 5 : 3;
  const sharp = style === 'sharp';
  const crooked = style !== 'human';
  const edge0 = style === 'human' ? HUMAN_ENAMEL : ENAMEL;
  for (const [row, dz] of [
    [0, 1],
    [1, -1],
  ] as const) {
    for (let i = -n; i <= n; i++) {
      if (i === 0) continue;
      const k = Math.abs(i);
      const j = JITTER[(k + row * 2 + (i < 0 ? 3 : 0)) % JITTER.length] ?? [1, 0, 1, 0];
      if (style === 'crooked' && row === 0 && i === 3) continue;
      const t = (k - 0.5) / n;
      // The tusks stand at the canines (tusks.ts `tuskPath`, 0.62 of the corner): no tooth there.
      if (style === 'crooked' && row === 1 && Math.abs(t * 0.78 - 0.62) < 0.1) continue;
      const y = Math.sign(i) * halfW * t;
      // Arch: teeth sit further back toward the corners.
      // (An orc's underbite sets the lower row in front of the upper.)
      // (A goblin's small teeth sit up against the lips, where the parted grin shows them.)
      const under = style === 'crooked' && row === 1 ? 0.005 * s : sharp ? 0.003 * s : 0;
      const x = mid[0] - 0.007 * s - 0.012 * s * t * t + under;
      const zRoot = mid[2] + dz * 0.0075 * s;
      // An orc's lower row stands tall past the mouth line, the upper row short behind it.
      const big = style === 'crooked' ? (row === 1 ? 1.6 : 0.6) : 1;
      const lenK = crooked ? j[0] : 1;
      const len = (row === 0 ? 0.0085 : 0.0075) * s * (1 - 0.25 * t) * big * lenK;
      const r = (halfW / n / 2) * 0.95 * (1 - 0.2 * t) * (crooked ? j[2] : 1);
      const lean = crooked ? j[1] : 0;
      const dir: Vec3 = [0.05, dmath.sin(lean) * 0.5 * Math.sign(i), -dz * dmath.cos(lean)];
      const edge = crooked ? mix(edge0, NECK, j[3]) : edge0;
      out.push(tooth([x, y, zRoot], dir, len, r, edge, seg, sharp));
    }
  }
  if (sharp) {
    // Two short lower fangs either side of the incisors, rising past the upper teeth.
    for (const side of [1, -1] as const) {
      const x = mid[0] - 0.004 * s;
      out.push(
        tooth(
          [x, side * halfW * 0.74, mid[2] - 0.007 * s],
          [0.2, side * 0.3, 1],
          0.0095 * s,
          0.003 * s,
          ENAMEL,
          seg,
          true,
        ),
      );
    }
  }
  // The mouth's dark interior: a flat capsule behind both rows, filling the gap the lips leave.
  out.push(
    sweep({
      section: { radius: 0.009 * s, segments: seg },
      path: [-1, -0.5, 0, 0.5, 1].map(
        (u): Vec3 => [mid[0] - 0.02 * s - 0.008 * s * u * u, halfW * 1.05 * u, mid[2]],
      ),
      scale: [0.6, 1, 1, 1, 0.6],
      color: MOUTH,
      strip: 'plain',
      caps: true,
    }),
  );
  return merge(out);
}
