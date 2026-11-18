// What the sweeps cannot say: the web between the arm bases, two rows of suckers per arm, papillae,
// and the eyes with their horizontal slit pupils. Each repeated piece is built once and stamped, then
// bound to the bones under it, so all of it follows the arms. LOD-gated: suckers thin out at LOD1 and
// LOD2 keeps only the web and plain eyes.

import {
  type BodyPlanDefinition,
  type BuildContext,
  hex,
  lathe,
  type Mesh,
  MeshBuilder,
  merge,
  type Vec3,
} from '@developerz.ai/ts23d';
import { ARM_IDS, ARMS, AXIS, armRadius, CROWN, NECK } from './anatomy.ts';
import { noise3, PAPILLA, SUCKER_CUP, SUCKER_RIM, WEB_TOP } from './skin.ts';
import { stamp } from './stamp.ts';

type Kit = Parameters<NonNullable<BodyPlanDefinition['detail']>>[2];

const WEB_REACH = 0.25;
/** Sucker radius as a share of the arm radius there. */
const SUCKER_SHARE = 0.46;
const SUCKER_ROW = 0.62;

const v = {
  add: (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  norm(a: Vec3): Vec3 {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
  cross: (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ],
  lerp: (a: Vec3, b: Vec3, t: number): Vec3 => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ],
};

/** The cup: stalk, raised rim, dished centre, on +Z from the skin. Radius 1. */
const suckerUnit = (segments: number): Mesh =>
  lathe({
    profile: [
      [1.06, -0.22],
      [1.0, 0.14],
      [0.9, 0.34],
      [0.68, 0.36],
      [0.44, 0.16],
      [0.18, 0.05],
      [0, 0.03],
    ],
    segments,
    color: SUCKER_RIM,
    creaseDeg: 70,
  });

/** Dark inside the rim: colour by profile radius. */
function tintCup(m: Mesh): Mesh {
  const colors = m.colors.slice();
  for (let i = 0; i < m.positions.length / 3; i++) {
    const r = Math.hypot(m.positions[i * 3] ?? 0, m.positions[i * 3 + 1] ?? 0);
    const c = r < 0.62 ? SUCKER_CUP : SUCKER_RIM;
    colors.set(c, i * 3);
  }
  return { ...m, colors };
}

/** Oral side of the arm: the angle of the section facing away from `bend`, either side of it. */
function suckers(kit: Kit, lod: number): Mesh | null {
  if (lod >= 2) return null;
  const unit = tintCup(suckerUnit(lod === 0 ? 11 : 6));
  const reach = lod === 0 ? 0.985 : 0.55;
  const pieces: Mesh[] = [];
  ARM_IDS.forEach((id, k) => {
    const out: Mesh[] = [];
    const length = k === 0 || k === ARMS - 1 ? 0.86 : 0.9;
    let s = 0.03;
    let row = 0;
    while (s / length < reach) {
      const u = s / length;
      const r = armRadius(u);
      // The largest suckers sit a little out from the base, as on the real arm.
      const size = SUCKER_SHARE * r * (0.72 + 0.34 * Math.min(1, u / 0.14));
      const side = row % 2 === 0 ? 1 : -1;
      const q = kit.surface(id, u, Math.PI + side * SUCKER_ROW);
      out.push(stamp(unit, v.sub(q.p, v.mul(q.n, size * 0.05)), q.n, size, row * 0.7));
      s += size * (lod === 0 ? 1.18 : 2.6);
      row++;
    }
    pieces.push(kit.bindPieces(merge(out), [id]));
  });
  return merge(pieces);
}

/** One web sector between two neighbouring arms, a double skin closed along its free edge. */
function webSector(
  kit: Kit,
  a: string,
  b: string,
  rows: number,
  cols: number,
  flat: boolean,
): Mesh {
  const tb = new MeshBuilder();
  const reachOf = (id: string): number =>
    id === ARM_IDS[0] || id === ARM_IDS[ARMS - 1] ? 0.86 : 0.9;
  const sideOf = (id: string, other: string, u: number): number => {
    const toOther = v.sub(kit.surface(other, u, 0).p, kit.surface(id, u, 0).p);
    const plus = kit.surface(id, u, Math.PI / 2).n;
    // The membrane leaves the arm below its side, toward the sucker face.
    return v.dot(plus, toOther) > 0 ? Math.PI / 2 + 0.55 : (3 * Math.PI) / 2 - 0.55;
  };
  const point = (w: number, t: number): Vec3 => {
    const edge = WEB_REACH * (1 - 0.34 * Math.sin(Math.PI * t) ** 0.8);
    const dist = 0.018 + w * (edge * reachOf(a) - 0.018);
    const [ua, ub] = [dist / reachOf(a), dist / reachOf(b)];
    const pa = kit.surface(a, ua, sideOf(a, b, ua)).p;
    const pb = kit.surface(b, ub, sideOf(b, a, ub)).p;
    const m = v.lerp(pa, pb, t);
    // The membrane hangs a little between the arms.
    return [m[0], m[1], m[2] - 0.012 * w * Math.sin(Math.PI * t)];
  };
  const grid: Vec3[][] = [];
  for (let i = 0; i <= rows; i++) {
    const row: Vec3[] = [];
    for (let j = 0; j <= cols; j++) row.push(point(i / rows, j / cols));
    grid.push(row);
  }
  const rawNormal = (i: number, j: number): Vec3 => {
    const p = (r: number, c: number): Vec3 =>
      grid[Math.max(0, Math.min(rows, r))]?.[Math.max(0, Math.min(cols, c))] ?? [0, 0, 0];
    return v.norm(v.cross(v.sub(p(i, j + 1), p(i, j - 1)), v.sub(p(i + 1, j), p(i - 1, j))));
  };
  // One sign for the whole sector, so the two layers never swap across a steep fold.
  const sign = rawNormal(Math.round(rows / 2), Math.round(cols / 2))[2] < 0 ? -1 : 1;
  const normalAt = (i: number, j: number): Vec3 => v.mul(rawNormal(i, j), sign);
  const skinAt = (p: Vec3, up: boolean, w: number): Vec3 => {
    const m = noise3([p[0] * 40, p[1] * 40, p[2] * 40]);
    const top: Vec3 = v.lerp(WEB_TOP, [0.42, 0.24, 0.17], m * 0.6);
    return up ? top : v.lerp([0.62, 0.42, 0.36], top, 0.25 + 0.3 * (1 - w));
  };
  const thick = 0.0016;
  const layer = (up: boolean): number[][] =>
    grid.map((row, i) =>
      row.map((p, j) => {
        const n = normalAt(i, j);
        const s = up ? 1 : -1;
        return tb.vertex({
          p: v.add(p, v.mul(n, thick * s)),
          n: v.mul(n, s),
          uv: [0, 0],
          color: skinAt(p, up, i / rows),
        });
      }),
    );
  const [top, under] = [layer(true), layer(false)];
  const posOf = new Map<number, Vec3>();
  const noteLayer = (ids: number[][], up: boolean): void => {
    ids.forEach((row, i) => {
      row.forEach((id, j) => {
        const p = grid[i]?.[j] ?? [0, 0, 0];
        posOf.set(id, v.add(p, v.mul(normalAt(i, j), up ? thick : -thick)));
      });
    });
  };
  noteLayer(top, true);
  noteLayer(under, false);
  const normalOf = new Map<number, Vec3>();
  top.forEach((row, i) => {
    row.forEach((id, j) => {
      normalOf.set(id, normalAt(i, j));
    });
  });
  under.forEach((row, i) => {
    row.forEach((id, j) => {
      normalOf.set(id, v.mul(normalAt(i, j), -1));
    });
  });
  /** One triangle wound to agree with its first vertex's normal; `flat` gives it its own facet. */
  const face = (p: number, q: number, r: number): void => {
    const [a, b, c] = [posOf.get(p), posOf.get(q), posOf.get(r)];
    const n = normalOf.get(p);
    if (!a || !b || !c || !n) return;
    const m = v.cross(v.sub(b, a), v.sub(c, a));
    const keep = v.dot(m, n) >= 0;
    if (!flat) {
      if (keep) tb.tri(p, q, r);
      else tb.tri(p, r, q);
      return;
    }
    const f = v.norm(keep ? m : v.mul(m, -1));
    const color = skinAt(a, v.dot(n, normalAt(0, 0)) > 0, 0.5);
    const [x, y, z] = [a, keep ? b : c, keep ? c : b].map((pos) =>
      tb.vertex({ p: pos, n: f, uv: [0, 0], color }),
    );
    tb.tri(x ?? 0, y ?? 0, z ?? 0);
  };
  const quad = (p: number, q: number, r: number, s: number): void => {
    face(p, q, r);
    face(p, r, s);
  };
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      const [t, d] = [top[i] ?? [], top[i + 1] ?? []];
      quad(t[j] ?? 0, d[j] ?? 0, d[j + 1] ?? 0, t[j + 1] ?? 0);
      const [e, f] = [under[i] ?? [], under[i + 1] ?? []];
      quad(e[j] ?? 0, e[j + 1] ?? 0, f[j + 1] ?? 0, f[j] ?? 0);
    }
  const [lastTop, lastUnder] = [top[rows] ?? [], under[rows] ?? []];
  for (let j = 0; j < cols; j++)
    quad(lastTop[j] ?? 0, lastUnder[j] ?? 0, lastUnder[j + 1] ?? 0, lastTop[j + 1] ?? 0);
  return tb.build();
}

