// Jupiter tender: riveted iron tank in Caledonian blue on a wooden frame, flared coping with a red
// "C.P.R.R." band, a red "JUPITER" panel in gold, red sill stripes, a pine wood box on the deck,
// oak end sills; two blue arch-bar trucks with brass-lidded journal boxes and red plate wheels.

import {
  type BuildContext,
  type Mesh,
  MeshBuilder,
  merge,
  place,
  stripRect,
  text,
  type Vec3,
} from '@developerz.ai/ts23d';
import type { Gear } from './running-gear.ts';
import { bx, F, type Finish, type Layout, lath, RAIL_TOP, support, TENDER_R } from './shared.ts';

const BODY_W = 2.4;
const BODY_H = 1.15;
/** The coping flares 20 cm outward over its 32 cm height (the collar that keeps the wood in). */
const FLARE_OUT = 0.2;
const FLARE_H = 0.32;
const FLARE_LEN = Math.hypot(FLARE_OUT, FLARE_H);
/** Sheet thickness of the coping, seen as its top edge. */
const SHEET = 0.035;

/** A flat quad a → b → c → d (counter-clockwise seen from outside) in one finish. */
function quad(b: MeshBuilder, pts: readonly [Vec3, Vec3, Vec3, Vec3], f: Finish): void {
  const [p0, p1, , p3] = pts;
  const u: Vec3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const v: Vec3 = [p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]];
  const c: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const l = Math.hypot(c[0], c[1], c[2]) || 1;
  const n: Vec3 = [c[0] / l, c[1] / l, c[2] / l];
  const r = stripRect(f.strip);
  const uv: [number, number] = [(r.u0 + r.u1) / 2, (r.v0 + r.v1) / 2];
  const ids = pts.map((p) => b.vertex({ p, n, uv, color: f.color }));
  b.quad(ids[0] ?? 0, ids[1] ?? 0, ids[2] ?? 0, ids[3] ?? 0);
}

/**
 * The flared coping as one mitred collar round the tank top: the rear and both sides lean
 * outward, the front board stands upright behind the cab. Outer skin, inner skin and the sheet's
 * top edge; `bands` adds the red band on each side's outer face (3 mm proud).
 */
function coping(x0: number, x1: number, z: number, bands: boolean): Mesh {
  const hw = BODY_W / 2;
  const b = new MeshBuilder();
  /** Ring at height fraction t, inset by `inset` metres (the inner skin). Rear-left first. */
  const ring = (t: number, inset: number): [Vec3, Vec3, Vec3, Vec3] => {
    const o = FLARE_OUT * t - inset;
    return [
      [x0 - o, hw + o, z + FLARE_H * t],
      [x0 - o, -hw - o, z + FLARE_H * t],
      [x1 - inset, -hw - o, z + FLARE_H * t],
      [x1 - inset, hw + o, z + FLARE_H * t],
    ];
  };
  const [lo, hi, loIn, hiIn] = [ring(0, 0), ring(1, 0), ring(0, SHEET), ring(1, SHEET)];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const at = (r: readonly Vec3[], k: number): Vec3 => r[k] ?? [0, 0, 0];
    quad(b, [at(lo, i), at(lo, j), at(hi, j), at(hi, i)], F.blueSteel);
    quad(b, [at(loIn, j), at(loIn, i), at(hiIn, i), at(hiIn, j)], F.blueSteel);
    quad(b, [at(hi, i), at(hi, j), at(hiIn, j), at(hiIn, i)], F.blueSteel);
  }
  if (bands)
    for (const s of [1, -1]) {
      // Red band on the flare's outer face, from 14 % to 86 % of its height.
      const on = (x: number, t: number): Vec3 => {
        const lift = 0.003;
        return [
          x,
          s * (hw + FLARE_OUT * t + (lift * FLARE_H) / FLARE_LEN),
          z + FLARE_H * t - (lift * FLARE_OUT) / FLARE_LEN,
        ];
      };
      const [xa, xb] = s > 0 ? [x0 + 0.25, x1 - 0.3] : [x1 - 0.3, x0 + 0.25];
      quad(b, [on(xb, 0.14), on(xa, 0.14), on(xa, 0.86), on(xb, 0.86)], F.redSteel);
    }
  return b.build();
}

