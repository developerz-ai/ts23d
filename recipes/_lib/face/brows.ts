// Eyebrows and upper lashes as strand cards (the card hair system, one `hair` draw): a painted
// brow is a flat strip, real brows are short hairs that rise from the head of the brow and lie
// out along it toward the tail; lashes fan forward and up off the upper lid margin. Regions and
// the comb come from the skull landmarks (brow, browOuter) and the eyeball; left side, mirrored.
// `withBrowComb` wraps a recipe's hair comb; `browLayers` are appended to its card layers.

import type { CardLayer, FlowSeed, Vec3 } from '@developerz.ai/ts23d';
import type { SkullLandmarks } from './skull.ts';

export interface BrowStyle {
  /** Brow band half-height at its head, metres (tapers to 55 % at the tail). Default 4.5 mm. */
  readonly thick?: number;
  /** Brow hair length, metres. Default 9 mm. */
  readonly length?: number;
  /** Cards per m² (brows; lashes take 3×). Default 420 000. */
  readonly density?: number;
  /** Tone root → tip (× the hair colour). */
  readonly tone?: readonly [number, number];
  /** Upper lashes from the eyeball `{ centre, r }` (left eye); omit for none. */
  readonly eye?: { readonly centre: Vec3; readonly r: number };
  /** Lash length, metres. Default 8 mm. */
  readonly lash?: number;
  /** How hard the brow hairs stand off the skin (`CardLayer.lift`). Default 0.12. */
  readonly lift?: number;
  /** How far the sculpted brow may stand off the landmark line, metres. Default 1.5 cm. */
  readonly reach?: number;
}

/** The brow's centre line, head (medial) → tail, as the zone paint draws it (zones.ts). */
export function browPath(k: SkullLandmarks, H: number): Vec3[] {
  const head: Vec3 = [k.brow[0] + 0.006 * H, k.brow[1] - 0.05 * H, k.brow[2] - 0.004 * H];
  const tail: Vec3 = [
    k.browOuter[0] - 0.006 * H,
    k.browOuter[1] + 0.008 * H,
    k.browOuter[2] - 0.004 * H,
  ];
  return Array.from({ length: 13 }, (_, i): Vec3 => {
    const t = i / 12;
    return [
      head[0] + (tail[0] - head[0]) * t,
      head[1] + (tail[1] - head[1]) * t,
      head[2] + (tail[2] - head[2]) * t + Math.sin(t * Math.PI * 0.8) * 0.012 * H,
    ];
  });
}

/** Distance along/from a polyline: the nearest point's arc share t (0 head … 1 tail) and d. */
function nearest(path: readonly Vec3[], p: Vec3): { t: number; d: number } {
  let best = { t: 0, d: Number.POSITIVE_INFINITY };
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i] as Vec3;
    const b = path[i + 1] as Vec3;
    const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1;
    const u = Math.min(
      1,
      Math.max(0, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / l2),
    );
    const d = Math.hypot(p[0] - a[0] - ab[0] * u, p[1] - a[1] - ab[1] * u, p[2] - a[2] - ab[2] * u);
    if (d < best.d) best = { t: (i + u) / (path.length - 1), d };
  }
  return best;
}

const mirror = (p: Vec3): Vec3 => [p[0], Math.abs(p[1]), p[2]];

/** Brow band (≤ 0 on the brow), both sides: measured in the front view (y, z) — the sculpted
 *  ridge stands proud of the landmark line — within `reach` of it in depth. */
export function browLine(
  k: SkullLandmarks,
  H: number,
  thick = 0.0045,
  reach = 0.015,
): (p: Vec3) => number {
  const path = browPath(k, H);
  const flat = path.map((q): Vec3 => [0, q[1], q[2]]);
  return (p) => {
    const q = mirror(p);
    const n = nearest(flat, [0, q[1], q[2]]);
    const i = Math.round(n.t * (path.length - 1));
    const depth = Math.abs(q[0] - (path[i]?.[0] ?? q[0])) - reach;
    return Math.max(n.d - thick * (1 - 0.45 * n.t), depth);
  };
}

/** Upper lash root band (≤ 0): a 2 mm ring just outside the ball, front and upper only. */
export function lashLine(eye: { centre: Vec3; r: number }): (p: Vec3) => number {
  const [cx, cy, cz] = eye.centre;
  const r = eye.r;
  return (p) => {
    const q = mirror(p);
    const dx = q[0] - cx;
    const dz = q[2] - cz;
    const d = Math.hypot(dx, q[1] - cy, dz);
    return Math.max(Math.abs(d - 1.12 * r) - 0.002, 0.5 * r - dx, 0.2 * r - dz, dz - 0.8 * r);
  };
}

/** The recipe's comb, with brow hairs lying out along the brow (rising at its head) and lashes
 *  fanning forward and up. */
export function withBrowComb(comb: FlowSeed, k: SkullLandmarks, H: number, s: BrowStyle = {}) {
  const path = browPath(k, H);
  const brow = browLine(k, H, (s.thick ?? 0.0045) + 0.004, s.reach);
  const lash = s.eye ? lashLine(s.eye) : () => 1;
  return (p: Vec3, n: Vec3): Vec3 => {
    const side = Math.sign(p[1]) || 1;
    if (lash(p) < 0.003) return [1, side * 0.25, 0.9];
    if (brow(p) < 0) {
      const t = nearest(path, mirror(p)).t;
      return [0.15, side * (0.35 + 0.65 * Math.min(1, t * 2.5)), 0.9 * (1 - t) - 0.15];
    }
    return comb(p, n);
  };
}

/** Brow (and lash) card layers for `cardHair`, on the `hair_clumps` strip's wiry cells. */
export function browLayers(k: SkullLandmarks, H: number, s: BrowStyle = {}): CardLayer[] {
  const density = s.density ?? 420000;
  const tone = s.tone ?? [0.5, 0.85];
  const brows: CardLayer = {
    name: 'brows',
    kind: 'wisp',
    region: browLine(k, H, s.thick ?? 0.0045, s.reach),
    density,
    length: s.length ?? 0.009,
    width: 0.0024,
    lift: s.lift ?? 0.12,
    bend: 0.55,
    droop: 0.12,
    roll: 0.2,
    fold: 0,
    tone,
    hug: 1,
  };
  if (!s.eye) return [brows];
  const lashes: CardLayer = {
    name: 'lashes',
    kind: 'beard',
    region: lashLine(s.eye),
    density: density * 3,
    length: s.lash ?? 0.008,
    width: 0.0026,
    lift: 0.5,
    bend: 0.5,
    droop: 0,
    roll: 0.1,
    fold: 0,
    tone: [0.35, 0.5],
    hug: 0.2,
  };
  return [brows, lashes];
}
