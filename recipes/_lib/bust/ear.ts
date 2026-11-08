// Bust ears from human ear anatomy, shared by every head: a cartilage blade built along a midline
// (root → tip) with a width per point, a rolled HELIX rim along its back edge, the ANTIHELIX ridge
// inside it, the CONCHA bowl, TRAGUS and ANTITRAGUS, a fleshy LOBE. Races change the declared
// numbers — length, tip elongation, sweep back, droop, thickness, notches — never the structure.
// Human base (head analysis, Lee Perry-Smith scan): ear top 0.555 H, bottom 0.292 H, so the ear
// is 0.263 H long and ≈ 0.55 × its length wide.

import type { SculptEdit } from '@developerz.ai/ts23d';
import { at, ball, chain, type Frame, frameOf, k, local, spline, type V } from './kit.ts';

export interface EarSpec {
  /** Root of the ear (where it meets the head, at the ear canal), left side. */
  readonly root: V;
  /** Direction the ear's long axis points (up for a human, back-up-out for an elf). */
  readonly along: V;
  /** Direction the ear's front face looks (out and a little forward). */
  readonly facing: V;
  /** Root → top length, metres (human 0.263 H). */
  readonly length: number;
  /** Width as a share of the length (human 0.55). */
  readonly width?: number;
  /** Tip elongation: the upper helix drawn out to a point, × the length (0 = round human top). */
  readonly tip?: number;
  /** Sweep: the tip bends back along the blade's v axis by this × length. */
  readonly sweep?: number;
  /** Cartilage thickness, metres (human ≈ 0.004 at bust scale; keep ≥ the LOD cell). */
  readonly thick: number;
  /** Root knot size: the length of the ear it grows from (default `length`; a stylised long ear
   *  keeps a human-sized root, or the knot hangs below it as a ball). */
  readonly rootLength?: number;
  /** Lobe size × width (human 1; elves smaller, goblins droop it). */
  readonly lobe?: number;
  /** Notches torn out of the rim: positions along the rim 0..1 and depth × width. */
  readonly notches?: ReadonlyArray<{ readonly t: number; readonly depth: number }>;
  /** Leave out the fine inner structure (LOD2). */
  readonly simple?: boolean;
}

/** The ear's local frame: u along the ear, v across it (toward the back edge), w out of it. */
export function earFrame(e: EarSpec): Frame {
  return frameOf(e.root, e.along, e.facing);
}

/** Midline points (u, v) and half-widths from root to tip. */
function blade(e: EarSpec): { mid: Array<[number, number]>; half: number[] } {
  const L = e.length;
  const W = L * (e.width ?? 0.55);
  const tip = e.tip ?? 0;
  const sweep = e.sweep ?? 0;
  const n = 9;
  const mid: Array<[number, number]> = [];
  const half: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    // Human ear: an oval, widest a little above the middle. A tip draws the top out to a point.
    const u = L * (t * (1 + tip));
    const v = W * 0.1 + sweep * L * t * t;
    const oval = Math.sin(Math.PI * Math.min(1, (t * (1 + tip)) / (1 + tip * 0.35)) ** 0.8);
    const taper = tip > 0 ? Math.max(0.06, 1 - Math.max(0, t - 0.55) / 0.45) : 1;
    mid.push([u, v]);
    half.push(Math.max(e.thick * 0.6, (W / 2) * (0.55 + 0.45 * oval) * taper));
  }
  return { mid, half };
}

