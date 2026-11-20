// Warden Hall upper works: the team-colour slate roof (a dark sarking deck, then courses of
// lapped slates, each its own value: sun-faded toward the ridge, a dark drip course at the eaves,
// odd replaced slates), a ridge roll, gable ends with an amber oculus, the pitched porch on oak
// posts, the recessed gate in its stone surround with a bracket lamp, and the rear drum towers
// (arrow slits, a door up two steps, team cones and beacons; a laid or broken block crown when
// they have no cone). Each piece takes the stage and damage it is built for.

import {
  applyAffine,
  box,
  cylinder,
  dmath,
  frame,
  type Lod,
  lathe,
  type Mesh,
  merge,
  place,
  prism,
  type Rng,
  type Vec2,
  type Vec3,
} from '@developerz.ai/ts23d';
import {
  BONE,
  BONE_DARK,
  BRASS,
  chevronPlan,
  GLOW,
  IRON,
  pebble,
  SEG,
  SOOT,
  TEAM,
  teamShade,
  tube,
} from '../_lib/rts/style.ts';
import {
  COURSE,
  DOOR_ROWS,
  EAVES,
  GATE_HALF,
  HALF_X,
  HALF_Y,
  PLINTH,
  TOWER,
  WALL_T,
} from './plan.ts';

export const PITCH = (26 * Math.PI) / 180;
export const OVERHANG = 0.6;
const SLOPE_W = (HALF_Y + OVERHANG) / dmath.cos(PITCH);
export const RIDGE = EAVES + HALF_Y * dmath.tan(PITCH);
const STRIPS = 5;
/** Sarking deck under the slates; slate courses (exposed length, slate size, thickness). */
const DECK = 0.1;
const SLATE = { exposed: 0.42, length: 0.68, width: 0.5, t: 0.035 } as const;
/** Oak timber (rafters, gable frame, porch posts) and the gate's tarred planks. */
export const WOOD: Vec3 = [0.23, 0.14, 0.08];
export const TIMBER: Vec3 = [0.3, 0.19, 0.1];
export const DOOR: Vec3 = [0.12, 0.08, 0.05];
/** Lime plaster on the gables. */
export const PLASTER: Vec3 = [0.74, 0.69, 0.57];

const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];

/** A roof plane: `o` on the underside at the ridge, `u` along the ridge, `d` down the slope, `n`
 *  out of the roof; `ul` × `vl` metres. */
interface Plane {
  readonly o: Vec3;
  readonly u: Vec3;
  readonly d: Vec3;
  readonly n: Vec3;
  readonly ul: number;
  readonly vl: number;
}

/** A plane falling to side s (+1 = +Y) from a ridge at `o`, pitch `p`. */
const plane = (o: Vec3, s: 1 | -1, p: number, ul: number, vl: number): Plane => ({
  o,
  u: [1, 0, 0],
  d: [0, s * dmath.cos(p), -dmath.sin(p)],
  n: [0, s * dmath.sin(p), dmath.cos(p)],
  ul,
  vl,
});

/** A local box (`size`, centred on the origin) carried to (u, v, w) on plane `pl`, tilted `tilt`
 *  about the u axis (its down-slope end rises). */
function onPlane(pl: Plane, m: Mesh, u: number, v: number, w: number, tilt = 0): Mesh {
  const c = dmath.cos(tilt);
  const s = dmath.sin(tilt);
  const d = add(scale(pl.d, c), pl.n, s);
  const n = add(scale(pl.n, c), pl.d, -s);
  const at = add(add(add(pl.o, pl.u, u), pl.d, v), pl.n, w);
  return applyAffine(m, frame(pl.u, d, n, at));
}

/** The deck between u0..u1 (a slab DECK thick, its underside on the plane). */
const deck = (pl: Plane, u0: number, u1: number, v0: number, v1: number, k: number): Mesh =>
  onPlane(
    pl,
    box({ size: [u1 - u0, v1 - v0, DECK], at: [0, 0, 0], color: teamShade(k), strip: 'slate' }),
    (u0 + u1) / 2,
    (v0 + v1) / 2,
    0,
  );

