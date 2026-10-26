// Eiffel Tower (Paris, 1889; 330 m with the 2022 DAB antenna). Real: 124.9 × 124.9 × 330 m.
// Skyline from the operator's 29-panel table (Weidman & Pinelis 2004), arbalétrier layout and arch
// from Eiffel's 1887 plate PL. I. Every number and its URL: refs/eiffel_tower.md.
//
// Structure: four legs of four box uprights (panels 1–11), eight uprights on the outer ring
// (12–17), four corner uprights (18–29). Every face panel is a St Andrew's cross plus a horizontal;
// at LOD0 each of those members is itself a lattice girder (two chords + zig-zag web).
//
// QA design: the four `leg_*` parts carry the whole lattice of their quadrant from the ground to
// the 3rd floor, so they are grounded directly; platforms hang off cheap parts (arches, belts, lift
// rails) through coplanar faces, so the contact gate never has to grid the 100k-triangle lattice.

import {
  add,
  applyAffine,
  type BuildContext,
  beam,
  box,
  cross,
  defineAsset,
  dot,
  frame,
  grime,
  hex,
  type Lod,
  lathe,
  type Mesh,
  MeshBuilder,
  merge,
  normalize,
  place,
  scale,
  sub,
  type Vec2,
  type Vec3,
} from '@developerz-ai/ts23d';

// ── Colour: three graduated shades of Eiffel Tower Brown, darkest at the bottom ──────────────────
const SHADES = [hex('#5e4834'), hex('#715a40'), hex('#87704f')] as const;
const IRON: Vec3 = [1, 1, 1]; // tint; `paint` multiplies by the shade at the vertex height
const IRON_DARK: Vec3 = [0.75, 0.75, 0.75];
const STONE = hex('#a3967e');
const GLASS = hex('#5d7380');
const GREY = hex('#9b9b97');
const WHITE = hex('#dcdcd6');
const RED = hex('#a8382c');

// ── Profile: (x down from the top of panel 29, half width w), SNTE via Weidman & Pinelis Table 1 ─
const PROFILE: readonly Vec2[] = [
  [0, 5],
  [11.28, 5],
  [17.113, 5.284],
  [23.278, 5.585],
  [29.795, 5.903],
  [36.683, 6.239],
  [43.963, 6.594],
  [51.658, 6.969],
  [59.791, 7.365],
  [68.387, 7.784],
  [77.473, 8.227],
  [87.076, 8.696],
  [97.076, 9.245],
  [107.076, 9.999],
  [117.576, 10.79],
  [128.076, 11.786],
  [138.676, 12.88],
  [149.376, 14.303],
  [160.676, 15.806],
  [165.576, 16.925],
  [175.576, 19.21],
  [185.776, 21.583],
  [196.776, 24.365],
  [207.776, 27.415],
  [218.776, 30.919],
  [225.776, 33.697],
  [236.776, 38.637],
  [247.776, 43.578],
  [258.776, 48.519],
  [269.776, 53.459],
];
const TOP = 269.776;
/** The table's ground half width is 53.459 m; the official footprint is 124.90 m (dossier). */
const K = 62.45 / 53.459;
/** Z[p] = top of panel p (Z[0] = ground). */
const Z: readonly number[] = PROFILE.map(([x]) => TOP - x).reverse();
const lv = (p: number): number => Z[p] ?? 0;
const Z11 = lv(11);
const Z17 = lv(17);
const Z29 = lv(29);

const DECK1 = 57.63;
const DECK2 = 115.73;
const DECK3 = 276.13;
const SLAB = 0.6;
const SIDE1 = 70.69 / 2;
const SIDE2 = 40.96 / 2;
const SIDE3 = 18.65 / 2;
const TERRACE = 279.11;
const LEG0 = 25.335; // leg plan width at the ground, plate PL. I "25m339"
const ARCH = { r: 37.16, cz: 1.74, depth: 2.2, w: 0.6 }; // through the leg feet + keystone 38.90 m
const BELT1 = 35.0; // plane of the 1st-floor belt and the arches
const BELT2 = 17.0;
const OVER = 0.05; // members overlap their joints
const LANTERN_Z = 286.3;
const LANTERN_TOP = LANTERN_Z + 14.2; // upper terrace, plate PL. I: 334.015 − 33.50 = 300.5 m

