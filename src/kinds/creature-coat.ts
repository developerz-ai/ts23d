// Coat colour as zones on the body (the painter's first pass, before tone): the flank colour, a
// darker dorsal saddle, countershading toward a pale belly and throat, leg colour below the trunk,
// a dark tail tip, then the seeded pattern marks (thinning toward the belly). The head gets its
// own zones in head-local space: the pale muzzle mask and cheeks, brow marks, dark ear backs —
// the focal area holds the most value contrast. Edits that carry their own colour (nose leather,
// hooves, beak, lips) keep it.

import type { Vec3 } from '../core/index.ts';
import type { Bones } from './creature-bones.ts';
import { arcT, mixRgb, smoothstep, v3 } from './creature-curve.ts';
import { type BodyCoord, marks } from './creature-pattern.ts';
import { type CreatureColours, type CreatureSpec, faceOf } from './creature-spec.ts';

export type Paint = (p: Vec3, c: Vec3) => Vec3;

const scale = (c: Vec3, k: number): Vec3 => [c[0] * k, c[1] * k, c[2] * k];
const lighten = (c: Vec3, k: number): Vec3 => mixRgb(c, [1, 1, 1], k);

/** Zone colours with defaults filled in; the optional marks (foreline, mask) stay optional. */
export type Palette = Required<Omit<CreatureColours, 'foreline' | 'mask'>> &
  Pick<CreatureColours, 'foreline' | 'mask'>;

/** Every zone colour, defaults filled in. */
export function palette(c: CreatureColours): Palette {
  const back = c.back ?? scale(c.coat, 0.7);
  const belly = c.belly ?? lighten(c.coat, 0.45);
  return {
    ...c,
    back,
    belly,
    legs: c.legs ?? belly,
    muzzle: c.muzzle ?? belly,
    tip: c.tip ?? scale(back, 0.6),
    mark: c.mark ?? [0.03, 0.025, 0.02],
  };
}

interface Seg {
  readonly a: Vec3;
  readonly b: Vec3;
  readonly ra: number;
  readonly rb: number;
  /** Tail arc fraction at a and b, or −1 off the tail. */
  readonly ta: number;
  readonly tb: number;
  /** The segment's dorsal direction: perpendicular to it in the XZ plane, facing up/back. */
  readonly up: Vec3;
}

function segs(nodes: readonly { at: Vec3; r: number }[], tail: boolean, mirror: boolean): Seg[] {
  const ts = arcT(nodes.map((n) => n.at));
  const fold = (q: Vec3): Vec3 => (mirror ? [q[0], Math.abs(q[1]), q[2]] : q);
  const out: Seg[] = [];
  for (let i = 0; i + 1 < nodes.length; i++) {
    const a = nodes[i];
    const b = nodes[i + 1];
    if (!a || !b) continue;
    const t = v3.norm(v3.sub(b.at, a.at));
    // Dorsal side: up-back of a forward neck, up-back of a drooping tail, straight back on a
    // hanging one — so the zones run along the chain with no rings at its joints.
    const up: Vec3 = t[0] > 0 ? [-t[2], 0, t[0]] : [t[2], 0, -t[0]];
    out.push({
      up: v3.len(up) > 1e-6 ? v3.norm(up) : [0, 0, 1],
      a: fold(a.at),
      b: fold(b.at),
      ra: a.r,
      rb: b.r,
      ta: tail ? (ts[i] ?? 0) : -1,
      tb: tail ? (ts[i + 1] ?? 0) : -1,
    });
  }
  return out;
}

/** Dorso-ventral coordinate and tail fraction of a body point: from the trunk envelope (top and
 *  bottom of the trunk masses at this x) or, nearer a neck/tail/body chain, from that chain's
 *  axis (projected on its segments, so the zones run smoothly along it). */