/** Slate value: sun-faded toward the ridge, darker toward the eaves, each slate its own. */
function slateTone(rng: Rng, v: number, vl: number, eave: boolean): number {
  const fade = 0.96 - 0.16 * (v / vl);
  let k = fade * rng.range(0.9, 1.04);
  if (rng.next() < 0.06) k *= 0.78; // a replaced, still-dark slate
  if (eave) k *= 0.8; // the drip course: rain off the roof darkens the last slates
  return Math.min(1, k);
}

/** A slate's edges a step darker than its face (local frame, face up): each course's butt
 *  edge reads as the shadow line over the next. */
function shadowEdges(m: Mesh): Mesh {
  const colors = new Float32Array(m.colors);
  for (let i = 0; i < colors.length; i += 3)
    if ((m.normals[i + 2] ?? 0) < 0.5)
      for (let c = 0; c < 3; c++) colors[i + c] = (colors[i + c] ?? 0) * 0.55;
  return { ...m, colors };
}

interface SlateOptions {
  /** u ranges with no deck and no slates (a shell hole). */
  readonly holes?: readonly (readonly [number, number])[];
  /** Fraction of slates gone (a raid stripped them). */
  readonly loss?: number;
  /** Where slates within 0.8 m of a hole's edge go: burnt black, no team paint left (LOD0). */
  readonly charred?: Mesh[];
}

/** A slate burnt through by the fire round a shell hole. */
export const CHARRED_SLATE: Vec3 = [0.04, 0.037, 0.034];

/**
 * Slates in lapped courses over one plane. LOD0: every slate (staggered, tilted so each rides
 * on the course below, its tone jittered; slates along a hole's edge broken, skewed or hanging
 * over it). LOD1: one strip per course. LOD2: none (the deck carries a two-band value).
 */
function slates(lod: Lod, pl: Plane, rng: Rng, o: SlateOptions = {}): Mesh[] {
  const out: Mesh[] = [];
  const holes = o.holes ?? [];
  const inHole = (u: number): boolean => holes.some(([a, b]) => u > a && u < b);
  const nearHole = (u0: number, u1: number): boolean =>
    holes.some(([a, b]) => (u1 > a - 0.15 && u0 < a + 0.25) || (u1 > b - 0.25 && u0 < b + 0.15));
  const burnt = (u0: number, u1: number): boolean =>
    holes.some(([a, b]) => (u1 > a - 0.8 && u0 < a) || (u1 > b && u0 < b + 0.8));
  const L = SLATE.length;
  const n = Math.ceil(pl.vl / SLATE.exposed);
  // Present u runs (between holes) for the per-course strips.
  const cuts = [0, ...holes.flat(), pl.ul];
  const runs: [number, number][] = [];
  for (let i = 0; i + 1 < cuts.length; i += 2) runs.push([cuts[i] ?? 0, cuts[i + 1] ?? 0]);
  for (let k = 0; k < n; k++) {
    const v1 = pl.vl - k * SLATE.exposed;
    const v0 = Math.max(0, v1 - L);
    const len = v1 - v0;
    const tl = dmath.asin(Math.min(0.2, (SLATE.t + 0.006) / Math.max(len, 0.2)));
    const w = SLATE.t / 2 - 0.003 + DECK;
    if (lod === 1) {
      const kk = slateTone(rng, v1, pl.vl, k === 0);
      for (const [a, b] of runs)
        out.push(
          onPlane(
            pl,
            shadowEdges(
              box({
                size: [b - a, len, SLATE.t],
                at: [0, 0, -SLATE.t / 2],
                color: teamShade(kk),
                strip: 'slate',
                omit: ['bottom'],
              }),
            ),
            (a + b) / 2,
            (v0 + v1) / 2,
            w,
            k === n - 1 ? 0 : tl,
          ),
        );
      continue;
    }
    if (lod === 2) continue;
    const shift = k % 2 === 0 ? 0 : SLATE.width / 2;
    for (let u0 = -shift; u0 < pl.ul; u0 += SLATE.width) {
      const a = Math.max(0, u0);
      const b = Math.min(pl.ul, u0 + SLATE.width);
      if (b - a < 0.08) continue;
      const mid = (a + b) / 2;
      if (inHole(mid) || (o.loss && rng.next() < o.loss)) continue;
      const broken = nearHole(a, b);
      if (broken && rng.next() < 0.3) continue;
      const char = o.charred !== undefined && (broken || (burnt(a, b) && rng.next() < 0.8));
      const kk = slateTone(rng, v1, pl.vl, k === 0) * (broken ? 0.82 : 1);
      const tone: Vec3 = char
        ? [
            CHARRED_SLATE[0] * (0.7 + kk * 0.4),
            CHARRED_SLATE[1] * (0.7 + kk * 0.4),
            CHARRED_SLATE[2] * (0.7 + kk * 0.4),
          ]
        : teamShade(kk);
      // Broken edge slates: shorter, skewed on their nail, sliding toward the hole.
      const short = broken ? rng.range(0.55, 0.95) : 1;
      const slate = shadowEdges(
        box({
          size: [b - a - 0.02, len * short, SLATE.t],
          at: [0, 0, -SLATE.t / 2],
          color: tone,
          strip: 'slate',
          omit: ['bottom'],
        }),
      );
      const skewed = broken ? place(slate, { yaw: rng.range(-0.25, 0.25) }) : slate;
      (char && o.charred ? o.charred : out).push(
        onPlane(
          pl,
          skewed,
          mid,
          v1 - (len * short) / 2,
          w,
          k === n - 1 ? 0 : tl * (short < 1 ? 1.4 : 1),
        ),
      );
    }
  }
  return out;
}

