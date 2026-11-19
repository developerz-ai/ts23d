// The coconut palm's stem, rebuilt from the tree kind's trunk: the kind sweeps it with a ring every
// ~1.7 m, too coarse for what makes a palm stem read — the leaf scars, a ring every 0.1–0.3 m where
// each fallen frond's base wrapped the stem. `ringedStem` reads the kind's ring centres, radii and
// bark tint back (8 radial segments + seam per ring, then two caps), resamples the axis densely
// and cuts a shallow groove at every scar (inward only, so the trunk's width — the DBH measure —
// is unchanged), the groove darker, the band between paler and greyer low down where the stem has
// weathered. `boots` is the crown shaft: the fibrous frond bases (boots) wrapping the stem top.

import { type Mesh, merge, sweep, type Vec3 } from '@developerz.ai/ts23d';

/** The kind's trunk sweep: 8 radial segments (+1 seam vertex) per ring. */
const S0 = 8;

interface Ring {
  readonly c: Vec3;
  readonly r: number;
  readonly col: Vec3;
}

export function rings(m: Mesh): Ring[] {
  const per = S0 + 1;
  const P = Math.floor((m.positions.length / 3 - 2 * (S0 + 1)) / per);
  const out: Ring[] = [];
  for (let i = 0; i < P; i++) {
    const c: [number, number, number] = [0, 0, 0];
    const col: [number, number, number] = [0, 0, 0];
    for (let j = 0; j < S0; j++) {
      const v = (i * per + j) * 3;
      for (let k = 0; k < 3; k++) {
        c[k] = (c[k] ?? 0) + (m.positions[v + k] ?? 0) / S0;
        col[k] = (col[k] ?? 0) + (m.colors[v + k] ?? 0) / S0;
      }
    }
    let r = 0;
    for (let j = 0; j < S0; j++) {
      const v = (i * per + j) * 3;
      r += Math.hypot((m.positions[v] ?? 0) - c[0], (m.positions[v + 1] ?? 0) - c[1]) / S0;
    }
    out.push({ c, r, col });
  }
  return out;
}

function spanY(m: Mesh): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 1; i < m.positions.length; i += 3) {
    lo = Math.min(lo, m.positions[i] ?? 0);
    hi = Math.max(hi, m.positions[i] ?? 0);
  }
  return hi - lo;
}

/** Point, radius and colour at arc length `s` along the ring centres. */
function along(rs: readonly Ring[], arc: readonly number[], s: number): Ring {
  let j = 0;
  while (j < rs.length - 2 && (arc[j + 1] ?? 0) < s) j++;
  const a = rs[j];
  const b = rs[j + 1] ?? a;
  if (!a || !b) return { c: [0, 0, 0], r: 0.1, col: [1, 1, 1] };
  const t = Math.min(
    1,
    Math.max(0, (s - (arc[j] ?? 0)) / ((arc[j + 1] ?? 1) - (arc[j] ?? 0) || 1)),
  );
  const mix = (x: Vec3, y: Vec3): Vec3 => [
    x[0] + (y[0] - x[0]) * t,
    x[1] + (y[1] - x[1]) * t,
    x[2] + (y[2] - x[2]) * t,
  ];
  return { c: mix(a.c, b.c), r: a.r + (b.r - a.r) * t, col: mix(a.col, b.col) };
}

export interface RingedOptions {
  /** Scar spacing along the stem, m. */
  readonly spacing: number;
  /** Groove depth as a share of the radius (0 = colour bands only). */
  readonly groove: number;
  readonly segments: number;
}