export function locator(b: Bones): (p: Vec3) => BodyCoord & { tail: number } {
  const chains = [
    ...segs(b.neck, false, b.mirror),
    ...segs(b.chain, false, b.mirror),
    ...segs(b.tail, true, b.mirror),
  ];
  const span = Math.max(1e-6, ...b.trunk.map((m) => 2 * m.r[2]));
  return (p) => {
    const q: Vec3 = b.mirror ? [p[0], Math.abs(p[1]), p[2]] : p;
    let nd = Infinity;
    let cv = 0;
    let cr = 1;
    let tail = -1;
    for (const g of chains) {
      const ab = v3.sub(g.b, g.a);
      const t = Math.max(0, Math.min(1, v3.dot(v3.sub(q, g.a), ab) / (v3.dot(ab, ab) || 1)));
      const c = v3.lerp(g.a, g.b, t);
      const r = g.ra + (g.rb - g.ra) * t;
      const d = v3.len(v3.sub(q, c)) - r;
      if (d < nd)
        [nd, cv, cr, tail] = [
          d,
          v3.dot(v3.sub(q, c), g.up),
          r,
          g.ta < 0 ? -1 : g.ta + (g.tb - g.ta) * t,
        ];
    }
    let top = -Infinity;
    let bot = Infinity;
    for (const m of b.trunk) {
      // In the mass's own pitch (a ribcage tilted sternum-down), then back to world heights.
      const a = ((m.rotate?.[1] ?? 0) * Math.PI) / 180;
      const [c, sn] = [Math.cos(a), Math.sin(a)];
      const lx = c * (p[0] - m.at[0]) - sn * (p[2] - m.at[2]);
      const u = lx / m.r[0];
      if (Math.abs(u) >= 1) continue;
      const h = m.r[2] * Math.sqrt(1 - u * u);
      top = Math.max(top, m.at[2] - sn * lx + c * h);
      bot = Math.min(bot, m.at[2] - sn * lx - c * h);
    }
    const dTrunk = top > bot ? Math.max(0, bot - p[2], p[2] - top) : Infinity;
    const vTrunk = top > bot ? (2 * p[2] - top - bot) / (top - bot) : 0;
    const chain = nd < dTrunk && (tail < 0 || nd < cr * 0.6);
    const vChain = cv / Math.max(1e-6, cr);
    if (nd === Infinity) return { v: vTrunk, tail: 0 };
    // Past the trunk's ends (croup → tail stump, chest → neck) the nearest chain decides.
    if ((top <= bot && (tail < 0 || nd < cr * 1.5)) || (tail >= 0 && chain))
      return { v: vChain, tail: Math.max(0, tail) };
    if (tail >= 0 || top <= bot) return { v: vTrunk, tail: 0 };
    // Neck/body chain meeting the trunk: blend the two coordinates over two chain radii, so
    // the throat and saddle zones run on without a seam where the neck leaves the chest.
    // …and where the trunk envelope thins to its tip (the chest's front end) hand over to the
    // chain before its v runs off to ±∞: no hard edge down the front of the shoulder.
    const w = Math.max(
      smoothstep(-2 * cr, 2 * cr, dTrunk - nd),
      smoothstep(0.6 * span, 0.2 * span, top - bot),
    );
    return { v: vTrunk + (vChain - vTrunk) * w, tail: 0 };
  };
}

const same = (a: Vec3, b: Vec3): boolean =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 0.02;

/** Body paint (world points): zones, countershading, marks. `aa` = mark antialias, metres. */
export function bodyPaint(b: Bones, s: CreatureSpec, aa: number): Paint {
  const c = palette(s.colours);
  const locate = locator(b);
  const mk = s.pattern ? marks(s.pattern, aa) : null;
  const legTop = b.legs.length > 0 ? b.height * (b.skeleton === 'biped' ? 0.45 : 0.42) : -1;
  const fore = b.legs.find((l) => l.name === 'fore');
  const line = c.foreline && fore ? forelineMask(fore.joints, fore.radii) : null;
  return (p, given) => {
    if (!same(given, s.colours.coat)) return given;
    const at = locate(p);
    let col = c.coat;
    col = mixRgb(col, c.back, smoothstep(0.2, 0.75, at.v));
    col = mixRgb(col, c.belly, smoothstep(-0.25, -0.75, at.v));
    if (legTop > 0 && at.tail === 0)
      col = mixRgb(col, c.legs, smoothstep(legTop, legTop * 0.55, p[2]));
    col = mixRgb(col, c.tip, smoothstep(0.72, 0.92, at.tail));
    if (line && c.foreline) col = mixRgb(col, c.foreline, line(p));
    if (mk) {
      const m = mk(p, at) * (1 - 0.8 * smoothstep(-0.4, -0.9, at.v));
      col = mixRgb(col, c.mark, m * 0.92);
    }
    return col;
  };
}