/** Roof slope (team) on side s (+1 = +Y), minus the `missing` strips (a shell hole). */
export function roofSlopes(
  lod: Lod,
  s: 1 | -1,
  missing: readonly number[],
  rng: Rng,
  /** Collects the burnt slates round a hole (not team-painted any more). */
  charred?: Mesh[],
): Mesh | null {
  const ul = (HALF_X + OVERHANG) * 2;
  const pl = plane([-HALF_X - OVERHANG, 0, RIDGE], s, PITCH, ul, SLOPE_W);
  const strip = ul / STRIPS;
  const holes: [number, number][] = [];
  for (let i = 0; i < STRIPS; i++)
    if (missing.includes(i)) {
      const last = holes[holes.length - 1];
      if (last && Math.abs(last[1] - i * strip) < 1e-6) last[1] = (i + 1) * strip;
      else holes.push([i * strip, (i + 1) * strip]);
    }
  const cuts = [0, ...holes.flat(), ul];
  const out: Mesh[] = [];
  for (let i = 0; i + 1 < cuts.length; i += 2) {
    const a = cuts[i] ?? 0;
    const b = cuts[i + 1] ?? 0;
    if (b - a < 1e-6) continue;
    // LOD2: the deck alone, in two value bands (faded upper, darker lower).
    if (lod === 2) {
      out.push(
        deck(pl, a, b, 0, SLOPE_W * 0.55, 0.93),
        deck(pl, a, b, SLOPE_W * 0.55, SLOPE_W, 0.78),
      );
    } else out.push(deck(pl, a, b, 0, SLOPE_W, 0.45));
  }
  out.push(...slates(lod, pl, rng, { holes, ...(charred ? { charred } : {}) }));
  if (lod === 0 && holes.length)
    // Two or three slates hang off the hole's top edge on their last nail.
    for (const [a] of holes)
      for (let i = 0; i < 3; i++) {
        const v = 1.2 + i * 2.1;
        out.push(
          onPlane(
            pl,
            box({
              size: [0.46, SLATE.length, SLATE.t],
              at: [0, 0, -SLATE.t / 2],
              color: teamShade(0.7),
              strip: 'slate',
            }),
            a - 0.1,
            v + 0.25,
            -0.05,
            -0.9 - i * 0.2,
          ),
        );
      }
  return out.length ? merge(out) : null;
}

/** The ridge roll capping both slopes (team, a shade darker). */
export function ridgeRoll(lod: Lod): Mesh {
  const x = HALF_X + OVERHANG + 0.05;
  const z = RIDGE + DECK / dmath.cos(PITCH) + 0.02;
  return tube(lod, [-x, 0, z], [x, 0, z], 0.15, 0.15, teamShade(0.66));
}