/** The kind's trunk, resampled with a leaf-scar ring every `spacing` metres (on `wood`). */
export function ringedStem(kindTrunk: Mesh, o: RingedOptions): Mesh {
  const rs = rings(kindTrunk);
  const arc: number[] = [0];
  for (let i = 1; i < rs.length; i++) {
    const a = rs[i - 1]?.c ?? [0, 0, 0];
    const b = rs[i]?.c ?? a;
    arc.push((arc[i - 1] ?? 0) + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  }
  const total = arc[arc.length - 1] ?? 0;
  const half = o.spacing / 2;
  const n = Math.max(2, Math.round(total / half));
  const path: Vec3[] = [];
  const scale: number[] = [];
  const tint: Vec3[] = [];
  for (let k = 0; k <= n; k++) {
    const s = (total * k) / n;
    const q = along(rs, arc, s);
    const scar = k % 2 === 1 && k < n;
    path.push(q.c);
    scale.push(q.r * (scar ? 1 - o.groove : 1));
    // Grey, weathered low; the band between scars pale, the scar itself dark.
    const low = Math.max(0, 1 - q.c[2] / 9);
    const grey = 0.6 * low;
    const v = scar ? 0.42 : 1.12;
    const g = (q.col[0] + q.col[1] + q.col[2]) / 3;
    tint.push([
      (q.col[0] + (g - q.col[0]) * grey) * v,
      (q.col[1] + (g - q.col[1]) * grey) * v,
      (q.col[2] + (g - q.col[2]) * grey) * v,
    ]);
  }
  const build = (k: number): Mesh =>
    sweep({
      section: { radius: 1, segments: o.segments },
      path,
      scale: scale.map((r) => r * k),
      color: [1, 1, 1],
      strip: 'wood',
      caps: true,
    });
  // The sweep's frames turn the section, so its vertices need not sit on ±Y as the kind's do:
  // rescale once so the stem keeps the kind's Y extent (the DBH measure).
  const first = build(1);
  const m = build(spanY(kindTrunk) / Math.max(1e-6, spanY(first)));
  // Colour per ring (rings come first, S + 1 vertices each); cap vertices by the nearest height.
  const per = o.segments + 1;
  const colors = new Float32Array(m.colors);
  for (let i = 0; i < m.positions.length / 3; i++) {
    let ring = Math.floor(i / per);
    if (ring >= path.length) {
      const z = m.positions[i * 3 + 2] ?? 0;
      ring = Math.abs(z - (path[0]?.[2] ?? 0)) < Math.abs(z - (path[n]?.[2] ?? 0)) ? 0 : n;
    }
    colors.set(tint[ring] ?? [1, 1, 1], i * 3);
  }
  return { ...m, colors };
}

/**
 * The crown shaft: overlapping fibrous frond bases wrapping the top `height` metres of the stem,
 * flaring to `flare` × the stem radius (kept inside the stem's widest point by the caller).
 */
export function boots(kindTrunk: Mesh, height: number, flare: number, lod: number): Mesh {
  const rs = rings(kindTrunk);
  const top = rs[rs.length - 1];
  const below = rs[rs.length - 2] ?? top;
  if (!top || !below) return merge([]);
  const dz = Math.max(0.1, top.c[2] - below.c[2]);
  const at = (z: number): Vec3 => {
    const t = (z - top.c[2]) / dz;
    return [top.c[0] + (top.c[0] - below.c[0]) * t, top.c[1] + (top.c[1] - below.c[1]) * t, z];
  };
  const out: Mesh[] = [];
  const tiers = lod === 0 ? 4 : 2;
  for (let k = 0; k < tiers; k++) {
    // Each tier a sheath from inside the stem flaring out and up, offset round the stem.
    const z0 = top.c[2] - height + (height * k) / tiers;
    const z1 = z0 + (height / tiers) * 1.6;
    const r = top.r * (flare - 0.08 * (tiers - 1 - k));
    out.push(
      sweep({
        section: { radius: 1, segments: lod === 0 ? 8 : 6 },
        path: [at(z0), at((z0 + z1) / 2), at(z1)],
        scale: [top.r * 0.9, r, r * 0.92],
        twist: 22 * k,
        color: [0.46, 0.36, 0.25],
        strip: 'wood',
        caps: 'end',
      }),
    );
  }
  return merge(out);
}