/** The dark stripe on the front face of the forearm (elbow → wrist), fading at both ends. */
function forelineMask(joints: readonly Vec3[], radii: readonly number[]): (p: Vec3) => number {
  const e = joints[1] ?? [0, 0, 0];
  const w = joints[2] ?? e;
  const r = radii[1] ?? 0.03;
  const ab = v3.sub(w, e);
  const ll = v3.dot(ab, ab) || 1;
  return (p) => {
    const q: Vec3 = [p[0], Math.abs(p[1]), p[2]];
    const t = v3.dot(v3.sub(q, e), ab) / ll;
    if (t < 0 || t > 1.05) return 0;
    const d = v3.sub(q, v3.lerp(e, w, t));
    const len = v3.len(d);
    if (len > r * 1.8) return 0;
    // Front-facing: the offset from the bone points forward (+X), a band ~⅓ of the girth.
    const front = d[0] / (len || 1);
    return smoothstep(0.65, 0.9, front) * smoothstep(0.05, 0.3, t) * smoothstep(1.05, 0.8, t);
  };
}

/** Head paint (head-local points: +X along the skull, origin at the atlas). */
export function headPaint(b: Bones, s: CreatureSpec): Paint {
  const c = palette(s.colours);
  const h = b.head;
  const muzzle = faceOf(s).muzzle;
  const lc = (1 - muzzle) * h.length;
  return (p, given) => {
    if (!same(given, s.colours.coat)) return given;
    const v = p[2] / (h.height / 2);
    let col = mixRgb(c.coat, c.back, smoothstep(0.1, 0.8, v));
    // Muzzle mask: the front and the lower lips pale; the bridge keeps the coat.
    const front = smoothstep(lc * 0.8, lc * 1.05, p[0]);
    col = mixRgb(col, c.muzzle, front * smoothstep(0.05, -0.35, v));
    // Cheeks and throat pale (countershading continues under the jaw).
    col = mixRgb(col, c.belly, smoothstep(-0.35, -0.8, v));
    // Brow marks over each eye: the face reads from across a room.
    const brow = Math.hypot(
      p[0] - lc * 0.8,
      (Math.abs(p[1]) - h.width * 0.26) * 1.4,
      p[2] - h.height * 0.36,
    );
    col = mixRgb(col, c.muzzle, smoothstep(h.width * 0.08, h.width * 0.03, brow) * 0.6);
    if (c.mask) {
      // Mask: a darker band from round the eyes forward over the bridge of the muzzle.
      const eyes = smoothstep(lc * 0.45, lc * 0.75, p[0]) * smoothstep(-0.25, 0.15, v);
      const off = Math.abs(p[1]) / (h.width * 0.5);
      const band = eyes * smoothstep(0.75, 0.35, Math.abs(v - 0.15)) * smoothstep(1.1, 0.5, off);
      col = mixRgb(col, c.mask, band * 0.75 * (1 - 0.6 * smoothstep(lc * 1.1, h.length, p[0])));
    }
    // Cheek fur behind the mouth corner: pale up to the eye line (canid/felid cheek ruff).
    const cheek = smoothstep(lc * 1.05, lc * 0.7, p[0]) * smoothstep(-0.05, -0.35, v);
    col = mixRgb(col, c.belly, cheek * smoothstep(h.width * 0.25, h.width * 0.42, Math.abs(p[1])));
    // Ears: dark backs and rims toward the tips.
    col = mixRgb(col, c.tip, smoothstep(h.height * 0.6, h.height * 1.1, p[2]) * 0.85);
    return col;
  };
}