/** Rafters under the roof, every 1.1 m; those under the hole snapped, with splintered ends. */
export function rafters(lod: Lod, broken: readonly [number, number] = [0, 0]): Mesh | null {
  if (lod === 2) return null;
  const out: Mesh[] = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const x = -HALF_X + 0.6 + (i * (HALF_X * 2 - 1.2)) / (n - 1);
    for (const s of [1, -1] as const) {
      const snapped = s === -1 && x > broken[0] && x < broken[1];
      const len = SLOPE_W * (snapped ? 0.45 + 0.08 * (i % 3) : 0.92);
      // Rafter top on the underside plane, from the ridge down.
      const pl = plane([x, 0, RIDGE], s, PITCH, 0, SLOPE_W);
      out.push(
        onPlane(
          pl,
          box({ size: [0.16, len, 0.22], at: [0, 0, -0.22], color: WOOD }),
          0,
          len / 2 + 0.1,
          0,
        ),
      );
      if (snapped && lod === 0)
        // Splinters: thin shards standing out of the broken end.
        for (const [dy, dz, h] of [
          [-0.05, -0.04, 0.32],
          [0.04, -0.15, 0.22],
        ] as const)
          out.push(
            onPlane(
              pl,
              box({ size: [0.05, h, 0.06], at: [dy, 0, dz], color: SOOT }),
              0,
              len + 0.1 + h / 2 - 0.04,
              0,
              0.25,
            ),
          );
    }
  }
  out.push(box({ size: [HALF_X * 2, 0.24, 0.3], at: [0, 0, RIDGE - 0.3], color: WOOD }));
  return merge(out);
}

/** Gable end walls (front and back): lime plaster infill in an oak frame (tie beam, raked
 *  rafters, king post, two struts), the oculus on the front. */
export function gables(lod: Lod): { walls: Mesh; frame: Mesh | null; oculus: Mesh | null } {
  const tri: Vec2[] = [
    [-HALF_Y, EAVES],
    [HALF_Y, EAVES],
    [0, RIDGE],
  ];
  const g = prism({ profile: tri, depth: WALL_T, plane: 'yz', color: PLASTER });
  const walls = merge([place(g, { at: [HALF_X, 0, 0] }), place(g, { at: [-HALF_X, 0, 0] })]);
  let frm: Mesh | null = null;
  if (lod < 2) {
    const beams: Mesh[] = [];
    // Beams stand 6 cm proud of the plaster and sink 6 cm into it: face contact.
    const beam = (x: number, a: Vec3, b: Vec3): Mesh => {
      const len = dmath.hypot(b[1] - a[1], b[2] - a[2]);
      const roll = dmath.atan2(b[2] - a[2], b[1] - a[1]);
      const m = box({
        size: [0.12, len, 0.26],
        at: [0, 0, -0.13],
        color: TIMBER,
        bevel: lod === 0 ? 0.02 : 0,
      });
      return place(m, { at: [x, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], roll });
    };
    for (const sx of [1, -1]) {
      const x = sx * (HALF_X + WALL_T / 2);
      const h = RIDGE - EAVES;
      beams.push(
        beam(x, [0, -HALF_Y + 0.2, EAVES + 0.14], [0, HALF_Y - 0.2, EAVES + 0.14]),
        beam(x, [0, 0, EAVES + 0.14], [0, 0, RIDGE - 0.35]),
        beam(x, [0, -HALF_Y * 0.55, EAVES + 0.14], [0, -0.12, EAVES + h * 0.62]),
        beam(x, [0, HALF_Y * 0.55, EAVES + 0.14], [0, 0.12, EAVES + h * 0.62]),
      );
    }
    frm = merge(beams);
  }
  const oculus =
    lod < 2
      ? merge([
          cylinder({
            radius: 0.75,
            length: 0.16,
            segments: SEG(lod, 24, 12, 6),
            axis: 'x',
            at: [HALF_X + WALL_T / 2 + 0.04, 0, EAVES + 1.25],
            color: BRASS,
          }),
          cylinder({
            radius: 0.6,
            length: 0.18,
            segments: SEG(lod, 24, 12, 6),
            axis: 'x',
            at: [HALF_X + WALL_T / 2 + 0.05, 0, EAVES + 1.25],
            color: GLOW,
          }),
        ])
      : null;
  return { walls, frame: frm, oculus };
}

export type Crown = 'none' | 'laying' | 'broken';