function halfW(z: number): number {
  const x = TOP - Math.min(Math.max(z, 0), TOP);
  for (let i = 0; i + 1 < PROFILE.length; i++) {
    const [x0, w0] = PROFILE[i] ?? [0, 0];
    const [x1, w1] = PROFILE[i + 1] ?? [0, 0];
    if (x <= x1) return K * (w0 + ((w1 - w0) * (x - x0)) / (x1 - x0 || 1));
  }
  return K * 53.459;
}
const legWidth = (z: number): number => LEG0 + ((0.6 * halfW(Z11) - LEG0) * z) / Z11;
const innerRaw = (z: number): number => (z <= Z11 ? halfW(z) - legWidth(z) : 0.4 * halfW(z));
const uw = (z: number): number => 1.4 - (0.7 * Math.min(z, TOP)) / TOP;
const outer = (z: number): number => halfW(z) - uw(z) / 2;
const inner = (z: number): number => innerRaw(z) + uw(z) / 2;

const QUAD: readonly Vec2[] = [
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
];

// ── Members ─────────────────────────────────────────────────────────────────────────────────────
const dist = (a: Vec3, b: Vec3): number => Math.hypot(...sub(b, a));
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

function rod(out: Mesh[], a: Vec3, b: Vec3, width: number, color: Vec3 = IRON): void {
  const d = normalize(sub(b, a));
  out.push(beam({ from: sub(a, scale(d, OVER)), to: add(b, scale(d, OVER)), width, color }));
}

/** A box upright whose faces stay parallel to the tower faces (beam would roll it 45°). */
function post(out: Mesh[], a: Vec3, b: Vec3, width: number): void {
  const d = normalize(sub(b, a));
  const x: Vec3 = [1, 0, 0];
  const u = normalize(sub(x, scale(d, dot(x, d))));
  const len = dist(a, b) + 2 * OVER;
  const m = box({ size: [width, width, len], color: IRON });
  out.push(applyAffine(m, frame(u, cross(d, u), d, sub(a, scale(d, OVER)))));
}

/** Lattice girder a→b: two chords `depth` apart in the plane ⟂ n, zig-zag web between. */
function girder(out: Mesh[], a: Vec3, b: Vec3, n: Vec3, depth: number): void {
  const len = dist(a, b);
  const dir = normalize(sub(b, a));
  const d = normalize(cross(n, dir));
  const at = (t: number, s: number): Vec3 =>
    add(add(a, scale(dir, len * t)), scale(d, s * depth * 0.5));
  const cw = Math.max(0.14, depth * 0.2);
  rod(out, at(0, 1), at(1, 1), cw);
  rod(out, at(0, -1), at(1, -1), cw);
  const k = Math.max(2, Math.round(len / (depth * 1.6)));
  for (let i = 0; i < k; i++) {
    const s = i % 2 === 0 ? 1 : -1;
    rod(out, at(i / k, s), at((i + 1) / k, -s), Math.max(0.07, depth * 0.09));
  }
}

/** A member at this LOD: lattice girder at LOD0, a plain bar at LOD1. */
function member(out: Mesh[], a: Vec3, b: Vec3, n: Vec3, depth: number, lod: Lod): void {
  // Below ~0.5 m deep a lattice is sub-pixel even up close: a plain bar reads the same.
  if (lod === 0 && depth >= 0.5) girder(out, a, b, n, depth);
  else rod(out, a, b, Math.max(0.3, depth * 0.5));
}

type Line = (z: number) => Vec3;
const line =
  (sx: number, sy: number, fx: (z: number) => number, fy: (z: number) => number): Line =>
  (z) => [sx * fx(z), sy * fy(z), z];

/** One face between two upright lines: a St Andrew's cross per panel + horizontals. */
function face(
  out: Mesh[],
  l1: Line,
  l2: Line,
  levels: readonly number[],
  lod: Lod,
  base: boolean,
): void {
  for (let k = 0; k + 1 < levels.length; k++) {
    const [z0, z1] = [levels[k] ?? 0, levels[k + 1] ?? 0];
    const [bl, br, tl, tr] = [l1(z0), l2(z0), l1(z1), l2(z1)];
    const n = normalize(cross(sub(br, bl), sub(tl, bl)));
    const dd = clamp(dist(bl, tr) * 0.04, 0.3, 1.1);
    member(out, bl, tr, n, dd, lod);
    member(out, br, tl, n, dd, lod);
    const hd = clamp(dist(tl, tr) * 0.05, 0.3, 1.2);
    if (lod === 0 || k % 2 === 1 || k === levels.length - 2) member(out, tl, tr, n, hd, lod);
    if (k === 0 && base) member(out, bl, br, n, hd, lod);
  }
}

