// The palm's fronds beyond what the tree kind grows. `dryLowFronds` browns the lowest, oldest,
// most drooping leaflets (a coconut palm drops a frond a month; the lowest ring yellows first).
// `deadFrond` is one dead frond hanging down the stem under the crown, straw-brown, its leaflets
// collapsed against the rachis. `frondCards` is the far LOD: every LOD0 frond read back from the
// kind's leaflet mesh (26 leaflet pairs, 6 vertices each, per frond) and redrawn as one bent
// cutout card on the `foliage_palm` cell along its own rachis, root on the stem top, so LOD2 keeps
// the lacy, drooping crown's outline and colour instead of a few solid dark blades.

import {
  cellRect,
  dmath,
  type Mesh,
  MeshBuilder,
  merge,
  planar,
  sweep,
  type Vec2,
  type Vec3,
} from '@developerz.ai/ts23d';

const DRY: Vec3 = [0.42, 0.27, 0.09];
const DEAD: Vec3 = [0.52, 0.42, 0.27];

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const mid = (a: Vec3, b: Vec3): Vec3 => scale(add(a, b), 0.5);
const len = (a: Vec3): number => dmath.hypot(a[0], a[1], a[2]);

/** Leaflets below `zDry` (mesh frame) blend toward dry brown, fully by `zDry − depth`. */
export function dryLowFronds(leaves: Mesh, zDry: number, depth: number): Mesh {
  const colors = new Float32Array(leaves.colors);
  for (let i = 0; i < leaves.positions.length / 3; i++) {
    const z = leaves.positions[i * 3 + 2] ?? 0;
    const t = Math.min(1, Math.max(0, (zDry - z) / depth));
    const w = 0.95 * t * t * (3 - 2 * t);
    if (w <= 0) continue;
    for (let k = 0; k < 3; k++) {
      const c = colors[i * 3 + k] ?? 0;
      colors[i * 3 + k] = c + ((DRY[k] ?? 0) - c) * w;
    }
  }
  return { ...leaves, colors };
}

/**
 * A dead frond from `root` (inside the stem top) out `reach` metres along `yaw`, then hanging
 * `drop` metres down, its leaflets hanging from the rachis. `pairs` leaflet pairs (LOD-gated).
 * The rachis joins the kind's `branches`, the leaflets its `leaves` (cards rooted on a point).
 */
export function deadFrond(
  root: Vec3,
  yawDeg: number,
  reach: number,
  drop: number,
  pairs: number,
): { rachis: Mesh; leaflets: Mesh } {
  const a = (yawDeg * Math.PI) / 180;
  const out: Vec3 = [dmath.cos(a), dmath.sin(a), 0];
  const path: Vec3[] = [0, 0.25, 0.5, 0.75, 1].map((t) => [
    root[0] + out[0] * reach * dmath.sin((t * Math.PI) / 2),
    root[1] + out[1] * reach * dmath.sin((t * Math.PI) / 2),
    root[2] + 0.15 - drop * t * t,
  ]);
  const rachis = sweep({
    section: { radius: 1, segments: 4 },
    path,
    scale: [0.05, 0.04, 0.03, 0.022, 0.012],
    color: DEAD,
    strip: 'wood',
    caps: true,
  });
  const leaflets: Mesh[] = [];
  const side: Vec3 = [-out[1], out[0], 0];
  for (let i = 0; i < pairs; i++) {
    const t = 0.25 + (0.72 * (i + 0.5)) / pairs;
    const k = Math.min(3, Math.floor(t * 4));
    const p0 = path[k] ?? root;
    const p1 = path[k + 1] ?? p0;
    const f = t * 4 - k;
    const c = add(p0, scale(sub(p1, p0), f));
    const l = 1.1 * dmath.sin(Math.PI * (0.15 + 0.85 * t));
    const shade = 0.85 + (0.15 * ((i * 7) % 5)) / 4;
    for (const s of [1, -1]) {
      // Collapsed leaflets: hang almost straight down, splayed a little to either side.
      const tip: Vec3 = [c[0] + side[0] * s * l * 0.45, c[1] + side[1] * s * l * 0.45, c[2] - l];
      const w: Vec3 = scale(sub(p1, p0), 0.12 / Math.max(1e-6, len(sub(p1, p0))));
      leaflets.push(
        planar({
          points: [sub(c, w), add(c, w), tip],
          color: [DEAD[0] * shade, DEAD[1] * shade, DEAD[2] * shade],
          doubleSided: true,
        }),
      );
    }
  }
  return { rachis, leaflets: merge(leaflets) };
}

/** Leaflet-pair blocks of the kind's frond mesh: 6 vertices per leaflet, 2 per pair. */
const LEAFLET = 6;

interface Frond {
  /** Rachis points (midpoints of each leaflet pair's roots). */
  readonly spine: Vec3[];
  /** Leaflet tips either side, per spine point (the frond's drooping edges). */
  readonly left: Vec3[];
  readonly right: Vec3[];
  readonly color: Vec3;
}

