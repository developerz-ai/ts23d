// Jupiter tender: riveted iron tank in Caledonian blue on a wooden frame, flared coping with a red
// "C.P.R.R." band, a red "JUPITER" panel in gold, red sill stripes, a pine wood box on the deck,
// oak end sills; two blue arch-bar trucks with brass-lidded journal boxes and red plate wheels.

import {
  type BuildContext,
  type Mesh,
  merge,
  place,
  prism,
  text,
  translate,
  type Vec2,
} from '@developerz.ai/ts23d';
import type { Gear } from './running-gear.ts';
import { bx, F, type Layout, lath, RAIL_TOP, support, TENDER_R } from './shared.ts';

const BODY_W = 2.4;
const BODY_H = 1.15;

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
  if (lod < 2) {
    for (const s of [1, -1]) {
      const face = s * (BODY_W / 2);
      // Flared coping: outward-leaning sheet round the top, red band on it.
      const flare: Vec2[] = [
        [s * (BODY_W / 2 - 0.04), 0],
        [s * (BODY_W / 2), 0],
        [s * (BODY_W / 2 + 0.12), 0.3],
        [s * (BODY_W / 2 + 0.08), 0.3],
      ];
      m.push(
        translate(prism({ profile: flare, depth: len - 0.35, plane: 'yz', ...F.blueSteel }), [
          cx - 0.02,
          0,
          zt,
        ]),
      );
      m.push(
        translate(
          prism({
            profile: [
              [s * (BODY_W / 2 + 0.012), 0.04],
              [s * (BODY_W / 2 + 0.105), 0.27],
              [s * (BODY_W / 2 + 0.115), 0.27],
              [s * (BODY_W / 2 + 0.022), 0.04],
            ],
            depth: len - 0.9,
            plane: 'yz',
            ...F.redSteel,
          }),
          [cx + 0.05, 0, zt],
        ),
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
            origin: [cx - 0.1, face + s * 0.018, zb + 0.4],
            along: [-s, 0, 0],
            height: 0.36,
            align: 'centre',
            maxWidth: 2.7,
            ...F.brass,
          }),
          text('C.P.R.R.', {
            origin: [cx + 0.05, s * (BODY_W / 2 + 0.048), zt + 0.1],
            along: [-s, 0, 0],
            up: [0, s * 0.37, 0.93],
            height: 0.13,
            align: 'centre',
            ...F.brass,
          }),
          // Gold lines above and below the panel.
          bx(xr + 0.3, xf - 0.3, face, face + s * 0.008, zb + 1.0, zb + 1.015, F.brass),
          bx(xr + 0.3, xf - 0.3, face, face + s * 0.008, zb + 0.16, zb + 0.175, F.brass),
        );
        // Rivet rows: along the top seam, the bottom seam and the vertical end seams.
        const head = lath({
          profile: [
            [0.012, 0],
            [0.009, 0.006],
            [0, 0.009],
          ],
          segments: 5,
          ...F.blueSteel,
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
    // Rear coping and the rear end sill (oak) with a coupler pocket.
    m.push(
      bx(xr + 0.05, xr + 0.12, -BODY_W / 2 - 0.08, BODY_W / 2 + 0.08, zt, zt + 0.3, F.blueSteel),
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
