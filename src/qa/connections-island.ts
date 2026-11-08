// The messages for pieces the connectivity graph could not hold: an island (with its nearest
// held neighbour, measured surface to surface) or a cluster hanging on by points and edges.

import type { Vec3 } from '../core/index.ts';
import { type ConnectIssue, cm, fmt } from './connections-declare.ts';
import type { Shell } from './connections-shells.ts';
import { boxGap, probeOf, samplesIn, stepOf, thickness } from './contact.ts';

/** Islands whose nearest neighbour is measured for the message (it costs). */
export const NAMED_ISLANDS_DEFAULT = 12;
/** Share of the thinnest piece's section² a cluster's contacts must add up to. */
export const STRONG_SHARE = 0.1;

/** Nearest other piece in the held set and the surface distance to it: sample-to-sample to
 *  rank, then exact point-to-surface queries with a tight radius (wide radii walk many cells). */
export function nearest(
  group: readonly Shell[],
  held: readonly Shell[],
): { to: Shell; d: number } | null {
  const s = group.reduce((m, x) => (x.area > m.area ? x : m));
  const ranked = held
    .map((h) => ({ h, g: boxGap(s, h) }))
    .sort((a, b) => a.g - b.g)
    .slice(0, 6);
  const S = samplesIn(s, null, 0, Math.max(0.005, stepOf(s)), 150);
  let best = null as { to: Shell; d: number } | null;
  for (const { h, g } of ranked) {
    if (best && g >= best.d) continue;
    const H = samplesIn(h, s.bounds, g + 0.05, Math.max(0.005, stepOf(h)), 800);
    let approx = Infinity;
    let at = 0;
    for (let i = 0; i < S.count; i++)
      for (let j = 0; j < H.count; j++) {
        const dx = (S.p[i * 3] ?? 0) - (H.p[j * 3] ?? 0);
        const dy = (S.p[i * 3 + 1] ?? 0) - (H.p[j * 3 + 1] ?? 0);
        const dz = (S.p[i * 3 + 2] ?? 0) - (H.p[j * 3 + 2] ?? 0);
        const d = dx * dx + dy * dy + dz * dz;
        if (d < approx) {
          approx = d;
          at = i;
        }
      }
    if (!Number.isFinite(approx)) continue;
    approx = Math.sqrt(approx);
    const p: Vec3 = [S.p[at * 3] ?? 0, S.p[at * 3 + 1] ?? 0, S.p[at * 3 + 2] ?? 0];
    const exact = probeOf(h).dist(p, approx + 1e-6);
    const d = Number.isFinite(exact) ? exact : approx;
    if (!best || d < best.d) best = { to: h, d };
  }
  return best;
}

export const span = (group: readonly Shell[]): { at: Vec3; size: number } => {
  const lo = [0, 1, 2].map((k) => Math.min(...group.map((s) => s.bounds.min[k] ?? 0)));
  const hi = [0, 1, 2].map((k) => Math.max(...group.map((s) => s.bounds.max[k] ?? 0)));
  return {
    at: [
      ((lo[0] ?? 0) + (hi[0] ?? 0)) / 2,
      ((lo[1] ?? 0) + (hi[1] ?? 0)) / 2,
      ((lo[2] ?? 0) + (hi[2] ?? 0)) / 2,
    ],
    size: Math.max(...[0, 1, 2].map((k) => (hi[k] ?? 0) - (lo[k] ?? 0))),
  };
};

export function clusterIssue(
  group: readonly Shell[],
  parts: readonly string[],
  island: boolean,
  near: { to: Shell; d: number } | null,
): ConnectIssue {
  const { at, size } = span(group);
  const first = group[0];
  const what =
    group.length === 1 && first
      ? `piece ${first.index} of '${first.part}'`
      : `${group.length} pieces of ${parts
          .slice(0, 4)
          .map((p) => `'${p}'`)
          .join(', ')}${parts.length > 4 ? ` +${parts.length - 4} parts` : ''}`;
  const thin = Math.min(...group.map(thickness));
  return island
    ? {
        code: 'T3D_CONNECT_ISLAND',
        severity: 'error',
        part: first?.part ?? '',
        at,
        radius: Math.min(size / 2, 0.3) + 0.02,
        message: `${what} (${cm(size)} across, at ${fmt(at)}) touch nothing that holds them${near ? ` — nearest is '${near.to.part}' ${cm(near.d)} away` : ''}`,
        fix: near
          ? `move or extend it ${cm(near.d)} into '${near.to.part}' (bury the root), or drop it — a merged mesh hides loose islands`
          : 'attach it to the body or remove it',
      }
    : {
        code: 'T3D_CONNECT_POINT',
        severity: 'error',
        part: first?.part ?? '',
        at,
        radius: Math.min(size / 2, 0.15) + 0.02,
        message: `${what} (at ${fmt(at)}) hang on by a point or an edge — every contact patch is below ${(STRONG_SHARE * 100).toFixed(0)}% of the piece's section`,
        fix: `seat it on a face: sink it ≥ ${cm(Math.max(0.003, thin / 4))} into what holds it, or declare connect: { as: 'rest' | 'hinge' } if a point or line contact is the design`,
      };
}