function web(kit: Kit, lod: number): Mesh {
  const [rows, cols] = [
    [9, 16],
    [4, 8],
    [2, 3],
  ][lod] ?? [2, 3];
  const out = ARM_IDS.map((id, k) => {
    const next = ARM_IDS[(k + 1) % ARMS] ?? id;
    const sector = webSector(kit, id, next, rows ?? 2, cols ?? 3, lod > 0);
    return kit.bindSmooth(sector, [id, next], 0.03);
  });
  return merge(out);
}

/** Papillae: little cones on the mantle, head and arm bases, scattered by a noise test. */
function papillae(kit: Kit, ctx: BuildContext): Mesh | null {
  if (ctx.lod !== 0) return null;
  const rng = ctx.rng.fork('papillae');
  const cone = lathe({
    profile: [
      [1, -0.2],
      [0.72, 0.42],
      [0.3, 0.95],
      [0, 1.15],
    ],
    segments: 6,
    color: PAPILLA,
  });
  const out: Mesh[] = [];
  const scatter = (id: string, n: number, umin: number, umax: number, size: number): void => {
    const here: Mesh[] = [];
    for (let i = 0; i < n; i++) {
      const u = rng.range(umin, umax);
      const q = kit.surface(id, u, rng.range(0, Math.PI * 2));
      const s = size * rng.range(0.55, 1.35);
      here.push(stamp(cone, q.p, q.n, s, rng.range(0, 6)));
    }
    if (here.length > 0) out.push(kit.bindPieces(merge(here), [id]));
  };
  scatter('mantle', 260, 0.08, 0.9, 0.0042);
  scatter('head', 40, 0.1, 0.9, 0.0032);
  for (const id of ARM_IDS) scatter(id, 22, 0.02, 0.3, 0.0024);
  return merge(out);
}

