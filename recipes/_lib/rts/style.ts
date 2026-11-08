// The Saltmarch Accord style guide as code: an ORIGINAL sample RTS faction (salt-flat engineers
// who mine sunstone). One palette with roles, the `team` paint slot + its eight variants, and the
// shape-language helpers every faction asset builds with: pebble masses (bevelled, rounded),
// forward chevrons (crests, prows, roof ridges), round amber lenses. See README.md.

import {
  box,
  hex,
  type Lod,
  lathe,
  type Mesh,
  merge,
  type PaintVariants,
  place,
  prism,
  type StripId,
  sweep,
  type Vec2,
  type Vec3,
} from '@developerz.ai/ts23d';

// ── team colour: one slot, eight liveries (KHR_materials_variants) ──────────────────────────────
/** sRGB team colours, saturated mid-values so they survive shading and read at 64 px. */
export const TEAMS = {
  red: '#b3261e',
  blue: '#1f4fb8',
  green: '#2f8f3a',
  yellow: '#e2b521',
  purple: '#6d2fa6',
  orange: '#e0661a',
  teal: '#139a92',
  white: '#e8e8e2',
} as const;
export const TEAM_PAINT = { team: TEAMS.red } as const;
export const TEAM_VARIANTS: PaintVariants = Object.fromEntries(
  Object.entries(TEAMS).map(([k, v]) => [k, { team: v }]),
);
/** Vertex colour of team parts: exactly the slot colour (variants swap it), or a darker tone. */
export const TEAM = hex(TEAMS.red);
export const teamShade = (k: number): Vec3 => [TEAM[0] * k, TEAM[1] * k, TEAM[2] * k];

// ── palette by role ─────────────────────────────────────────────────────────────────────────────
/** Large neutral masses: bone-ivory ceramic armour, so team colour owns the saturation. */
export const BONE = hex('#cfc4a8');
export const BONE_DARK = hex('#a99d82');
/** Under-layers and machinery: slate and gunmetal. */
export const SLATE = hex('#4a5058');
export const IRON = hex('#2c3034');
/** Accent metal on edges and fittings. */
export const BRASS = hex('#a87a2c');
export const LEATHER = hex('#5a3d28');
/** Boots: dark oiled leather. */
export const BOOT = hex('#3b2c22');
export const CLOTH = hex('#6f6a52');
export const SKIN = hex('#c08a66');
export const SKIN_DARK = hex('#9a6a4c');
export const RUBBER = hex('#232323');
/** The faction's tech glow: amber sunstone lenses (the focal accent). */
export const GLOW = hex('#ffb13a');
export const SUNSTONE = hex('#f0a02a');
export const SOOT = hex('#1b1a19');

export const SEG = (lod: Lod, hi: number, mid: number, lo: number): number =>
  lod === 0 ? hi : lod === 1 ? mid : lo;

/** A pebble block: bevelled at LOD0/1, a plain box at LOD2. `at` = base centre. */
export function pebble(
  lod: Lod,
  size: Vec3,
  at: Vec3,
  color: Vec3,
  strip: StripId = 'plain',
): Mesh {
  const b = Math.min(...size) * 0.22;
  return box({ size, at, color, strip, bevel: lod === 2 ? 0 : Math.min(b, 0.06) });
}

/** A tapered round tube from `a` to `b` (limbs, barrels, pipes), radius r0 → r1. Open-ended at
 *  LOD2, where the ends always sit inside a neighbour. */
export function tube(lod: Lod, a: Vec3, b: Vec3, r0: number, r1: number, color: Vec3): Mesh {
  return sweep({
    section: { radius: 1, segments: SEG(lod, 16, 8, 4) },
    path: [a, b],
    scale: [r0, r1],
    color,
    caps: lod < 2,
  });
}