function uprights(out: Mesh[], l: Line, levels: readonly number[]): void {
  for (let k = 0; k + 1 < levels.length; k++) {
    const [z0, z1] = [levels[k] ?? 0, levels[k + 1] ?? 0];
    post(out, l(z0), l(z1), uw((z0 + z1) / 2));
  }
}

// ── Recolour by height, then grime the feet ─────────────────────────────────────────────────────
const smooth = (t: number): number => {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};
function shade(z: number): Vec3 {
  const [a, b, c] = SHADES;
  const t1 = smooth((z - 50) / 14);
  const t2 = smooth((z - 112) / 14);
  return [0, 1, 2].map((k) => {
    const lo = (a[k] ?? 0) + ((b[k] ?? 0) - (a[k] ?? 0)) * t1;
    return lo + ((c[k] ?? 0) - lo) * t2;
  }) as unknown as Vec3;
}
function iron(meshes: readonly Mesh[], dirt = false): Mesh {
  const m = merge(meshes);
  const colors = new Float32Array(m.colors);
  for (let i = 0; i < m.positions.length / 3; i++) {
    const s = shade(m.positions[i * 3 + 2] ?? 0);
    for (let k = 0; k < 3; k++) colors[i * 3 + k] = (colors[i * 3 + k] ?? 1) * (s[k] ?? 0);
  }
  const painted = { ...m, colors };
  return dirt ? grime(painted, { ground: 9, groundStrength: 0.35 }) : painted;
}
const ring4 = (m: Mesh): Mesh[] => [0, 1, 2, 3].map((q) => place(m, { yaw: (q * Math.PI) / 2 }));

// ── Legs: the whole lattice of one quadrant, ground → 3rd floor ─────────────────────────────────
const LEVELS_A = Z.slice(0, 12);
const LEVELS_B = Z.slice(11, 18);
const LEVELS_C = [...Z.slice(17, 30), DECK3 - SLAB];

function leg(q: number, lod: Lod): Mesh {
  const [sx, sy] = QUAD[q] ?? [1, 1];
  const out: Mesh[] = [];
  const c = line(sx, sy, outer, outer);
  const bx = line(sx, sy, outer, inner);
  const by = line(sx, sy, inner, outer);
  const a = line(sx, sy, inner, inner);
  // Panels 1–11: four arbalétriers, four braced faces.
  for (const l of [c, bx, by]) uprights(out, l, [...LEVELS_A, ...LEVELS_B.slice(1)]);
  uprights(out, c, LEVELS_C);
  uprights(out, a, LEVELS_A);
  for (const [l1, l2] of [
    [c, bx],
    [c, by],
    [by, a],
    [bx, a],
  ] as const)
    face(out, l1, l2, LEVELS_A, lod, false);
  if (lod === 0) {
    // Plan diaphragms every other level inside the leg.
    for (let p = 2; p <= 10; p += 2) {
      const z = lv(p);
      girder(out, c(z), a(z), [0, 0, 1], 0.8);
      girder(out, bx(z), by(z), [0, 0, 1], 0.8);
    }
  }
  // Panels 12–17: the outer faces of the L plus this leg's share of the middle bays.
  face(out, c, bx, LEVELS_B, lod, false);
  face(out, c, by, LEVELS_B, lod, false);
  const even = q % 2 === 0;
  const mid1 = even ? bx : by;
  const mid2 = even ? line(sx, -sy, outer, inner) : line(-sx, sy, inner, outer);
  face(out, mid1, mid2, LEVELS_B, lod, true);
  // Panels 18–29 + the 3rd-floor stool: one face of the shaft per leg.
  const c2 = even ? line(sx, -sy, outer, outer) : line(-sx, sy, outer, outer);
  face(out, c, c2, LEVELS_C, lod, false);
  // Intermediate belt (plancher intermédiaire, 195.4 m).
  const zb = 194.2;
  const nb = normalize(cross(sub(c2(zb), c(zb)), [0, 0, 1]));
  member(out, c(zb), c2(zb), cross(nb, normalize(sub(c2(zb), c(zb)))), 3.4, lod);
  // Consoles under the 3rd floor.
  const zt = DECK3 - SLAB;
  const edge = (t: number, z: number): Vec3 => {
    const p = add(scale(c(z), 1 - t), scale(c2(z), t));
    const r = SIDE3 - 0.25;
    return even
      ? [sx * r, p[1] * (r / Math.max(outer(z), 1e-3)), z]
      : [p[0] * (r / Math.max(outer(z), 1e-3)), sy * r, z];
  };
  for (const t of lod === 0 ? [0, 0.25, 0.5, 0.75, 1] : [0, 0.5, 1]) {
    const foot = add(scale(c(lv(28)), 1 - t), scale(c2(lv(28)), t));
    rod(out, foot, edge(t, zt - 0.2), 0.35);
  }
  rod(out, edge(0, zt - 0.2), edge(1, zt - 0.2), 0.4);
  return iron(out, true);
}