/** A sphere that keeps a clean horizontal band of latitude rings, poles on its look axis. */
function eyeball(segments: number, rings: number, iris: Vec3): Mesh {
  const b = new MeshBuilder();
  const rim: number[][] = [];
  for (let i = 0; i <= rings; i++) {
    const a = (i / rings) * Math.PI;
    const row: number[] = [];
    for (let j = 0; j <= segments; j++) {
      const t = (j / segments) * Math.PI * 2;
      const n: Vec3 = [Math.sin(a) * Math.cos(t), Math.sin(a) * Math.sin(t), Math.cos(a)];
      const iriss = Math.min(1, a / 0.95);
      const c = v.lerp(v.lerp(iris, hex('#7a5c2a'), iriss ** 2), hex('#1c120e'), iriss ** 4);
      row.push(b.vertex({ p: n, n, uv: [0, 0], color: c }));
    }
    rim.push(row);
  }
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < segments; j++) {
      const [p, q] = [rim[i] ?? [], rim[i + 1] ?? []];
      if (i > 0) b.tri(p[j] ?? 0, q[j + 1] ?? 0, p[j + 1] ?? 0);
      if (i < rings - 1) b.tri(p[j] ?? 0, q[j] ?? 0, q[j + 1] ?? 0);
    }
  return b.build();
}