/** An ellipsoid (heads, pauldrons, knees): radii rx, ry, rz about `at`. */
export function ellipsoid(lod: Lod, at: Vec3, r: Vec3, color: Vec3): Mesh {
  const rings = SEG(lod, 12, 6, 3);
  const profile: Vec2[] = [];
  for (let i = 0; i <= rings; i++) {
    const t = -Math.PI / 2 + (i / rings) * Math.PI;
    profile.push([Math.cos(t), Math.sin(t)]);
  }
  const unit = lathe({ profile, segments: SEG(lod, 20, 10, 4), color });
  return place(unit, { at, scale: r });
}

/** A dome cap (upper half ellipsoid), base at `at`: helmets, pauldrons, roofs of tanks. */
export function dome(lod: Lod, at: Vec3, r: Vec3, color: Vec3, flat = 0): Mesh {
  const rings = SEG(lod, 7, 4, 2);
  const profile: Vec2[] = [[1, 0]];
  for (let i = 1; i <= rings; i++) {
    const t = (i / rings) * (Math.PI / 2);
    profile.push([Math.cos(t) * (i === rings ? flat : 1), Math.sin(t)]);
  }
  if (flat > 0) profile.push([0, 1]);
  return place(lathe({ profile, segments: SEG(lod, 20, 10, 4), color, caps: true }), {
    at,
    scale: r,
  });
}

/**
 * A forward chevron crest along +X: a thin raked fin (side profile in XZ, `t` thick), the faction's
 * signature silhouette. `at` = the fin's base centre; the nose leans forward, the tail sweeps back.
 */
export function chevron(at: Vec3, len: number, h: number, t: number, color: Vec3): Mesh {
  const profile: Vec2[] = [
    [len / 2, 0],
    [len * 0.15, h],
    [-len * 0.5, h * 0.55],
    [-len / 2, 0],
  ];
  return place(prism({ profile, depth: t, plane: 'xz', color }), { at });
}

/** A flat chevron plate in plan (a V pointing +X), `t` thick, base at `at`: deck and roof marks. */
export function chevronPlan(
  at: Vec3,
  len: number,
  span: number,
  arm: number,
  t: number,
  color: Vec3,
): Mesh {
  const profile: Vec2[] = [
    [len / 2, 0],
    [-len / 2, span / 2],
    [-len / 2 + arm, span / 2],
    [len / 2 - arm, 0],
    [-len / 2 + arm, -span / 2],
    [-len / 2, -span / 2],
  ];
  return place(prism({ profile, depth: t, plane: 'xy', centred: false, color }), { at });
}

/**
 * A fist that wraps a round handle of radius `handleR`: a torus round the grip axis (+Z local)
 * whose inner polygon's inradius equals the handle (so the grip joint fits at every LOD), plus a
 * knuckle block on −X local (yaw it outward).
 */
export function fist(lod: Lod, handleR: number, color: Vec3): Mesh {
  const s = SEG(lod, 10, 6, 4);
  const around = SEG(lod, 14, 8, 4);
  const tubeR = 0.026;
  const ring = handleR / Math.cos(Math.PI / around) + tubeR;
  const profile: Vec2[] = [];
  for (let i = 0; i <= s; i++) {
    const a = (i / s) * Math.PI * 2;
    profile.push([ring + Math.cos(a) * tubeR, Math.sin(a) * 0.045]);
  }
  const wrap = lathe({ profile, segments: around, color });
  if (lod === 2) return wrap;
  const knuckles = box({
    size: [0.05, 0.085, 0.075],
    at: [-ring - 0.01, 0, -0.0375],
    color,
    bevel: 0.012,
  });
  return merge([wrap, knuckles]);
}

/** Mirror a mesh across y = 0 (left ↔ right), keeping it outward-wound. */
export function mirrorY(m: Mesh): Mesh {
  const p = m.positions.slice();
  const n = m.normals.slice();
  for (let i = 1; i < p.length; i += 3) {
    p[i] = -(p[i] ?? 0);
    n[i] = -(n[i] ?? 0);
  }
  const idx = m.indices.slice();
  for (let i = 0; i < idx.length; i += 3) {
    const t = idx[i + 1] ?? 0;
    idx[i + 1] = idx[i + 2] ?? 0;
    idx[i + 2] = t;
  }
  return { ...m, positions: p, normals: n, indices: idx };
}