// ── Arches (Sauvestre) between the legs, in the belt plane ──────────────────────────────────────
const ARCH_SEGS: readonly number[] = [41, 25, 9];
function archTop(lod: Lod): number {
  const n = ARCH_SEGS[lod] ?? 9;
  const th0 = Math.asin(ARCH.cz / ARCH.r);
  const step = (Math.PI + 2 * th0) / n;
  const ro = ARCH.r + (lod === 2 ? 0 : ARCH.depth);
  const w = lod === 2 ? 2.0 : ARCH.w;
  return ARCH.cz + ro * Math.cos(step / 2) + w / 2;
}
function arch(lod: Lod): Mesh {
  const out: Mesh[] = [];
  const n = ARCH_SEGS[lod] ?? 9;
  const th0 = Math.asin(ARCH.cz / ARCH.r);
  const ang = (i: number): number => -th0 + (i * (Math.PI + 2 * th0)) / n;
  const pt = (r: number, i: number): Vec3 => [
    BELT1,
    r * Math.cos(ang(i)),
    ARCH.cz + r * Math.sin(ang(i)),
  ];
  const ri = ARCH.r;
  const ro = ARCH.r + (lod === 2 ? 0 : ARCH.depth);
  for (let i = 0; i < n; i++) {
    rod(out, pt(ro, i), pt(ro, i + 1), lod === 2 ? 2.0 : ARCH.w);
    if (lod === 2) continue;
    rod(out, pt(ri, i), pt(ri, i + 1), ARCH.w);
    rod(out, pt(ri, i), pt(ro, i + 1), 0.25);
    if (lod === 0) rod(out, pt(ro, i), pt(ri, i + 1), 0.25);
  }
  if (lod === 0) {
    // Spandrel fan: radial bars from the extrados up to the belt.
    const top = archTop(0) + 0.35;
    for (let i = 1; i < n; i++) {
      const a = ang(i);
      const r = (top - ARCH.cz) / Math.sin(a);
      if (Math.abs(r * Math.cos(a)) > 33 || r - ro < 1) continue;
      rod(out, pt(ro, i), [BELT1, r * Math.cos(a), top], 0.3);
    }
  }
  return iron(out, true);
}

// ── 1st floor: belt girder, frieze, deck ring, railing, pavilions ───────────────────────────────
function belt1(lod: Lod): Mesh {
  const out: Mesh[] = [];
  const z0 = archTop(lod);
  const zf = 53.4;
  const zt = DECK1 - SLAB;
  const s = SIDE1;
  if (lod === 2) {
    out.push(box({ size: [1.0, 2 * s, zt - z0], at: [BELT1, 0, z0], color: IRON }));
  } else {
    const cw = 0.7;
    rod(out, [BELT1, -s, z0 + cw / 2], [BELT1, s, z0 + cw / 2], cw);
    rod(out, [BELT1, -s, zf - cw / 2], [BELT1, s, zf - cw / 2], cw);
    const bays = lod === 0 ? 16 : 8;
    for (let i = 0; i <= bays; i++) {
      const y = -s + (2 * s * i) / bays;
      rod(out, [BELT1, y, z0 + cw], [BELT1, y, zf - cw], 0.45);
      if (i === bays) continue;
      const y2 = -s + (2 * s * (i + 1)) / bays;
      rod(out, [BELT1, y, z0 + cw], [BELT1, y2, zf - cw], 0.35);
      if (lod === 0) rod(out, [BELT1, y2, z0 + cw], [BELT1, y, zf - cw], 0.35);
    }
    // The frieze (names of 72 scientists) and its cornice.
    out.push(box({ size: [0.5, 2 * s, zt - zf], at: [BELT1 + 0.1, 0, zf], color: IRON_DARK }));
    if (lod === 0) {
      out.push(box({ size: [0.8, 2 * s, 0.4], at: [BELT1 + 0.2, 0, zf + 0.2], color: IRON }));
      for (let i = 0; i < 24; i++) {
        const y = -s + 1.5 + ((2 * s - 3) * i) / 23;
        out.push(box({ size: [0.2, 1.6, 2.2], at: [BELT1 + 0.4, y, zf + 0.9], color: IRON }));
      }
    }
  }
  return iron(ring4(merge(out)));
}