/** A ring of blocks on a capless drum's wall top: a course being laid, or a broken stepped top. */
function crown(lod: Lod, at: Vec3, r: number, height: number, kind: Crown, rng: Rng): Mesh[] {
  // A low footing breaks to one course at most; a standing stub keeps up to three.
  const maxRows = height < 1.5 ? 1 : 3;
  if (kind === 'none') return [];
  // LOD2: a ruin's standing stub (under 3 m) keeps a stepped crown of five plain blocks on its
  // high side (the far ruin's broken top); a low footing, a course being laid, none.
  if (lod === 2)
    return kind === 'broken' && height >= 1.5 && height < 3 ? farCrown(at, r, height, rng) : [];
  // Course-sized blocks on a standing stub (22 round, ~0.42 m); a low footing keeps 16.
  const n = SEG(lod, maxRows > 1 ? 22 : 16, 12, 0);
  const mid = r - 0.22;
  const arc = ((2 * Math.PI * mid) / n) * 0.93;
  const phase = rng.range(0, Math.PI * 2);
  const out: Mesh[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    // Broken: sheared on a slant, tallest on one side and stepping down to nothing on the other,
    // a block or two missing from each step; laying: one course part-way round.
    const slant = 0.5 + 0.5 * dmath.cos(a - phase);
    const rows =
      kind === 'laying'
        ? i < n * 0.6
          ? 1
          : 0
        : Math.min(
            maxRows,
            Math.max(0, Math.floor(slant * (maxRows + 0.9) + rng.range(-0.6, 0.5))),
          );
    for (let k = 0; k < rows; k++) {
      const top = k === rows - 1;
      if (kind === 'broken' && top && k > 0 && rng.next() < 0.3) continue;
      const loose = kind === 'broken' && top;
      const k2 = rng.range(0.82, 1.02);
      // Running bond round the drum: odd courses offset half a block; a loose top block sits
      // square on the block of its own column below it, not across a joint.
      const bond = (row: number): number => (row % 2 === 1 ? Math.PI / n : 0);
      const ak = a + (loose && k > 0 ? bond(k - 1) : bond(k));
      const b = pebble(
        lod,
        [0.44, arc * (loose ? rng.range(0.45, 0.9) : 1), COURSE * (loose ? rng.range(0.6, 1) : 1)],
        [0, 0, 0],
        [BONE[0] * k2, BONE[1] * k2, BONE[2] * k2],
        'concrete',
      );
      out.push(
        place(b, {
          at: [
            at[0] + dmath.cos(ak) * mid,
            at[1] + dmath.sin(ak) * mid,
            height + k * COURSE - 0.01,
          ],
          yaw: ak + (loose ? rng.range(-0.25, 0.25) : 0),
          roll: loose ? rng.range(-0.04, 0.04) : 0,
        }),
      );
    }
  }
  return out;
}

/** The far crown: five blocks round the high side, stepping 3-2-2-1-1 courses down. */
function farCrown(at: Vec3, r: number, height: number, rng: Rng): Mesh[] {
  const mid = r - 0.22;
  const phase = rng.range(0, Math.PI * 2);
  return [3, 2, 2, 1, 1].map((rows, i) => {
    const a = phase + (i - 2) * 0.55;
    return place(
      box({
        size: [0.44, 0.8, COURSE * rows],
        at: [0, 0, 0],
        color: BONE,
        strip: 'concrete',
        omit: ['bottom'],
      }),
      { at: [at[0] + dmath.cos(a) * mid, at[1] + dmath.sin(a) * mid, height - 0.01], yaw: a },
    );
  });
}

/** An outward-facing feature on the drum at angle `a`: a local box (x out of the wall). */
const onDrum = (m: Mesh, at: Vec3, r: number, a: number, z: number): Mesh =>
  place(m, { at: [at[0] + dmath.cos(a) * r, at[1] + dmath.sin(a) * r, z], yaw: a });

