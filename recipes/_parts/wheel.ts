// Wheel + tyre: a passenger-car tyre on a cast alloy rim. Spins about Y; origin = hub centre; the
// styled face (spokes, hub, lug nuts) is on −Y (yaw π for the other side of a vehicle).
//
// Reference: 225/45 R17 on a 7.5J × 17 alloy (the defaults: 0.63 m tyre, 0.43 m rim, 0.22 m wide).
// - Section 225 mm, aspect 45 % → sidewall 101 mm; overall Ø 634 mm; approved rims 7–8.5 in.
//   https://www.tiresize.com/tires/Toyo/Proxes-Sport-225-45R17.htm
//   https://www.performanceplustire.com/Blog/225-45r17-in-inches
// - Rim: J flange 17.3 mm high above the bead seat, bead-seat safety humps, drop well for mounting;
//   7.5 in between flanges = 0.85 × section width. https://www.tirerack.com/upgrade-garage/
//   matching-wheel-diameters-and-bead-seat-contours, ISO 4000-2 (J contour, Table 2).
// - Offset ET ≈ +45 mm: the mounting face sits outboard of the rim centreline, so the face is dished
//   only ~30 mm behind the outer lip (concave spokes, hub recessed); lug nuts on a 112 mm PCD.
// - Tread: new depth ≈ 8 mm; circumferential grooves (water) split the crown into a continuous
//   centre rib, two intermediate ribs with angled notches and two shoulder rows of blocks separated
//   by lateral grooves; the shoulder wraps round a ~20 mm radius into a slightly bulged sidewall.
//   https://www.continental-tires.com/car/tire-knowledge/tire-basics/tire-tread
//
// LOD0: bulged sidewall, rounded shoulders, raised tread blocks on a sunk crown, rim with flange
// lips, bead seats, drop well, tapered concave spokes, hub, centre cap, lug nuts. LOD1: plain crown,
// coarser rings, no lug nuts. LOD2: 20-sided tyre + dished face disc, a few hundred triangles.

import {
  cylinder,
  definePart,
  lathe,
  loft,
  type Mesh,
  merge,
  place,
  prism,
  type Vec2,
  type Vec3,
} from '@developerz.ai/ts23d';
import { DARK_STEEL, RUBBER, STEEL, ZINC } from './shape.ts';

