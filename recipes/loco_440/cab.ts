// Jupiter cab: an open-backed wooden cab in Caledonian blue with vermilion window frames and roof
// edge, gold lining, a red-bordered "JUPITER" name panel, round front spectacle windows, an arched
// rear side opening, a green door, and a black backhead with brass fittings inside.

import {
  type BuildContext,
  type Mesh,
  merge,
  prism,
  text,
  translate,
  type Vec2,
} from '@developerz.ai/ts23d';
import { BOILER_Z, bx, DECK_Z, F, type Finish, type Layout, lath, pipe, SIDES } from './shared.ts';

const W = 2.5;
const H = 1.95;
const T = 0.06;
const SILL = 0.95;
const LINTEL = 1.6;

/** A frame (four bars) round a rectangle on a ±Y face. */
function frameY(
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  y: number,
  s: number,
  w: number,
  f: Finish,
): Mesh[] {
  const yo = y + s * 0.012;
  return [
    bx(x0 - w, x1 + w, y, yo, z0 - w, z0, f),
    bx(x0 - w, x1 + w, y, yo, z1, z1 + w, f),
    bx(x0 - w, x0, y, yo, z0, z1, f),
    bx(x1, x1 + w, y, yo, z0, z1, f),
  ];
}

export function buildCab(ctx: BuildContext, L: Layout, name: string): void {
  const { lod, cabFront: xf, cabRear: xr } = L;
  const len = xf - xr;
  const segs = ctx.pick([14, 8, 4]);
  const z = DECK_Z;
  const m: Mesh[] = [];
  const glass: Mesh[] = [];
  // Front window and the arched rear opening, along X on each side wall.
  const fw0 = xf - 1.05;
  const fw1 = xf - 0.2;
  const ar0 = xr + 0.18;
  const ar1 = xr + 0.98;
  const arcR = (ar1 - ar0) / 2;

  if (lod === 2) {
    m.push(bx(xf, xr, -W / 2, W / 2, z, z + H, F.blueWood));
  } else {
    for (const [, s] of SIDES) {
      const y = s * (W / 2 - T / 2);
      // Lower panel, then the upper wall as one profile with the window and arch notched out.
      m.push(bx(xf, xr, y - T / 2, y + T / 2, z, z + SILL, F.blueWood));
      const upper: Vec2[] = [[xr, SILL]];
      upper.push([ar0, SILL]);
      for (let i = 0; i <= segs; i++) {
        const a = Math.PI - (Math.PI * i) / segs;
        upper.push([ar0 + arcR + Math.cos(a) * arcR, LINTEL - arcR * 0.6 + Math.sin(a) * arcR]);
      }
      upper.push(
        [ar1, SILL],
        [fw0, SILL],
        [fw0, LINTEL],
        [fw1, LINTEL],
        [fw1, SILL],
        [xf, SILL],
        [xf, H],
        [xr, H],
      );
      m.push(translate(prism({ profile: upper, depth: T, plane: 'xz', ...F.blueWood }), [0, y, z]));
      const face = s * (W / 2);
      // Vermilion window frame and sash bar; glass in the front window.
      m.push(...frameY(fw0, fw1, z + SILL, z + LINTEL, face, s, 0.05, F.redWood));
      m.push(
        bx(fw0, fw1, face - s * 0.02, face - s * 0.01, z + SILL + 0.27, z + SILL + 0.31, F.redWood),
      );
      glass.push(bx(fw0, fw1, face - s * 0.035, face - s * 0.025, z + SILL, z + LINTEL, F.glass));
      // Red arch frame: verticals + a polyline round the head.
      const arch: [number, number, number][] = [[ar0, s * (W / 2 + 0.01), z + SILL]];
      for (let i = 0; i <= segs; i++) {
        const a = Math.PI - (Math.PI * i) / segs;
        arch.push([
          ar0 + arcR + Math.cos(a) * arcR,
          s * (W / 2 + 0.01),
          z + LINTEL - arcR * 0.6 + Math.sin(a) * arcR,
        ]);
      }
      arch.push([ar1, s * (W / 2 + 0.01), z + SILL]);
      m.push(...pipe(arch, 0.05, F.redWood, 4));
      // Name panel: red border, blue field, gold letters.
      const px = (xf + xr) / 2;
      m.push(
        bx(px - 0.85, px + 0.85, face, face + s * 0.012, z + 0.32, z + 0.78, F.redWood),
        bx(
          px - 0.75,
          px + 0.75,
          face + s * 0.012,
          face + s * 0.018,
          z + 0.38,
          z + 0.72,
          F.blueWood,
        ),
      );
      if (lod === 0)
        m.push(
          text(name, {
            origin: [px, face + s * 0.02, z + 0.45],
            along: [-s, 0, 0],
            height: 0.2,
            align: 'centre',
            maxWidth: 1.3,
            ...F.brass,
          }),
          // Gold lining round the lower panel and along the eaves.
          ...frameY(xr + 0.06, xf - 0.06, z + 0.12, z + SILL - 0.08, face, s, 0.015, F.brass),
          bx(xr + 0.05, xf - 0.05, face, face + s * 0.012, z + H - 0.12, z + H - 0.105, F.brass),
        );
      // Grab handle at the cab door post, its ends bent back into the post (QA connections: a
      // straight rail stood 2.5 cm clear of the wall on nothing).
      if (lod === 0)
        m.push(
          ...pipe(
            [
              [xr + 0.06, face - s * 0.01, z + 0.2],
              [xr + 0.06, face + s * 0.05, z + 0.2],
              [xr + 0.06, face + s * 0.05, z + 1.3],
              [xr + 0.06, face - s * 0.01, z + 1.3],
            ],
            0.03,
            F.brass,
          ),
        );
    }
    // Front wall with two round spectacle windows (red rims) either side of the boiler.
    m.push(bx(xf - T, xf, -W / 2, W / 2, z, z + H, F.blueWood));
    for (const s of [1, -1]) {
      m.push(
        lath({
          profile: [
            [0.2, 0],
            [0.2, 0.02],
            [0.15, 0.025],
            [0.15, 0.0],
          ],
          segments: segs * 2,
          axis: 'x',
          at: [xf, s * 0.85, z + 1.3],
          ...F.redWood,
        }),
      );
      glass.push(
        lath({
          profile: [
            [0.151, 0.008],
            [0, 0.008],
          ],
          segments: segs * 2,
          axis: 'x',
          at: [xf, s * 0.85, z + 1.3],
          ...F.glass,
        }),
      );
    }
    // Green door in the front wall on the fireman's side, opening onto the running board.
    m.push(bx(xf, xf + 0.02, -1.2, -0.75, z + 0.2, z + 0.85, F.greenWood));
    // Backhead inside: black plate, firedoor, brass gauge glass, whistle valve.
    m.push(
      lath({
        profile: [
          [0.6, 0],
          [0.6, -0.04],
          [0, -0.04],
        ],
        segments: segs * 2,
        axis: 'x',
        at: [xf - T, 0, BOILER_Z],
        ...F.black,
      }),
      bx(xf - T - 0.08, xf - T - 0.04, -0.2, 0.2, BOILER_Z - 0.55, BOILER_Z - 0.2, F.castIron),
    );
    if (lod === 0)
      m.push(
        ...pipe(
          [
            [xf - T - 0.06, 0.3, BOILER_Z - 0.1],
            [xf - T - 0.06, 0.3, BOILER_Z + 0.25],
          ],
          0.035,
          F.brass,
        ),
        lath({
          profile: [
            [0.08, 0],
            [0.08, -0.04],
            [0, -0.05],
          ],
          segments: 12,
          axis: 'x',
          at: [xf - T - 0.04, -0.3, BOILER_Z + 0.3],
          ...F.brass,
        }),
      );
  }
  // Roof: a shallow arch with deep overhangs; vermilion, a gold-lined eave board each side.
  const roof: Vec2[] = Array.from({ length: 9 }, (_, i): Vec2 => {
    const a = Math.PI * (i / 8);
    return [Math.cos(a) * 1.4, Math.sin(a) * 0.22];
  });
  m.push(
    translate(prism({ profile: roof, depth: len + 0.5, plane: 'yz', ...F.redWood }), [
      (xf + xr) / 2,
      0,
      z + H,
    ]),
  );
  if (lod < 2)
    for (const s of [1, -1])
      m.push(bx(xf + 0.25, xr - 0.25, s * 1.33, s * 1.4, z + H - 0.12, z + H + 0.02, F.redWood));
  ctx.part('cab', merge(m), { parent: 'locomotive' });
  if (glass.length) ctx.part('cab_glass', merge(glass), { parent: 'locomotive', surface: 'glass' });
}