function at(m: Mesh, i: number): Vec3 {
  return [m.positions[i * 3] ?? 0, m.positions[i * 3 + 1] ?? 0, m.positions[i * 3 + 2] ?? 0];
}

/** Read every frond back from the kind's LOD0 leaflets (`pairs` leaflet pairs per frond). */
export function frondsOf(leaves: Mesh, pairs: number): Frond[] {
  const perFrond = pairs * 2 * LEAFLET;
  const n = Math.floor(leaves.positions.length / 3 / perFrond);
  const out: Frond[] = [];
  for (let f = 0; f < n; f++) {
    const fr: Frond = { spine: [], left: [], right: [], color: [0, 0, 0] };
    const col: [number, number, number] = [0, 0, 0];
    for (let i = 0; i < pairs; i++) {
      const a = f * perFrond + i * 2 * LEAFLET;
      const b = a + LEAFLET;
      fr.spine.push(mid(at(leaves, a), at(leaves, b)));
      fr.left.push(at(leaves, a + 2));
      fr.right.push(at(leaves, b + 2));
      for (let k = 0; k < 3; k++) col[k] = (col[k] ?? 0) + (leaves.colors[(a + 2) * 3 + k] ?? 0);
    }
    out.push({ ...fr, color: [col[0] / pairs, col[1] / pairs, col[2] / pairs] });
  }
  return out;
}

/** Spine stations of a far frond card (fractions of its leaflet pairs). */
const STATIONS = [0.35, 0.75] as const;

/**
 * One bent, folded cutout card per frond (8 triangles): from `root` (the stem top) through
 * stations along its own rachis, each a V from the left leaflet tips up to the rachis and down to
 * the right tips (× `wide` about the rachis, following their droop), to the frond's tip. The fold
 * keeps the leaflet mass from the side and from above, where a flat strip between the drooping
 * tips shows edge-on as a bare midrib. The cell is painted green already, so the tint is the
 * frond's mean leaflet colour over the species `leaf` colour (its shade and browning), × `value`.
 * Single-sided: a cutout surface is double-sided.
 */
export function frondCards(
  fronds: readonly Frond[],
  root: Vec3,
  leaf: Vec3,
  value: number,
  wide: number,
): Mesh {
  const r = cellRect('foliage_palm');
  const mb = new MeshBuilder();
  const uv = (u: number, t: number): Vec2 => [
    r.u0 + 0.001 + u * (r.u1 - r.u0 - 0.002),
    r.v0 + 0.001 + t * (r.v1 - r.v0 - 0.002),
  ];
  for (const fr of fronds) {
    const n = fr.spine.length;
    const tip = fr.spine[n - 1] ?? root;
    const ratio = (k: 0 | 1 | 2): number =>
      Math.min(1, (fr.color[k] / Math.max(1e-3, leaf[k])) * value);
    const color: Vec3 = [ratio(0), ratio(1), ratio(2)];
    const along = sub(tip, root);
    const vert = (p: Vec3, across: Vec3, u: number, t: number): number => {
      const c: Vec3 = [
        across[1] * along[2] - across[2] * along[1],
        across[2] * along[0] - across[0] * along[2],
        across[0] * along[1] - across[1] * along[0],
      ];
      const l = len(c) || 1;
      return mb.vertex({ p, n: [c[0] / l, c[1] / l, c[2] / l], uv: uv(u, t), color });
    };
    const rows = STATIONS.map((f) => {
      const i = Math.min(n - 1, Math.round(f * (n - 1)));
      const s = fr.spine[i] ?? root;
      const lft = fr.left[i] ?? s;
      const rgt = fr.right[i] ?? s;
      const L = add(s, scale(sub(lft, s), wide));
      const R = add(s, scale(sub(rgt, s), wide));
      const across = sub(R, L);
      return [vert(L, across, 0, f), vert(s, across, 0.5, f), vert(R, across, 1, f)] as const;
    });
    const first = rows[0];
    const last = rows[rows.length - 1];
    if (!first || !last) continue;
    const across0 = sub(fr.right[0] ?? root, fr.left[0] ?? root);
    const r0 = vert(root, across0, 0.5, 0);
    const t1 = vert(tip, across0, 0.5, 1);
    mb.tri(r0, first[1], first[0]);
    mb.tri(r0, first[2], first[1]);
    for (let k = 0; k + 1 < rows.length; k++) {
      const [a, b, c] = rows[k] ?? first;
      const [d, e, f] = rows[k + 1] ?? last;
      mb.tri(a, b, e);
      mb.tri(a, e, d);
      mb.tri(b, c, f);
      mb.tri(b, f, e);
    }
    mb.tri(last[0], last[1], t1);
    mb.tri(last[1], last[2], t1);
  }
  return mb.build();
}