/** A square deck ring (outer half `so`, hole half `si`) with its top at `top`. */
function deckRing(so: number, si: number, top: number): Mesh {
  const z = top - SLAB;
  const parts = [
    box({ size: [so - si, 2 * so, SLAB], at: [(so + si) / 2, 0, z], color: IRON_DARK }),
    box({ size: [so - si, 2 * so, SLAB], at: [-(so + si) / 2, 0, z], color: IRON_DARK }),
    box({ size: [2 * si, so - si, SLAB], at: [0, (so + si) / 2, z], color: IRON_DARK }),
    box({ size: [2 * si, so - si, SLAB], at: [0, -(so + si) / 2, z], color: IRON_DARK }),
  ];
  return si > 0
    ? merge(parts)
    : box({ size: [2 * so, 2 * so, SLAB], at: [0, 0, z], color: IRON_DARK });
}

/** Railing round a square: posts every `pitch` m, top and mid rail. */
function railing(half: number, z: number, h: number, pitch: number, lod: Lod): Mesh {
  const out: Mesh[] = [];
  const s = half - 0.1;
  const n = Math.max(2, Math.round((2 * s) / (lod === 0 ? pitch : pitch * 4)));
  for (let i = 0; i < n; i++) {
    const y = -s + (2 * s * i) / n;
    out.push(beam({ from: [s, y, z], to: [s, y, z + h], width: 0.08, color: IRON }));
  }
  rod(out, [s, -s, z + h], [s, s, z + h], 0.08);
  if (lod === 0) rod(out, [s, -s, z + h * 0.5], [s, s, z + h * 0.5], 0.05);
  return iron(ring4(merge(out)));
}

function pavilions1(lod: Lod): Mesh {
  const out: Mesh[] = [];
  out.push(box({ size: [7, 28, 4.6], at: [30.8, 0, DECK1], color: GLASS }));
  out.push(box({ size: [7.6, 29, 0.4], at: [30.8, 0, DECK1 + 4.6], color: SHADES[1] }));
  if (lod === 0)
    for (let i = 0; i <= 14; i++)
      out.push(box({ size: [0.15, 0.15, 4.6], at: [34.35, -14 + i * 2, DECK1], color: SHADES[1] }));
  return merge(ring4(merge(out)));
}

// ── 2nd floor ──────────────────────────────────────────────────────────────────────────────────
function belt2(lod: Lod): Mesh {
  const out: Mesh[] = [];
  const z0 = Z11 + 0.5;
  const zt = DECK2 - SLAB;
  const s = SIDE2;
  const cw = 0.5;
  rod(out, [BELT2, -s, z0], [BELT2, s, z0], cw);
  rod(out, [BELT2, -s, zt - cw / 2], [BELT2, s, zt - cw / 2], cw);
  const bays = lod === 0 ? 10 : 5;
  for (let i = 0; i <= bays; i++) {
    const y = -s + (2 * s * i) / bays;
    rod(out, [BELT2, y, z0], [BELT2, y, zt - cw], 0.35);
    rod(out, [BELT2, y, z0 + 0.5], [s - 0.2, y, zt - 0.2], 0.3); // console out to the deck edge
    if (i < bays) rod(out, [BELT2, y, z0], [BELT2, -s + (2 * s * (i + 1)) / bays, zt - cw], 0.3);
  }
  return iron(ring4(merge(out)));
}

// ── Lifts: inclined rails up legs 0 and 2 to the 2nd floor; central rails to the top ───────────
function liftLeg(q: number, lod: Lod): Mesh {
  const [sx, sy] = QUAD[q] ?? [1, 1];
  const out: Mesh[] = [];
  const zTop = DECK2 - SLAB - 1.4;
  const centre = (z: number): number => (halfW(z) + innerRaw(z)) / 2;
  const perp: Vec3 = [-sy / Math.SQRT2, sx / Math.SQRT2, 0];
  const pts = Array.from({ length: 31 }, (_, i): Vec3 => {
    const z = (zTop * i) / 30;
    return [sx * centre(z), sy * centre(z), z];
  });
  for (const side of [-1.4, 1.4]) {
    for (let i = 0; i + 1 < pts.length; i++) {
      const [p0, p1] = [pts[i] ?? pts[0], pts[i + 1] ?? pts[0]];
      if (!p0 || !p1) continue;
      rod(out, add(p0, scale(perp, side)), add(p1, scale(perp, side)), 0.35, IRON_DARK);
      if (lod === 0 && side > 0 && i % 2 === 0)
        rod(out, add(p0, scale(perp, -1.4)), add(p0, scale(perp, 1.4)), 0.2, IRON_DARK);
    }
  }
  const last = pts[pts.length - 1] ?? [0, 0, 0];
  out.push(box({ size: [5, 5, DECK2 - SLAB - zTop], at: last, color: IRON_DARK }));
  return iron(out);
}