export function earEdits(e: EarSpec): SculptEdit[] {
  const f = earFrame(e);
  const { mid, half } = blade(e);
  const th = e.thick;
  const box = (r: number): [V, V] => [
    [-r, -r, -r],
    [e.length * (2 + (e.tip ?? 0)) + r, r, r],
  ];
  const g: SculptEdit[] = [];
  // Cartilage blade: flattened round cones along the midline, each as wide as the ear there.
  for (let i = 0; i + 1 < mid.length; i++) {
    const a = mid[i] ?? [0, 0];
    const b = mid[i + 1] ?? [0, 0];
    const ra = half[i] ?? th;
    const rb = half[i + 1] ?? th;
    const sq = Math.max(1, Math.max(ra, rb) / (th * 0.5));
    g.push(
      local(f, k.roundCone([a[0], a[1], 0], [b[0], b[1], 0], ra, rb), box(e.length), {
        squash: sq,
        blend: th * 0.6,
      }),
    );
  }
  // The rim path: along the back edge (+v) from low to the tip, then down the front edge a little.
  const edge = (s: number, i: number, inset: number): V => {
    const m = mid[i] ?? [0, 0];
    const h = (half[i] ?? th) - inset;
    return at(f, m[0], m[1] + s * h, th * 0.35);
  };
  const back = mid.map((_, i) => edge(1, i, th * 0.4));
  const front = mid.map((_, i) => edge(-1, i, th * 0.4)).reverse();
  const rim = spline([...back.slice(1), ...front.slice(1, 4)], 20);
  if (!e.simple) {
    // Helix: the rolled rim.
    g.push(chain(rim, th * 0.55, { blend: th * 0.5, join: th * 0.3 }));
    // Antihelix: the inner ridge, parallel to the helix and a third of the width inside it.
    const anti = mid.slice(2, 7).map((_, i) => edge(1, i + 2, (half[i + 2] ?? th) * 0.45));
    g.push(chain(spline(anti, 8), th * 0.42, { blend: th * 0.6 }));
    // Concha: the bowl in front of the antihelix, low on the ear, near the canal.
    const c = mid[2] ?? [0, 0];
    g.push(
      local(
        f,
        k.ellipsoid(
          c[0],
          c[1] - (half[2] ?? th) * 0.15,
          th * 0.9,
          (half[2] ?? th) * 0.75,
          (half[2] ?? th) * 0.5,
          th * 0.8,
        ),
        box(e.length),
        { op: 'subtract', blend: th * 0.5 },
      ),
    );
  }
  for (const n of e.notches ?? []) {
    const p = rim[Math.round(n.t * (rim.length - 1))] ?? e.root;
    g.push(ball(p, n.depth * e.length * (e.width ?? 0.55), { op: 'subtract', blend: th * 0.2 }));
  }
  // Root: a flattened knot buried in the side of the head, so the cartilage grows out of it —
  // sized by the root (a human ear's), not by a stylised blade's length.
  const rl = Math.min(e.length, e.rootLength ?? e.length);
  g.push(
    local(f, k.ellipsoid(rl * 0.25, 0, -rl * 0.28, rl * 0.3, rl * 0.22, rl * 0.3), box(e.length), {
      blend: th * 1.5,
    }),
  );
  const out: SculptEdit[] = [{ group: g, blend: th }];
  // Lobe: a fleshy drop below the root.
  const lobe = e.lobe ?? 1;
  if (lobe > 0) {
    const r = e.length * (e.width ?? 0.55) * 0.22 * lobe;
    out.push(
      local(
        f,
        k.ellipsoid(-r * 0.6, (half[0] ?? th) * 0.2, 0, r * 1.1, r, Math.max(th * 0.9, r * 0.55)),
        box(e.length),
        {
          blend: th * 1.2,
        },
      ),
    );
  }
  if (!e.simple) {
    // Tragus (over the canal, in front of the concha) and antitragus (opposite it, above the lobe).
    out.push(
      ball(at(f, e.length * 0.18, -(half[1] ?? th) * 0.85, th * 0.7), th * 0.8, {
        blend: th * 0.6,
      }),
    );
    out.push(
      ball(at(f, e.length * 0.06, (half[1] ?? th) * 0.15, th * 0.9), th * 0.7, { blend: th * 0.6 }),
    );
  }
  return out;
}