/** A point on the tyre's crown/shoulder surface, (y, r), with its inward unit normal. */
interface Surf {
  readonly y: number;
  readonly r: number;
  readonly ny: number;
  readonly nr: number;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (t: number): number => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

export const wheel = definePart({
  name: 'wheel',
  description:
    'car tyre (bulged sidewall, round shoulders, tread blocks at LOD0) on a dished alloy rim with spokes, hub and lug nuts; face on −Y; spins about Y',
  tags: ['vehicle', 'wheel', 'moving'],
  params: { diameter: 0.63, width: 0.22, rim: 0.43, spokes: 5, tread: true },
  schema: {
    diameter: { min: 0.1, max: 4, unit: 'm', doc: 'tyre outer diameter' },
    width: { min: 0.03, max: 1.5, unit: 'm', doc: 'tyre section width' },
    rim: { min: 0.05, max: 3.5, unit: 'm', doc: 'rim (bead seat) diameter' },
    spokes: { min: 0, max: 24, unit: 'count', doc: '0 = solid disc' },
    tread: { doc: 'raised lugs on the crown at LOD0' },
  },
  validate: (p) =>
    p.rim >= p.diameter * 0.95 ? `rim ${p.rim} m leaves no tyre inside ${p.diameter} m` : undefined,
  build(b, p) {
    const lod = b.lod;
    const R = p.diameter / 2;
    const ri = p.rim / 2;
    const hw = p.width / 2;
    const h = R - ri; // sidewall height
    const seg = b.pick([56, 32, 20]);

    // ---- Rim contour (J flange), scaled from the 7.5J × 17 reference ----
    const fh = Math.min(h * 0.17, ri * 0.08); // flange height above the bead seat
    const rimHalf = hw * 0.85; // half the width between flanges
    const flt = hw * 0.1; // flange lip thickness
    const yL = rimHalf + flt; // plane of the outer lip faces
    const lr = flt * 0.45; // lip rounding
    const t = ri * 0.03; // barrel wall
    const wd = Math.min(ri * 0.1, h * 0.3); // drop-well depth
    const bs = rimHalf * 0.22; // bead-seat width
    const dish = hw * 0.28; // hub recess behind the outer lip
    const hubR = ri * 0.36;
    const yHub = -yL + dish; // spoke front at the hub

    // ---- Tyre section ----
    const td = lod === 0 && p.tread ? Math.min(h * 0.08, R * 0.026) : 0; // tread depth
    const rs = Math.min(hw * 0.2, h * 0.22); // shoulder radius
    const tc = hw * 0.72; // half-width of the flat crown
    const drop = h * 0.03; // crown camber
    const Rc = R - drop - rs; // shoulder arc centre radius
    const yLow = yL - flt * 0.1; // sidewall meets the flange top here
    const rLow = ri + fh * 1.08;
    const yTop = tc + rs;
    const bulge = Math.max(0, hw - (yTop + yLow) / 2);
    const arcEnd = tc + (rs * Math.PI) / 2; // arc length where the shoulder turns into sidewall
    /** Crown + shoulder surface at arc length s from the centreline (s ≤ arcEnd). */
    const surf = (s: number): Surf => {
      if (s <= tc) {
        const k = (2 * drop * s) / (tc * tc);
        const l = Math.hypot(k, 1);
        return { y: s, r: R - drop * (s / tc) ** 2, ny: -k / l, nr: -1 / l };
      }
      const th = Math.PI / 2 - (s - tc) / rs;
      return {
        y: tc + rs * Math.cos(th),
        r: Rc + rs * Math.sin(th),
        ny: -Math.cos(th),
        nr: -Math.sin(th),
      };
    };
    const blockEnd = tc + rs * (Math.PI / 2 - 0.3); // shoulder blocks wrap to ~17° above the side
    /** Tread sink at arc length s: full depth under the blocks, fading out down the shoulder. */
    const sinkAt = (s: number): number => td * (1 - smooth((s - blockEnd) / (arcEnd - blockEnd)));

    /** Half tyre section (y ≥ 0) as (r, y): crown centre → shoulder → sidewall → bead. */
    const half = (crown: number[], arc: number, side: number): Vec2[] => {
      const out: Vec2[] = [];
      const crownAt = (s: number): void => {
        const q = surf(s);
        const d = sinkAt(s);
        out.push([q.r + q.nr * d, q.y + q.ny * d]);
      };
      for (const f of crown) crownAt(f * tc);
      for (let j = 1; j <= arc; j++) crownAt(tc + ((rs * Math.PI) / 2) * (j / arc));
      for (let j = 1; j <= side; j++) {
        const u = j / side;
        out.push([lerp(Rc, rLow, u), lerp(yTop, yLow, u) + bulge * Math.sin(Math.PI * u) ** 0.8]);
      }
      if (lod < 2) {
        out.push([ri + fh * 0.8, rimHalf + flt * 0.35]);
        out.push([ri + fh * 0.3, rimHalf - flt * 0.05]);
      }
      out.push([ri, rimHalf * 0.97]);
      return out;
    };
    /** Closed counter-clockwise (r, y) loop from a half section: −Y bead → crown → +Y bead. */
    const mirrorLoop = (hv: Vec2[]): Vec2[] => {
      const neg = hv.map(([r, y]): Vec2 => [r, -y]).reverse();
      const pos = hv[0]?.[1] === 0 ? hv.slice(1) : hv;
      const loop = [...neg, ...pos];
      loop.push(loop[0] ?? [ri, -rimHalf]);
      return loop;
    };
    const tyreHalf =
      lod === 0
        ? half(td > 0 ? [0, 0.14, 0.27, 0.57, 0.7, 1] : [0, 0.5, 1], 4, 6)
        : lod === 1
          ? half([0, 1], 4, 5)
          : half([1], 1, 2);
    const parts: Mesh[] = [
      lathe({
        profile: mirrorLoop(tyreHalf),
        segments: seg,
        axis: 'y',
        color: RUBBER,
        strip: 'rubber',
      }),
    ];
    if (td > 0) parts.push(...tread());

    // ---- Rim: lips, flanges, bead seats, drop well; barrel wall inside ----
    const rimLoop: Vec2[] =
      lod === 2
        ? // Outer lip only, as a closed ring: the barrel is hidden inside the tyre at distance.
          [
            [ri - t, -yL],
            [ri + fh, -yL],
            [ri + fh, -rimHalf],
            [ri - t, -rimHalf],
            [ri - t, -yL],
          ]
        : [
            [ri - t, -yL],
            [ri + fh - lr, -yL],
            [ri + fh - lr * 0.3, -yL + lr * 0.3],
            [ri + fh, -yL + lr],
            [ri + fh * 0.9, -rimHalf],
            [ri + fh * 0.3, -rimHalf + flt * 0.1],
            [ri, -rimHalf + bs * 0.4],
            [ri + fh * 0.12, -rimHalf + bs * 0.8], // safety hump
            [ri, -rimHalf + bs],
            [ri - wd, -rimHalf + bs + wd],
            [ri - wd, rimHalf * 0.25],
            [ri, rimHalf * 0.25 + wd],
            [ri, rimHalf - bs * 0.4],
            [ri + fh * 0.3, rimHalf - flt * 0.1],
            [ri + fh * 0.9, rimHalf],
            [ri + fh, yL - lr],
            [ri + fh - lr * 0.3, yL - lr * 0.3],
            [ri + fh - lr, yL],
            [ri - t, yL],
            [ri - t, rimHalf * 0.25 + wd],
            [ri - t - wd, rimHalf * 0.25],
            [ri - t - wd, -rimHalf + bs + wd],
            [ri - t, -rimHalf + bs],
            [ri - t, -yL],
          ];
    parts.push(
      lathe({ profile: rimLoop, segments: seg, axis: 'y', color: STEEL, strip: 'aluminium' }),
    );

    // ---- Face: hub pad + centre cap, spokes or a dished disc ----
    const hubSeg = b.pick([32, 20, 12]);
    const yPad = yHub + hw * 0.05;
    const capR = ri * 0.15;
    if (lod === 2) {
      // One dished disc from the lip to a flat hub: reads as a wheel face at distance.
      parts.push(
        lathe({
          profile: [
            [hubR, yPad],
            [ri - t, -yL],
          ],
          segments: seg,
          axis: 'y',
          caps: true,
          color: STEEL,
          strip: 'aluminium',
        }),
      );
      return merge(parts);
    }
    parts.push(
      lathe({
        profile: [
          [hubR - hw * 0.03, yPad],
          [hubR, yPad + hw * 0.03],
          [hubR, yPad + hw * 0.4],
        ],
        segments: hubSeg,
        axis: 'y',
        caps: true,
        color: STEEL,
        strip: 'aluminium',
      }),
      lathe({
        profile: [
          [capR * 0.75, yPad - hw * 0.06],
          [capR * 0.95, yPad - hw * 0.05],
          [capR, yPad - hw * 0.03],
          [capR, yPad + hw * 0.01],
        ],
        segments: hubSeg,
        axis: 'y',
        caps: true,
        color: DARK_STEEL,
        strip: 'rubber',
      }),
    );
    if (p.spokes === 0) {
      // Pressed disc: dished from the lip down to the hub, a stiffening step half way.
      const yr = -yL + flt * 0.3;
      parts.push(
        lathe({
          profile: [
            [hubR * 0.95, yPad + hw * 0.02],
            [lerp(hubR, ri - t, 0.45), lerp(yHub, yr, 0.55)],
            [lerp(hubR, ri - t, 0.55), lerp(yHub, yr, 0.75)],
            [ri - t * 0.5, yr],
            [ri - t * 0.5, yr + hw * 0.06],
            [lerp(hubR, ri - t, 0.55), lerp(yHub, yr, 0.75) + hw * 0.06],
            [lerp(hubR, ri - t, 0.45), lerp(yHub, yr, 0.55) + hw * 0.06],
            [hubR * 0.95, yPad + hw * 0.08],
            [hubR * 0.95, yPad + hw * 0.02],
          ],
          segments: seg,
          axis: 'y',
          color: STEEL,
          strip: 'aluminium',
        }),
      );
    } else {
      const spoke = spokeMesh(p.spokes);
      for (let i = 0; i < p.spokes; i++)
        parts.push(place(spoke, { pitch: (i / p.spokes) * Math.PI * 2 }));
    }
    if (lod === 0) {
      // Lug nuts on the PCD, in the pockets between spokes.
      const lugs = p.spokes >= 4 && p.spokes <= 6 ? p.spokes : 5;
      const off = p.spokes === lugs ? 0.5 : 0;
      const nut = cylinder({
        radius: ri * 0.042,
        length: hw * 0.16,
        segments: 6,
        axis: 'y',
        at: [0, yPad - hw * 0.05, ri * 0.25],
        color: ZINC,
        strip: 'aluminium',
      });
      for (let i = 0; i < lugs; i++)
        parts.push(place(nut, { pitch: ((i + off) / lugs) * Math.PI * 2 }));
    }
    return merge(parts);

    /** One tapered, concave alloy spoke along +Z from the hub into the barrel. */
    function spokeMesh(n: number): Mesh {
      const z0 = hubR * 0.85;
      const z1 = ri - t * 0.3;
      const aHub = Math.min(ri * 0.1, (0.6 * Math.PI * z0) / n);
      const aRim = Math.min(ri * 0.15, (0.5 * Math.PI * z1) / n);
      const aFlare = Math.min(aRim * 1.8, (0.85 * Math.PI * z1) / n);
      const yFront = -yL + flt * 0.35;
      const steps = lod === 0 ? [0, 0.15, 0.3, 0.45, 0.6, 0.72, 0.84, 0.93, 1] : [0, 0.5, 0.85, 1];
      const rings = steps.map((s): Vec3[] => {
        const z = lerp(z0, z1, s);
        const a = lerp(aHub, aRim, s) + (aFlare - aRim) * smooth((s - 0.7) / 0.3) ** 2;
        const yf = yFront + dish * (1 - s ** 1.8);
        const d = lerp(hw * 0.5, hw * 0.3, s);
        const ab = a * 0.72; // draft: the back is narrower than the face
        const c = Math.min(a * 0.35, d * 0.25);
        const ring: Vec2[] = [
          [-a + c, yf],
          [a - c, yf],
          [a, yf + c],
          [ab, yf + d - c],
          [ab - c, yf + d],
          [-ab + c, yf + d],
          [-ab, yf + d - c],
          [-a, yf + c],
        ];
        return ring.map(([x, y]): Vec3 => [x, y, z]);
      });
      return loft({
        rings,
        color: STEEL,
        strip: 'aluminium',
        capStart: true,
        capEnd: true,
      });
    }

    /** Tread blocks on the sunk crown: centre rib, notched intermediate ribs, shoulder blocks. */
    function tread(): Mesh[] {
      const pitches = Math.min(64, Math.max(24, Math.round((2 * Math.PI * R) / 0.032)));
      const P = (2 * Math.PI * R) / pitches;
      const sink = td + (P * P) / (8 * (R - td)) + td * 0.15; // flat blocks still bed in
      /** Cross-section (y, r) of a rib from s0 to s1, k samples, mirrored to −Y when `neg`. */
      const section = (s0: number, s1: number, k: number, neg: boolean): Vec2[] => {
        const top: Vec2[] = [];
        const bot: Vec2[] = [];
        for (let i = 0; i <= k; i++) {
          const q = surf(lerp(s0, s1, i / k));
          const d = sink - (td - sinkAt(lerp(s0, s1, i / k)));
          top.push([q.y, q.r]);
          bot.push([q.y + q.ny * d, q.r + q.nr * d]);
        }
        const loop = [...top, ...bot.reverse()];
        return neg ? loop.map(([y, r]): Vec2 => [-y, r]).reverse() : loop;
      };
      const ribBlock = (s0: number, s1: number, k: number, len: number, neg: boolean): Mesh =>
        prism({
          profile: section(s0, s1, k, neg),
          depth: len,
          plane: 'yz',
          color: RUBBER,
          strip: 'rubber',
        });
      const out: Mesh[] = [];
      // Continuous centre rib: a ring, chamfered at the groove edges.
      const c0 = tc * 0.14;
      const ch = td * 0.25;
      const rb = R - sink;
      out.push(
        lathe({
          profile: [
            [rb, -c0],
            [R - ch, -c0],
            [R, -c0 + ch],
            [R, c0 - ch],
            [R - ch, c0],
            [rb, c0],
            [rb, -c0],
          ],
          segments: seg,
          axis: 'y',
          color: RUBBER,
          strip: 'rubber',
        }),
      );
      const slant = 0.35;
      for (const neg of [false, true]) {
        const sgn = neg ? -1 : 1;
        // Intermediate blocks slant about their own centre: the two sides make a V (directional).
        const yc = sgn * tc * 0.42;
        const mid = place(
          place(ribBlock(tc * 0.27, tc * 0.57, 1, P * 0.8, neg), { at: [0, -yc, 0] }),
          {
            yaw: sgn * slant,
            at: [0, yc, 0],
          },
        );
        const shoulder = ribBlock(tc * 0.7, blockEnd, 3, P * 0.68, neg);
        for (let i = 0; i < pitches; i++) {
          const a = (i / pitches) * Math.PI * 2;
          out.push(place(mid, { pitch: a }));
          out.push(place(shoulder, { pitch: a + (P * 0.5) / R }));
        }
      }
      return out;
    }
  },
});
