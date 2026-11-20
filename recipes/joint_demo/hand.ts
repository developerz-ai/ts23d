// The hand in a hammer grip round an upright handle, thumb side up: a palm lofted from the wrist
// section (flush with the forearm) to the knuckle line, the thenar pad, four fingers each rolled
// round the handle (knuckle, two finger joints, tucked tip) and the thumb laid over them with its
// nail. The palm's inner face is tangent to the handle and the fingers close the ring, which is
// what the `grip` joint measures. `scale` exists for the failure demo: a hand ×2 must fail the
// wrist joint (the opening round the handle stays the handle's, so only the wrist complains).

import {
  type BuildContext,
  bakeAo,
  dmath,
  loft,
  type Mesh,
  merge,
  type Vec3,
} from '@developerz.ai/ts23d';
import { onSkin } from '../_lib/face/skin-strip.ts';
import type { Tone } from './arm.ts';
import { ellipsoid, mix, type Station, smooth, tube } from './shape.ts';

export interface HandOptions {
  readonly wrist: Vec3;
  /** Wrist half-breadth (Y) and half-depth (Z), to start the palm flush with the forearm. */
  readonly section: readonly [number, number];
  /** Handle radius the fist closes on. */
  readonly grip: number;
  /** Uniform scale (1 = to spec). */
  readonly scale?: number;
  readonly tone: Tone;
  /** The handle (and anything else that shades the hand), for the baked contact shadow. */
  readonly occluder?: Mesh;
}

const NAIL: Vec3 = [0.78, 0.6, 0.55];
const CREASE: Vec3 = [0.3, 0.17, 0.12];

/** A ring in the plane x = const whose corners square up as `e` falls from 1 (ellipse) to 0.5. */
const ringSuper = (x: number, ry: number, rz: number, z: number, n: number, e: number): Vec3[] =>
  Array.from({ length: n }, (_, k): Vec3 => {
    const a = (k / n) * Math.PI * 2;
    const [c, s] = [dmath.cos(a), dmath.sin(a)];
    return [
      x,
      ry * Math.sign(c) * dmath.pow(Math.abs(c), e),
      z + rz * Math.sign(s) * dmath.pow(Math.abs(s), e),
    ];
  });

/** Where the fist sits for a wrist at `wrist`: the handle centre and the palm's knuckle line. */
export function gripOf(wrist: Vec3, grip: number, scale = 1): Vec3 {
  // The palm is 1.7 cm thick (half) where the handle crosses it; the handle presses 0.5 mm in.
  return [wrist[0] + 0.07 * scale, 0.017 * scale + grip - 0.0005, wrist[2]];
}

/** Finger rows, index (top) to little finger: row height, length and thickness against the
 *  middle finger. */
interface Finger {
  readonly row: number;
  readonly length: number;
  readonly thick: number;
}
const FINGERS: readonly Finger[] = [
  { row: 1.5, length: 0.95, thick: 0.97 },
  { row: 0.5, length: 1, thick: 1 },
  { row: -0.5, length: 0.93, thick: 0.93 },
  { row: -1.5, length: 0.78, thick: 0.82 },
];