function liftTop(lod: Lod): Mesh {
  const out: Mesh[] = [];
  const [z0, z1] = [DECK2, DECK3 - SLAB];
  for (const y of [-1.3, 1.3])
    out.push(beam({ from: [0, y, z0], to: [0, y, z1], width: 0.35, color: IRON_DARK }));
  if (lod === 0)
    for (let z = z0 + 6; z < z1; z += 8) rod(out, [0, -1.3, z], [0, 1.3, z], 0.15, IRON_DARK);
  return iron(out);
}

// ── Summit: 3rd floor cabin, terrace, campanile, lantern, antenna ──────────────────────────────
function campanile(lod: Lod): Mesh {
  const seg = [16, 10, 6][lod] ?? 6;
  const out: Mesh[] = [];
  const z0 = TERRACE;
  out.push(
    lathe({
      profile: [
        [6.4, 0],
        [6.4, 0.5],
      ],
      segments: seg,
      caps: true,
      at: [0, 0, z0],
      color: IRON,
    }),
  );
  const zr = LANTERN_Z;
  const rib = (r: (t: number) => number, h: (t: number) => number, yaw: number): void => {
    const n = lod === 0 ? 10 : 5;
    for (let i = 0; i < n; i++) {
      const [t0, t1] = [i / n, (i + 1) / n];
      const p = (t: number): Vec3 => {
        const rr = r(t);
        return [rr * Math.cos(yaw), rr * Math.sin(yaw), h(t)];
      };
      rod(out, p(t0), p(t1), 0.45);
    }
  };
  for (let k = 0; k < 4; k++) {
    const yaw = Math.PI / 4 + (k * Math.PI) / 2;
    rib(
      (t) => 2.4 + 6.4 * Math.cos((t * Math.PI) / 2),
      (t) => z0 + 0.5 + (zr - z0 - 0.5) * Math.sin((t * Math.PI) / 2),
      yaw,
    );
  }
  if (lod === 0) {
    // Side arches of the campanile.
    const a = 4.4;
    const arc: Mesh[] = [];
    for (let i = 0; i < 12; i++) {
      const p = (j: number): Vec3 => {
        const t = (j / 12) * Math.PI;
        return [a, a * Math.cos(t), z0 + 0.5 + 5.2 * Math.sin(t)];
      };
      rod(arc, p(i), p(i + 1), 0.35);
    }
    out.push(...ring4(merge(arc)));
  }
  const lantern: Vec2[] = [
    [3.2, 0],
    [3.2, 0.3],
    [1.9, 0.3],
    [1.9, 5.8],
    [2.3, 5.9],
    [2.3, 6.3],
    [1.6, 7.6],
    [0.9, 9.6],
    [0.9, 13.6],
    [2.4, 13.6],
    [2.4, 14.2],
  ];
  out.push(lathe({ profile: lantern, segments: seg, caps: true, at: [0, 0, zr], color: IRON }));
  return iron(out);
}

function antenna(lod: Lod, z0: number): Mesh {
  const seg = [12, 8, 5][lod] ?? 5;
  const stack: [number, number, Vec3][] = [
    [1.1, 312, GREY],
    [0.8, 320, WHITE],
    [0.55, 323, RED],
    [0.5, 326, WHITE],
  ];
  const out: Mesh[] = [];
  let z = z0;
  for (const [r, top, color] of stack) {
    out.push(
      lathe({
        profile: [
          [r, 0],
          [r, top - z],
        ],
        segments: seg,
        caps: true,
        at: [0, 0, z],
        color,
      }),
    );
    z = top;
  }
  out.push(
    lathe({
      profile: [
        [0.2, 0],
        [0.08, 330 - z],
        [0, 330 - z],
      ],
      segments: seg,
      caps: true,
      at: [0, 0, z],
      color: GREY,
    }),
  );
  return merge(out);
}

function cabin(lod: Lod): Mesh {
  const out: Mesh[] = [
    box({ size: [16.4, 16.4, TERRACE - 0.3 - DECK3], at: [0, 0, DECK3], color: GLASS }),
  ];
  if (lod === 0)
    for (let i = 0; i <= 8; i++) {
      const y = -8.2 + i * 2.05;
      for (const m of ring4(
        box({ size: [0.2, 0.2, TERRACE - 0.3 - DECK3], at: [8.2, y, DECK3], color: SHADES[2] }),
      ))
        out.push(m);
    }
  return merge(out);
}