export function buildTender(ctx: BuildContext, L: Layout, gear: Gear, name: string): void {
  const { lod, tenderFront: xf, tenderRear: xr } = L;
  ctx.group('tender');
  const len = xf - xr;
  const tz = RAIL_TOP + TENDER_R * 2 + 0.22;
  const zb = tz + 0.2;
  const zt = zb + BODY_H;
  const cx = (xf + xr) / 2;
  const trucks = [xf - 1.25, xr + 1.25];
  const m: Mesh[] = [
    // Oak frame with blue-painted sill faces, the tank above it.
    bx(xf, xr, -1.25, 1.25, tz, tz + 0.2, F.blueWood),
    bx(xf - 0.1, xr + 0.05, -BODY_W / 2, BODY_W / 2, zb, zt, F.blueSteel),
    bx(xf + 0.25, xf, -0.25, 0.25, tz + 0.02, tz + 0.17, F.castIron),
  ];
  for (const x of trucks)
    m.push(
      bx(x - 0.2, x + 0.2, -0.5, 0.5, RAIL_TOP + TENDER_R - 0.02, tz + 0.02, F.blueSteel),
      ...[0.45, -0.45].flatMap((dx) =>
        [1, -1].map((s) => support(lod, x + dx, RAIL_TOP + TENDER_R, s, 0.45)),
      ),
    );
  // The flared collar is the tender's outline: every LOD carries it (the band from the mid LOD).
  m.push(coping(xr + 0.05, xf - 0.1, zt, lod < 2));
  if (lod < 2) {
    for (const s of [1, -1]) {
      const face = s * (BODY_W / 2);
      m.push(
        // Red sill stripes along the frame.
        ...[0, 1, 2, 3].map((i) =>
          bx(
            xr + 0.25 + i * 1.35,
            xr + 1.35 + i * 1.35,
            face + s * 0.05,
            face + s * 0.06,
            tz + 0.06,
            tz + 0.14,
            F.redSteel,
          ),
        ),
        // JUPITER panel: red, gold edged.
        bx(cx - 1.6, cx + 1.4, face, face + s * 0.012, zb + 0.28, zb + 0.9, F.brass),
        bx(
          cx - 1.57,
          cx + 1.37,
          face + s * 0.012,
          face + s * 0.016,
          zb + 0.31,
          zb + 0.87,
          F.redSteel,
        ),
      );
      if (lod === 0) {
        m.push(
          text(name, {
            // On the red field (face + 16 mm): the decal's 2 mm lift is the whole gap (QA
            // connections: letters 4 mm off the field).
            origin: [cx - 0.1, face + s * 0.016, zb + 0.4],
            along: [-s, 0, 0],
            height: 0.36,
            align: 'centre',
            maxWidth: 2.7,
            ...F.brass,
          }),
          text('C.P.R.R.', {
            // On the red coping band's outer face (3 mm proud of the flare) a third of the way
            // up it; the decal's own 2 mm lift is all the gap there is.
            origin: [
              cx + 0.05,
              s * (BODY_W / 2 + FLARE_OUT * 0.3 + (0.003 * FLARE_H) / FLARE_LEN),
              zt + FLARE_H * 0.3 - (0.003 * FLARE_OUT) / FLARE_LEN,
            ],
            along: [-s, 0, 0],
            up: [0, (s * FLARE_OUT) / FLARE_LEN, FLARE_H / FLARE_LEN],
            height: 0.13,
            align: 'centre',
            ...F.brass,
          }),
          // Gold lines above and below the panel.
          bx(xr + 0.3, xf - 0.3, face, face + s * 0.008, zb + 1.0, zb + 1.015, F.brass),
          bx(xr + 0.3, xf - 0.3, face, face + s * 0.008, zb + 0.16, zb + 0.175, F.brass),
        );
        // Rivet rows: along the top seam, the bottom seam and the vertical end seams.
        // Snap heads 36 mm across, their paint rubbed a shade lighter than the sheet.
        const head = lath({
          profile: [
            [0.018, 0],
            [0.014, 0.009],
            [0, 0.013],
          ],
          segments: 5,
          ...F.blueSteel,
          color: [
            F.blueSteel.color[0] * 1.7,
            F.blueSteel.color[1] * 1.7,
            F.blueSteel.color[2] * 1.5,
          ],
        });
        const onSide = (x: number, zz: number): Mesh =>
          place(head, { at: [x, face, zz], roll: s > 0 ? -Math.PI / 2 : Math.PI / 2 });
        for (let i = 0; i < 46; i++) {
          const x = xr + 0.15 + i * ((len - 0.4) / 45);
          m.push(onSide(x, zb + 0.06), onSide(x, zt - 0.05));
        }
        for (const x of [xr + 0.09, xf - 0.16])
          for (let k = 0; k < 9; k++) m.push(onSide(x, zb + 0.12 + k * 0.11));
      }
    }
    // The rear end sill (oak) with a coupler pocket.
    m.push(
      bx(xr - 0.08, xr, -1.2, 1.2, tz - 0.15, tz + 0.2, F.oak),
      bx(xr - 0.3, xr - 0.08, -0.12, 0.12, tz - 0.05, tz + 0.1, F.castIron),
    );
    // Deck: water hatch at the rear, the pine wood box at the front.
    m.push(
      lath({
        profile: [
          [0.3, 0],
          [0.3, 0.12],
          [0.33, 0.14],
          [0, 0.16],
        ],
        segments: ctx.pick([16, 10, 6]),
        at: [xr + 0.9, 0, zt],
        caps: true,
        ...F.blueSteel,
      }),
      bx(xf - 0.25, xf - 1.6, -1.0, 1.0, zt, zt + 0.35, F.pine),
      bx(xf - 0.2, xf - 1.65, -1.05, 1.05, zt + 0.35, zt + 0.4, F.pine),
    );
    // Arch-bar trucks: top arch, bottom bar, column posts, journal boxes with brass lids.
    for (const x of trucks)
      for (const s of [1, -1]) {
        const y = s * 1.0;
        const za = RAIL_TOP + TENDER_R;
        m.push(
          bx(x - 0.75, x + 0.75, y - 0.04, y + 0.04, za + 0.12, za + 0.18, F.blueSteel),
          bx(x - 0.6, x + 0.6, y - 0.04, y + 0.04, za - 0.2, za - 0.14, F.blueSteel),
          bx(x - 0.22, x - 0.16, y - 0.04, y + 0.04, za - 0.14, za + 0.12, F.blueSteel),
          bx(x + 0.16, x + 0.22, y - 0.04, y + 0.04, za - 0.14, za + 0.12, F.blueSteel),
          // Bolster end between the columns, tying the truck side to the centre.
          bx(x - 0.035, x + 0.035, s * 0.45, y, za - 0.1, za + 0.02, F.blueSteel),
        );
        for (const dx of [0.45, -0.45]) {
          m.push(
            bx(x + dx - 0.13, x + dx + 0.13, y - 0.1, y + 0.1, za - 0.14, za + 0.12, F.blueSteel),
            bx(
              x + dx - 0.1,
              x + dx + 0.1,
              y + s * 0.1,
              y + s * 0.11,
              za - 0.08,
              za + 0.06,
              F.brass,
            ),
          );
          // Axle stub through to the journal box (it sits outside the wheel).
          m.push(
            bx(
              x + dx - 0.05,
              x + dx + 0.05,
              s * 0.86,
              y - s * 0.1,
              za - 0.05,
              za + 0.05,
              F.castIron,
            ),
          );
        }
      }
  }
  ctx.part('tender_body', merge(m), { parent: 'tender' });
  trucks.forEach((tx, t) => {
    [0.45, -0.45].forEach((dx, a) => {
      gear.wheelset(`axle_tender_${t}_${a}`, tx + dx, TENDER_R, 'tender', null, 0, ['tender_body']);
    });
  });
}