/** Builds the hand; returns the grip centre (where the handle's axis passes through the fist). */
export function hand(ctx: BuildContext, o: HandOptions): Vec3 {
  const s = o.scale ?? 1;
  const g = o.grip;
  const n = ctx.pick([18, 10, 5]);
  const [wx, , wz] = o.wrist;
  const [hy, hz] = o.section;
  const c = gripOf(o.wrist, g, s);
  const [cx, cy] = c;
  // Outward as on the forearm (round the arm's axis), so the tone runs unbroken over the wrist.
  const out = (p: Vec3): Vec3 => {
    const l = dmath.hypot(p[1], p[2] - wz) || 1;
    return [0, p[1] / l, (p[2] - wz) / l];
  };
  const tone = (p: Vec3): Vec3 => o.tone(p, out(p));
  // Palm: thumb side up, palm breadth vertical; an ellipse at the wrist squaring to a slab.
  const palm = loft({
    rings: [
      ringSuper(wx, hy * 1.04 * s, hz * 1.02 * s, wz, n, 1),
      ringSuper(wx + 0.04 * s, 0.022 * s, 0.038 * s, wz, n, 0.85),
      ringSuper(wx + 0.07 * s, 0.017 * s, 0.042 * s, wz, n, 0.65),
      ringSuper(wx + 0.092 * s, 0.014 * s, 0.0425 * s, wz, n, 0.6),
      ringSuper(wx + 0.1 * s, 0.0105 * s, 0.04 * s, wz, n, 0.6),
    ],
    color: (_r, _i, p) => tone(p),
    capStart: true,
    capEnd: true,
  });
  const parts: Record<string, Mesh> = {};
  const row = 0.021 * s;
  const fingerPath = (f: Finger, r: number, h: number): Station[] => {
    const z = wz + f.row * row;
    // The handle's front, where the first phalanx lies along it.
    const front = cx + g + r * 0.95;
    const side = cy + g + r * 0.98;
    const L = f.length;
    const st = (x: number, y: number, k: number): Station => ({ at: [x, y, z], r: r * k, h });
    return [
      st(cx + 0.012 * s, 0, 1.1),
      st(front - 0.001 * s, -0.001 * s, 1.22), // knuckle
      st(front, cy * 0.5, 1),
      st(front - 0.002 * s, cy + (g + r) * 0.8, 1.13), // first finger joint
      st(cx + 0.01 * s, side, 0.96),
      st(cx - 0.006 * s * L, side, 1.04), // second finger joint
      st(cx - (g + 0.3 * r) * L, cy + g * 0.75, 0.9),
      st(cx - (g + 0.9 * r) * L, cy + g * 0.1, 0.8),
    ];
  };
  if (ctx.lod < 2) {
    const meshes: Mesh[] = [];
    for (const f of FINGERS) {
      const r = 0.0095 * s * f.thick;
      const h = 0.0122 * s * Math.min(1, f.thick + 0.06);
      const path = fingerPath(f, r, h);
      const z = wz + f.row * row;
      meshes.push(
        tube(smooth(path, ctx.pick([2, 1, 1])), {
          segments: ctx.pick([7, 5, 5]),
          phase: ctx.pick([0, 0.5, 0.5]),
          up: [0, 0, 1],
          // Dirt and shadow gather in the creases between the fingers.
          color: (p) => mix(tone(p), CREASE, Math.max(0, Math.abs(p[2] - z) / h - 0.72) * 2.2),
          tip: ctx.pick([2, 0, 0]),
        }),
      );
    }
    parts['hand_fingers'] = merge(meshes);
    // Thenar pad: the thumb's root, filling the hollow the fingertips tuck into.
    const pad = ellipsoid(
      [cx - 0.036 * s, 0.017 * s, wz + 0.016 * s],
      [0.03 * s, 0.017 * s, 0.027 * s],
      ctx.pick([10, 8, 6]),
      ctx.pick([4, 3, 2]),
      tone,
    );
    parts['hand_palm'] = merge([palm, pad]);
    // Thumb: from the pad, over the tucked fingertips, lying on the fingers' second phalanges.
    const lay = cy + g + 2 * 0.0095 * s + 0.006 * s;
    const top = wz + 0.012 * s;
    const th: Station[] = [
      { at: [cx - 0.052 * s, 0.01 * s, top], r: 0.013 * s, h: 0.013 * s },
      { at: [cx - 0.036 * s, cy + 0.012 * s, top + 0.014 * s], r: 0.0125 * s, h: 0.012 * s },
      { at: [cx - 0.012 * s, lay, top + 0.022 * s], r: 0.011 * s, h: 0.0105 * s },
      { at: [cx + 0.012 * s, lay + 0.001 * s, top + 0.018 * s], r: 0.0092 * s, h: 0.0095 * s },
    ];
    const thumb = tube(smooth(th, ctx.pick([2, 1, 1])), {
      segments: ctx.pick([10, 6, 6]),
      up: [0, 0, 1],
      color: tone,
      tip: ctx.pick([2, 1, 0]),
    });
    const end = (th[3] as Station).at;
    const nail = ellipsoid(
      [end[0] + 0.002 * s, end[1] + 0.0078 * s, end[2]],
      [0.0085 * s, 0.0022 * s, 0.0068 * s],
      ctx.pick([8, 6, 6]),
      ctx.pick([3, 2, 2]),
      NAIL,
    );
    parts['hand_thumb'] = merge([thumb, nail]);
  } else {
    // Far: the four fingers as one slab rolled round the handle, no thumb.
    const mid = { row: 0, length: 0.95, thick: 1 };
    const path = fingerPath(mid, 0.0095 * s, 0.042 * s).map((p) => ({ ...p, r: p.r * 0.7 }));
    parts['hand_palm'] = palm;
    parts['hand_fingers'] = tube(
      [path[0], path[1], path[3], path[4], path[5], path[7]] as Station[],
      {
        segments: 4,
        phase: 0.5,
        up: [0, 0, 1],
        color: tone,
      },
    );
  }
  const all = merge([...Object.values(parts), ...(o.occluder ? [o.occluder] : [])]);
  for (const [name, m] of Object.entries(parts))
    ctx.part(
      name,
      onSkin(
        ctx.lod < 2
          ? bakeAo(m, { samples: ctx.pick([12, 8, 6]), radius: 0.03 * s, strength: 0.55 }, all)
          : m,
      ),
    );
  return c;
}