/** Arrow slits and the door (up two steps) on a finished drum, facing outward. */
function drumDetail(lod: Lod, at: Vec3, s: 1 | -1, height: number): Mesh[] {
  const r = TOWER.r;
  const out: Mesh[] = [];
  const side = (s * Math.PI) / 2;
  // Slits: stone surround, a black slot set into it (rear, outer side, between them).
  for (const a of [Math.PI, side, (s * 3 * Math.PI) / 4])
    for (const z of [3.4, 5.4]) {
      if (z + 1 > height - 0.6) continue;
      out.push(
        onDrum(
          box({ size: [0.12, 0.38, 1.1], at: [0, 0, 0], color: BONE_DARK }),
          at,
          r - 0.04,
          a,
          z,
        ),
        onDrum(
          box({ size: [0.06, 0.12, 0.85], at: [0, 0, 0.12], color: SOOT }),
          at,
          r + 0.03,
          a,
          z,
        ),
      );
    }
  // Door on the outer side, up two steps from the ground.
  // Turned 20° toward the rear so its steps stay inside the cone's eaves line.
  const d = s * (Math.PI / 2 + 0.35);
  out.push(
    onDrum(box({ size: [0.14, 1.0, 2.1], at: [0, 0, 0], color: DOOR }), at, r - 0.04, d, 0.95),
    onDrum(
      box({ size: [0.16, 0.18, 2.3], at: [0, -0.59, 0], color: BONE_DARK }),
      at,
      r - 0.03,
      d,
      0.95,
    ),
    onDrum(
      box({ size: [0.16, 0.18, 2.3], at: [0, 0.59, 0], color: BONE_DARK }),
      at,
      r - 0.03,
      d,
      0.95,
    ),
    onDrum(
      box({ size: [0.18, 1.4, 0.26], at: [0, 0, 0], color: BONE_DARK }),
      at,
      r - 0.03,
      d,
      3.05,
    ),
    onDrum(box({ size: [0.4, 1.3, 0.9], at: [0, 0, 0], color: BONE_DARK }), at, r + 0.16, d, 0),
    onDrum(box({ size: [0.3, 1.3, 0.45], at: [0, 0, 0], color: BONE_DARK }), at, r + 0.5, d, 0),
  );
  if (lod === 0)
    for (const z of [1.4, 2.5])
      out.push(
        onDrum(box({ size: [0.04, 0.9, 0.08], at: [0, 0, 0], color: IRON }), at, r + 0.04, d, z),
      );
  return out;
}

/**
 * A rear drum tower of `height` (m above ground) at side s; capped with a team cone if `cap`.
 * Without a cone its top is a hollow wall ring crowned per `crowned` (a course being laid, or
 * broken blocks) instead of a flat disc.
 */
export function tower(
  lod: Lod,
  s: 1 | -1,
  height: number,
  cap: boolean,
  crowned: Crown,
  rng: Rng,
): { drum: Mesh; cap: Mesh | null; beacon: Mesh | null } {
  const at: Vec3 = [TOWER.x, s * TOWER.y, 0];
  // LOD2: an octagon; at crowd distance the drum and its team cone are a few pixels across.
  const segs = SEG(lod, 28, 14, 8);
  const r = TOWER.r;
  // Coursed masonry in the profile itself: every 0.5 m course is chamfered back 2.5 cm at its
  // bed joint (LOD0/1), so the drum reads as laid blocks under raking light, not a pipe.
  const courses: Vec2[] = [];
  const top = cap ? height - 0.4 : height;
  if (lod < 2)
    for (let z = 1.5; z < top - 0.2; z += 0.5)
      courses.push([r, z - 0.03], [r - 0.025, z], [r, z + 0.02]);
  const head: Vec2[] = cap
    ? [
        [r, top],
        [r + 0.15, height - 0.35],
        [r + 0.15, height],
        // LOD2: no top disc, the cone's own base closes the drum.
        ...(lod === 2 ? [] : ([[0.001, height]] as Vec2[])),
      ]
    : [
        [r, height],
        [r - 0.45, height],
        [r - 0.45, height - 0.45],
        [0.001, height - 0.45],
      ];
  // LOD2: no hidden bottom disc, the plinth ring as one taper.
  const profile: Vec2[] =
    lod === 2
      ? [[r + 0.2, 0], ...(height > 1.2 ? ([[r, 1.0]] as Vec2[]) : []), ...head]
      : [
          [0.001, 0],
          [r + 0.2, 0],
          [r + 0.2, Math.min(0.9, height - 0.1)],
          ...(height > 1.2 ? ([[r, 1.0]] as Vec2[]) : []),
          ...courses,
          ...head,
        ];
  const ring = lathe({ profile, segments: segs, at, color: BONE, strip: 'concrete' });
  const detail = cap && lod < 2 ? drumDetail(lod, at, s, height) : [];
  const drum = merge([ring, ...detail, ...(cap ? [] : crown(lod, at, r, height, crowned, rng))]);
  if (!cap) return { drum, cap: null, beacon: null };
  const cone = lathe({
    profile: [
      [0.001, 0],
      [r + 0.45, 0],
      [r + 0.35, 0.25],
      [0.001, 2.6],
    ],
    segments: segs,
    at: [at[0], at[1], height],
    color: TEAM,
    strip: 'slate',
  });
  const beacon =
    lod < 2
      ? merge([
          // Brass collar seated on the cone where its radius matches, then the beacon mast.
          cylinder({
            radius: 0.28,
            length: 0.1,
            segments: SEG(lod, 12, 8, 4),
            at: [at[0], at[1], height + 2.3],
            color: BRASS,
          }),
          cylinder({
            radius: 0.05,
            length: 1.0,
            segments: 6,
            at: [at[0], at[1], height + 2.85],
            color: IRON,
          }),
          lathe({
            profile: [
              [0.001, 0],
              [0.22, 0.12],
              [0.22, 0.4],
              [0.001, 0.55],
            ],
            segments: SEG(lod, 12, 8, 4),
            at: [at[0], at[1], height + 3.3],
            color: GLOW,
          }),
        ])
      : null;
  return { drum, cap: cone, beacon };
}

