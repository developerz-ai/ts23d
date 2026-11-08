// Hard-surface plates for bust armour: a plate is a cross-section PROFILE (outer face, a
// rolled bead at the lower edge, the inner face back up at the plate's thickness, a rounded top
// edge) revolved about an axis through an angle range, lofted ring by ring. Crisp bevelled edges
// and real thickness at a few hundred triangles — what reads as forged plate, where a sculpt at
// a coarse cell reads as a blob.

import { loft, type Mesh, merge, type Rng, type StripId, sweep } from '@developerz.ai/ts23d';
import { add, cross, mul, norm, sub, type V } from './kit.ts';

type P2 = readonly [number, number];

/** A plate's closed cross-section in (r, z): the outer face along `outer` (top → bottom, r away
 *  from the axis), a rounded bottom edge, the inner face at thickness `t`, a rounded top edge.
 *  Only convex turns, so the lofted plate never folds; the rolled bead is a separate tube
 *  (`bead` in `revolvePlate`). `round` = points per rounded edge. */
export function plateProfile(outer: readonly P2[], t: number, round = 5): P2[] {
  const n = outer.length;
  const inward = (i: number): P2 => {
    const a = outer[Math.max(0, i - 1)] ?? [0, 0];
    const b = outer[Math.min(n - 1, i + 1)] ?? [0, 0];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    // The profile runs top → bottom with r growing outward, so (dz, −dx) points toward the axis.
    return [dz / l, -dx / l];
  };
  const inner = (i: number): P2 => {
    const p = outer[i] ?? [0, 0];
    const m = inward(i);
    return [p[0] + m[0] * t, p[1] + m[1] * t];
  };
  const edge = (from: P2, to: P2, bulge: P2): P2[] => {
    // A half-round from `from` to `to`, bulging along `bulge`.
    const c: P2 = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
    const r = Math.hypot(from[0] - c[0], from[1] - c[1]);
    const u: P2 = [(from[0] - c[0]) / (r || 1), (from[1] - c[1]) / (r || 1)];
    const pts: P2[] = [];
    for (let k = 1; k < round; k++) {
      const a = (k / round) * Math.PI;
      pts.push([
        c[0] + r * (u[0] * Math.cos(a) + bulge[0] * Math.sin(a)),
        c[1] + r * (u[1] * Math.cos(a) + bulge[1] * Math.sin(a)),
      ]);
    }
    return pts;
  };
  const out: P2[] = [];
  for (let i = 0; i < n; i++) out.push(outer[i] ?? [0, 0]);
  // Bottom edge: outer → inner, bulging down along the face direction.
  const lastIn = inward(n - 1);
  out.push(...edge(outer[n - 1] ?? [0, 0], inner(n - 1), [-lastIn[1], lastIn[0]]));
  for (let i = n - 1; i >= 0; i--) out.push(inner(i));
  // Top edge: inner → outer, bulging up.
  const firstIn = inward(0);
  out.push(...edge(inner(0), outer[0] ?? [0, 0], [firstIn[1], -firstIn[0]]));
  return out;
}

export interface Revolve {
  /** Point on the axis (the profile's r = 0, z = 0). */
  readonly at: V;
  /** Axis direction (profile z). */
  readonly axis: V;
  /** Angle 0 direction, perpendicular-ish to the axis. */
  readonly ref: V;
  /** Angle range, degrees (360 = full turn). */
  readonly from: number;
  readonly to: number;
  readonly steps: number;
  /** Squash the radius across the ref direction (an elliptical plate). Default 1. */
  readonly squash?: number;
  readonly color: V;
  readonly strip?: StripId;
  /** A rolled bead (tube radius, metres) along the plate's bottom outer edge. */
  readonly bead?: {
    readonly r: number;
    readonly segments: number;
    readonly color: V;
    /** Profile index of the outer bottom point (the outer face's last point). */
    readonly at: number;
  };
  /** Dents: radial push-ins at (theta deg, profile height h), gaussian `radius`, `depth` metres. */
  readonly dents?: ReadonlyArray<{ theta: number; h: number; radius: number; depth: number }>;
  /** Wear: profile indices [from, to) are the exposed edge (the bead): painted `edge`, with a
   *  share `chip` of its vertices chipped to `bare` metal; rust streaks run down `drip` below
   *  each source (theta deg, h) for `length` metres. Needs `rng` (deterministic). */
  readonly wear?: {
    readonly rng: Rng;
    readonly from: number;
    readonly to: number;
    readonly edge: V;
    readonly bare: V;
    readonly chip: number;
    readonly rust: V;
    readonly drip: ReadonlyArray<{ theta: number; h: number }>;
    readonly length: number;
  };
}