/** The horizontal slit pupil: a dark lens-shaped patch lying just on the cornea, local XY plane. */
function slitPupil(segments: number): Mesh {
  const b = new MeshBuilder();
  const black: Vec3 = [0.008, 0.007, 0.009];
  const n: Vec3 = [0, 0, 1];
  // Concentric rings, so the patch follows the curve of the cornea instead of cutting through it.
  const onCornea = (x: number, y: number): Vec3 => [
    x,
    y,
    Math.sqrt(Math.max(0, 1.05 - x * x - y * y)),
  ];
  const c = b.vertex({ p: onCornea(0, 0), n, uv: [0, 0], color: black });
  const rings = [0.35, 0.7, 1].map((k) =>
    Array.from({ length: segments + 1 }, (_, i) => {
      const t = (i / segments) * Math.PI * 2;
      // A rounded bar: wide along X, narrow along Y.
      const x = 0.7 * k * Math.sign(Math.cos(t)) * Math.abs(Math.cos(t)) ** 0.6;
      const y = 0.2 * k * Math.sign(Math.sin(t)) * Math.abs(Math.sin(t)) ** 0.75;
      return b.vertex({ p: onCornea(x, y), n, uv: [0, 0], color: black });
    }),
  );
  const first = rings[0] ?? [];
  for (let i = 0; i < segments; i++) b.tri(c, first[i] ?? 0, first[i + 1] ?? 0);
  rings.slice(1).forEach((row, r) => {
    const inner = rings[r] ?? [];
    for (let i = 0; i < segments; i++) {
      b.tri(inner[i] ?? 0, row[i] ?? 0, row[i + 1] ?? 0);
      b.tri(inner[i] ?? 0, row[i + 1] ?? 0, inner[i + 1] ?? 0);
    }
  });
  return b.build();
}

/** A soft lid ring round the eye: skin colour, seated on the head. */
const lidRing = (segments: number, color: Vec3): Mesh =>
  lathe({
    profile: [
      [1.2, -0.6],
      [1.16, -0.2],
      [1.04, 0.14],
      [0.9, 0.3],
      [0.8, 0.34],
    ],
    segments,
    color,
  });

export const EYE_RADIUS = 0.0235;

/** Eye centre, on the side of the head and a little toward the crown from the neck. */
export function eyeFrame(side: 1 | -1): { at: Vec3; look: Vec3 } {
  const mid = v.lerp(CROWN, NECK, 0.52);
  const look = v.norm([0.34, side * 0.86, 0.38]);
  const lift = v.mul(AXIS, 0.008);
  return { at: v.add(v.add(mid, lift), v.mul(look, 0.0635)), look };
}

function eyes(kit: Kit, lod: number): Mesh {
  const iris = hex('#c9a24a');
  const skin = hex('#6a3d2c');
  const [seg, rings, lidSeg] = [
    [36, 22, 28],
    [18, 10, 14],
    [9, 5, 7],
  ][lod] ?? [9, 5, 7];
  const ball = eyeball(seg ?? 9, rings ?? 5, iris);
  const pupil = slitPupil(lod === 0 ? 28 : 12);
  const lid = lidRing(lidSeg ?? 7, skin);
  const parts: Mesh[] = [];
  for (const side of [1, -1] as const) {
    const { at, look } = eyeFrame(side);
    // Spin the local frame so the slit's long axis lies level in the world.
    const level = v.norm(v.cross([0, 0, 1], look));
    const ref: Vec3 = Math.abs(look[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
    const x0 = v.norm(v.cross(ref, look));
    const y0 = v.cross(look, x0);
    const spin = Math.atan2(v.dot(level, y0), v.dot(level, x0));
    parts.push(stamp(ball, at, look, EYE_RADIUS));
    parts.push(stamp(pupil, at, look, EYE_RADIUS, spin));
    parts.push(stamp(lid, at, look, EYE_RADIUS));
  }
  return kit.bindBone(merge(parts), 'head_0');
}

export function octopusDetail(ctx: BuildContext, kit: Kit): void {
  ctx.part('web', web(kit, ctx.lod), { paint: 'skin' });
  ctx.part('eyes', eyes(kit, ctx.lod));
  const s = suckers(kit, ctx.lod);
  if (s) ctx.part('suckers', s, { paint: 'skin' });
  const p = papillae(kit, ctx);
  if (p) ctx.part('papillae', p, { paint: 'skin' });
}