/** Porch: eaves on the posts, ridge along X, from the gable wall to its own front pediment. */
const PORCH = {
  back: HALF_X + WALL_T / 2,
  front: HALF_X + 3.4,
  post: 2.1,
  eave: PLINTH + DOOR_ROWS * COURSE,
  pitch: (30 * Math.PI) / 180,
} as const;
const PORCH_RIDGE = PORCH.eave + PORCH.post * dmath.tan(PORCH.pitch);

/** The porch's oak posts, tie beam and plastered pediment (complete stage). */
export function porch(lod: Lod): Mesh {
  const postH = PORCH.eave - 0.25;
  const x = HALF_X + 2.0;
  const parts: Mesh[] = [1, -1].map((s) =>
    cylinder({
      radius: 0.24,
      length: postH,
      segments: SEG(lod, 16, 8, 4),
      at: [x, s * PORCH.post, postH / 2],
      color: TIMBER,
    }),
  );
  // Tie beam across the post heads, under the roof.
  parts.push(
    box({
      size: [0.3, PORCH.post * 2 + 0.3, 0.25],
      at: [x, 0, postH],
      color: TIMBER,
      bevel: lod === 0 ? 0.02 : 0,
      // LOD2: its top is pressed against the porch roof.
      omit: lod === 2 ? ['top'] : [],
    }),
  );
  // Front pediment: plaster triangle under the roof's front edge, an oak king post.
  const fx = PORCH.front - 0.25;
  const tri: Vec2[] = [
    [-PORCH.post, PORCH.eave],
    [PORCH.post, PORCH.eave],
    [0, PORCH_RIDGE - 0.02],
  ];
  parts.push(
    place(prism({ profile: tri, depth: 0.2, plane: 'yz', color: PLASTER }), { at: [fx, 0, 0] }),
  );
  parts.push(
    box({
      size: [0.36, PORCH.post * 2 + 0.2, 0.22],
      at: [fx, 0, PORCH.eave - 0.22],
      color: TIMBER,
      omit: lod === 2 ? ['top'] : [],
    }),
  );
  if (lod < 2)
    parts.push(
      box({
        size: [0.08, 0.18, PORCH_RIDGE - PORCH.eave - 0.1],
        at: [fx + 0.12, 0, PORCH.eave],
        color: TIMBER,
      }),
    );
  return merge(parts);
}