// ── LOD2: silhouette shell ──────────────────────────────────────────────────────────────────────
function frustum(lo: readonly Vec3[], hi: readonly Vec3[]): Mesh {
  const b = new MeshBuilder();
  const all = [...lo, ...hi];
  const c = scale(
    all.reduce((s, p) => add(s, p), [0, 0, 0] as Vec3),
    1 / all.length,
  );
  const quad = (p: readonly Vec3[]): void => {
    const [a, bb, cc, d] = [p[0] ?? c, p[1] ?? c, p[2] ?? c, p[3] ?? c];
    let n = normalize(cross(sub(bb, a), sub(cc, a)));
    const mid = scale(add(add(a, bb), add(cc, d)), 0.25);
    const flip = dot(n, sub(mid, c)) < 0;
    if (flip) n = scale(n, -1);
    const ids = [a, bb, cc, d].map((q) => b.vertex({ p: q, n, uv: [0.5, 0.5], color: IRON }));
    const [i0 = 0, i1 = 0, i2 = 0, i3 = 0] = ids;
    if (flip) b.quad(i0, i3, i2, i1);
    else b.quad(i0, i1, i2, i3);
  };
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    quad([lo[i] ?? c, lo[j] ?? c, hi[j] ?? c, hi[i] ?? c]);
  }
  quad(hi);
  if ((lo[0]?.[2] ?? 0) > 0.01) quad(lo);
  return b.build();
}

const square = (x0: number, x1: number, y0: number, y1: number, z: number): Vec3[] => [
  [x0, y0, z],
  [x1, y0, z],
  [x1, y1, z],
  [x0, y1, z],
];

function farLeg(q: number): Mesh {
  const [sx, sy] = QUAD[q] ?? [1, 1];
  const sq = (z: number): Vec3[] => {
    const [o, i] = [halfW(z), innerRaw(z)];
    return square(sx * i, sx * o, sy * i, sy * o, z);
  };
  const bands = [
    [0, 22, 44, DECK1 - SLAB],
    [DECK1, 84, Z11, DECK2 - SLAB],
  ];
  const out: Mesh[] = [];
  for (const zs of bands)
    for (let k = 0; k + 1 < zs.length; k++) out.push(frustum(sq(zs[k] ?? 0), sq(zs[k + 1] ?? 0)));
  if (q === 0) {
    const zs = [DECK2, Z17, 215, 245, Z29, DECK3 - SLAB];
    const full = (z: number): Vec3[] => square(-halfW(z), halfW(z), -halfW(z), halfW(z), z);
    for (let k = 0; k + 1 < zs.length; k++)
      out.push(frustum(full(zs[k] ?? 0), full(zs[k + 1] ?? 0)));
  }
  return iron(out, true);
}

/**
 * LOD2 is one silhouette shell. Every far part reaches the ground: `leg_0` also carries the shaft,
 * the 2nd/3rd decks and the spire, `arch_0` the 1st-floor belt and deck. Tested against each
 * other, the shell's 40 m faces would cost the contact gate ~15 s of triangle-grid cells.
 */
function buildFar(ctx: BuildContext): void {
  const spire = lathe({
    profile: [
      [2.4, 0],
      [1.9, 8],
      [0.9, 18],
      [0.9, 21.7],
    ],
    segments: 6,
    caps: true,
    at: [0, 0, TERRACE - 0.3],
    color: IRON,
  });
  const top = [deckRing(SIDE2, 0, DECK2), deckRing(SIDE3, 0, DECK3), spire];
  for (let q = 0; q < 4; q++) {
    const extra = q === 0 ? [iron(top), cabin(2), antenna(2, TERRACE + 21.4)] : [];
    ctx.part(`leg_${q}`, merge([farLeg(q), ...extra]));
  }
  const a = arch(2);
  const floor1 = [belt1(2), iron([deckRing(SIDE1, 15, DECK1)])];
  for (let q = 0; q < 4; q++) {
    const m = place(a, { yaw: (q * Math.PI) / 2 });
    ctx.part(`arch_${q}`, q === 0 ? merge([m, ...floor1]) : m);
  }
}