/** Revolve a plate profile into a mesh (open ends capped when the range is partial). */
export function revolvePlate(profile: readonly P2[], o: Revolve): Mesh {
  const z = norm(o.axis);
  const x0 = norm(add(o.ref, mul(z, -(o.ref[0] * z[0] + o.ref[1] * z[1] + o.ref[2] * z[2]))));
  const y0 = cross(z, x0);
  const full = Math.abs(o.to - o.from) >= 359.9;
  const rings: V[][] = [];
  const colours: V[][] = [];
  const w = o.wear;
  for (let i = 0; i <= o.steps; i++) {
    const deg = o.from + ((o.to - o.from) * i) / o.steps;
    const a = (deg * Math.PI) / 180;
    const dir = add(mul(x0, Math.cos(a)), mul(y0, Math.sin(a) * (o.squash ?? 1)));
    rings.push(
      profile.map(([r, h]) => {
        let dr = 0;
        for (const d of o.dents ?? []) {
          const s = (((deg - d.theta) * Math.PI) / 180) * r;
          dr += d.depth * Math.exp(-(s * s + (h - d.h) ** 2) / (d.radius * d.radius));
        }
        return add(add(o.at, mul(dir, r - dr)), mul(z, h));
      }),
    );
    colours.push(
      profile.map(([r, h], k) => {
        if (!w) return o.color;
        const edge = k >= w.from && k < w.to;
        let c: V = edge ? (w.rng.next() < w.chip ? w.bare : w.edge) : o.color;
        for (const d of w.drip) {
          const s = Math.abs((((deg - d.theta) * Math.PI) / 180) * r);
          const below = d.h - h;
          if (below > 0 && below < w.length && s < 0.004) {
            const t = (1 - below / w.length) * (1 - s / 0.004) * 0.7;
            c = [
              c[0] + (w.rust[0] - c[0]) * t,
              c[1] + (w.rust[1] - c[1]) * t,
              c[2] + (w.rust[2] - c[2]) * t,
            ];
          }
        }
        return c;
      }),
    );
  }
  // A partial plate ends by folding its profile in on itself (a ring shrunk to 2 % about the
  // section's centre): closed without a fan cap, which would fold over on a thin concave section.
  if (!full) {
    const shrink = (ring: readonly V[]): V[] => {
      const c = mul(
        ring.reduce((s, p) => add(s, p), [0, 0, 0] as V),
        1 / ring.length,
      );
      return ring.map((p) => add(c, mul(add(p, mul(c, -1)), 0.02)));
    };
    const first = rings[0];
    const last = rings[rings.length - 1];
    if (first && last) {
      rings.unshift(shrink(first));
      rings.push(shrink(last));
      colours.unshift(colours[0] ?? []);
      colours.push(colours[colours.length - 1] ?? []);
    }
  }
  const plate = loft({
    rings,
    color: (ring, i, p) => colours[i]?.[ring.indexOf(p)] ?? o.color,
    ...(o.strip ? { strip: o.strip } : {}),
    capStart: false,
    capEnd: false,
  });
  if (!o.bead) return plate;
  const b = o.bead;
  // The bead's centre sits a third of its radius inside the plate, so it rolls out past the face.
  const core = full ? rings : rings.slice(1, -1);
  const path = core.map((ring) => {
    const p = ring[b.at] ?? o.at;
    const q = ring[b.at + 1] ?? p;
    return add(p, mul(sub(q, p), 0.35));
  });
  const tube = sweep({
    section: { radius: b.r, segments: b.segments },
    path,
    color: b.color,
    ...(o.strip ? { strip: o.strip } : {}),
    caps: !full,
  });
  return merge([plate, tube]);
}