/** The porch roof (team): two slate slopes, a ridge roll, the chevron on the pediment. */
export function porchRoof(lod: Lod, damaged: boolean, rng: Rng): Mesh {
  const ul = PORCH.front - PORCH.back + 0.25;
  const vl = (PORCH.post + 0.45) / dmath.cos(PORCH.pitch);
  const out: Mesh[] = [];
  for (const s of [1, -1] as const) {
    const pl = plane([PORCH.back, 0, PORCH_RIDGE], s, PORCH.pitch, ul, vl);
    if (lod === 2) out.push(deck(pl, 0, ul, 0, vl, 0.86));
    else {
      out.push(deck(pl, 0, ul, 0, vl, 0.45));
      out.push(...slates(lod, pl, rng, { loss: damaged && s === 1 ? 0.3 : 0 }));
    }
  }
  const z = PORCH_RIDGE + DECK / dmath.cos(PORCH.pitch) + 0.02;
  out.push(tube(lod, [PORCH.back, 0, z], [PORCH.front + 0.25, 0, z], 0.1, 0.1, teamShade(0.66)));
  out.push(
    place(chevronPlan([0, 0, 0], 0.7, 1.2, 0.3, 0.04, TEAM), {
      at: [PORCH.front - 0.14, 0, PORCH.eave + 0.6],
      pitch: -Math.PI / 2,
    }),
  );
  return merge(out);
}

/** The double gate, recessed in the 4 m opening, and its stone surround with a keystone. */
export function gate(lod: Lod): { leaves: Mesh; surround: Mesh | null } {
  const h = DOOR_ROWS * COURSE;
  const x = HALF_X - 0.08;
  const leaves: Mesh[] = [1, -1].map((s) =>
    box({ size: [0.14, GATE_HALF, h], at: [x, (s * GATE_HALF) / 2, PLINTH], color: DOOR }),
  );
  if (lod === 0)
    for (const s of [1, -1]) {
      for (const z of [0.6, 1.75, 2.9])
        leaves.push(
          box({
            size: [0.04, GATE_HALF - 0.2, 0.12],
            at: [x + 0.08, (s * GATE_HALF) / 2, PLINTH + z],
            color: IRON,
          }),
        );
      // Ring pull.
      leaves.push(
        place(
          lathe({
            profile: [
              [0.07, -0.015],
              [0.09, 0],
              [0.07, 0.015],
            ],
            segments: 10,
            color: BRASS,
          }),
          {
            at: [x + 0.1, s * 0.3, PLINTH + 1.7],
            pitch: Math.PI / 2,
          },
        ),
      );
    }
  const face = HALF_X + WALL_T / 2;
  const surround: Mesh[] = [
    ...[-1, 1].map((s) =>
      box({
        size: [0.16, 0.4, h],
        at: [face + 0.06, s * (GATE_HALF + 0.2), PLINTH],
        color: BONE_DARK,
        bevel: lod === 0 ? 0.03 : 0,
      }),
    ),
    box({
      size: [0.18, GATE_HALF * 2 + 0.9, 0.36],
      at: [face + 0.07, 0, PLINTH + h],
      color: BONE_DARK,
      bevel: lod === 0 ? 0.03 : 0,
    }),
  ];
  if (lod < 2)
    surround.push(
      box({
        size: [0.24, 0.5, 0.46],
        at: [face + 0.1, 0, PLINTH + h - 0.04],
        color: BONE_DARK,
        bevel: lod === 0 ? 0.03 : 0,
      }),
    );
  return { leaves: merge(leaves), surround: lod === 2 ? null : merge(surround) };
}

/** A bracket lamp on the wall beside the gate: iron arm, lantern frame, amber glass. */
export function lamp(lod: Lod): { iron: Mesh; glass: Mesh } | null {
  if (lod === 2) return null;
  const face = HALF_X + WALL_T / 2;
  const y = -(GATE_HALF + 0.75);
  const z = PLINTH + 2.7;
  const iron = merge([
    box({ size: [0.04, 0.16, 0.3], at: [face + 0.02, y, z], color: IRON }),
    box({ size: [0.42, 0.04, 0.04], at: [face + 0.21, y, z + 0.22], color: IRON }),
    box({ size: [0.24, 0.24, 0.05], at: [face + 0.4, y, z + 0.18], color: IRON }),
    box({ size: [0.22, 0.22, 0.04], at: [face + 0.4, y, z - 0.18], color: IRON }),
  ]);
  const glass = box({ size: [0.18, 0.18, 0.32], at: [face + 0.4, y, z - 0.14], color: GLOW });
  return { iron, glass };
}