// ── The asset ───────────────────────────────────────────────────────────────────────────────────
export const eiffel_tower = defineAsset({
  name: 'eiffel_tower',
  kind: 'building',
  description:
    'Eiffel Tower, Paris (1889; 330 m since the 2022 DAB antenna): four curved wrought-iron lattice legs on the SNTE 29-panel profile, the 1st-floor arches and belt, three platforms, campanile and antenna; three graded shades of Eiffel Tower Brown.',
  tags: ['landmark', 'paris', 'lattice', 'wrought-iron', '1889'],
  sources: [
    'https://comptes-rendus.academie-sciences.fr/mecanique/item/10.1016/j.crme.2004.02.021.pdf',
    'https://commons.wikimedia.org/wiki/File:Eiffel_Tower_plans_01.jpg',
    'https://fr.wikipedia.org/wiki/Tour_Eiffel',
    'https://en.wikipedia.org/wiki/Eiffel_Tower',
    'https://structurae.net/en/structures/20000021',
    'https://www.skyscrapercenter.com/building/wd/9410',
    'https://www.nationalgeographic.com/travel/article/behind-the-scenes-eiffel-tower-paris',
    'https://www.toureiffel.paris/en/the-monument/painting-eiffel-tower',
  ],
  real: {
    length: 124.9,
    width: 124.9,
    height: 330,
    measures: [
      {
        label: '1st floor deck height',
        axis: 'z',
        value: 57.63,
        parts: ['pedestal_0', 'platform_1'],
        source: 'structurae / plate PL. I',
      },
      {
        label: '2nd floor deck height',
        axis: 'z',
        value: 115.73,
        parts: ['pedestal_0', 'platform_2'],
        source: 'structurae / plate PL. I',
      },
      {
        label: '3rd floor deck height',
        axis: 'z',
        value: 276.13,
        parts: ['pedestal_0', 'platform_3'],
        source: 'structurae',
      },
      {
        label: 'base square, outside of the legs',
        axis: 'x',
        value: 124.9,
        parts: ['leg_0', 'leg_1'],
        source: 'fr.wikipedia (124,90 m)',
      },
      {
        label: 'leg centres at the ground',
        axis: 'x',
        value: 99.57,
        between: ['pedestal_0', 'pedestal_1'],
        source: 'plate PL. I: (124.90 + 74.24) / 2',
      },
      {
        label: '1st floor outer side',
        axis: 'x',
        value: 70.69,
        parts: ['platform_1'],
        source: 'fr.wikipedia',
      },
    ],
  },
  budget: { triangles: [210000, 25000, 1250] }, // measured 187.9k / 21.9k / 1.06k
  build(ctx) {
    const lod = ctx.lod;
    if (lod === 2) return buildFar(ctx);
    // Legs first: the contact gate walks the cheap parts below before it ever reaches these.
    for (let q = 0; q < 4; q++) ctx.part(`leg_${q}`, leg(q, lod));
    for (let q = 0; q < 4; q++) {
      const [sx, sy] = QUAD[q] ?? [1, 1];
      const [o, i] = [halfW(0) - 2.5, halfW(0) - LEG0 + 2.5];
      const blocks = [
        [o, o],
        [o, i],
        [i, o],
        [i, i],
      ].map(([x = 0, y = 0]) =>
        box({ size: [5, 5, 2], at: [sx * x, sy * y, 0], color: STONE, omit: ['bottom'] }),
      );
      ctx.part(`pedestal_${q}`, grime(merge(blocks), { ground: 2, groundStrength: 0.3 }));
    }
    const a = arch(lod);
    for (let q = 0; q < 4; q++) ctx.part(`arch_${q}`, place(a, { yaw: (q * Math.PI) / 2 }));
    ctx.part('lift_0', liftLeg(0, lod));
    ctx.part('lift_2', liftLeg(2, lod));
    ctx.part('belt_1', belt1(lod));
    ctx.part('platform_1', iron([deckRing(SIDE1, 15, DECK1)]));
    ctx.part('railing_1', railing(SIDE1, DECK1, 1.3, 2.5, lod));
    ctx.part('pavilion_1', pavilions1(lod));
    ctx.part('platform_2', iron([deckRing(SIDE2, 0, DECK2)]));
    ctx.part('belt_2', belt2(lod));
    ctx.part('railing_2', railing(SIDE2, DECK2, 1.3, 2.0, lod));
    ctx.part('lift_top', liftTop(lod));
    ctx.part('platform_3', iron([deckRing(SIDE3, 0, DECK3)]));
    ctx.part('cabin_3', cabin(lod));
    ctx.part(
      'terrace_3',
      iron([box({ size: [18, 18, 0.3], at: [0, 0, TERRACE - 0.3], color: IRON_DARK })]),
    );
    ctx.part('railing_3', railing(9.0, TERRACE, 1.2, 1.5, lod));
    ctx.part('campanile', campanile(lod));
    ctx.part('antenna', antenna(lod, LANTERN_TOP));
  },
});
