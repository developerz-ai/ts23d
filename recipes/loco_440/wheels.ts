// Jupiter wheels in local space (axis Y, outer face +Y): cast-iron centres painted vermilion with
// a gold star on the hub, unpainted steel tyres; drivers spoked with a crescent counterweight,
// truck wheels plate-centred. The flange is a separate ring so the tread diameter measures true.

import {
  beam,
  cylinder,
  type Lod,
  type Mesh,
  merge,
  planar,
  prism,
  translate,
  type Vec2,
  type Vec3,
} from '@developerz.ai/ts23d';
import { F, lath, TREAD_W } from './shared.ts';

/** A five-point star, flush on a +Y face at `y`, radius `r`. */
function star(r: number, y: number): Mesh {
  const pts: Vec3[] = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const k = i % 2 ? r * 0.4 : r;
    pts.push([Math.cos(a) * k, y, Math.sin(a) * k]);
  }
  // planar wants CCW seen from its normal (+Y): reverse the X-Z order.
  return planar({ points: pts.reverse(), ...F.brass });
}

/** Tyre, rim, hub, spokes or plate, counterweight, star. */
export function wheelMesh(
  lod: Lod,
  r: number,
  y: number,
  spokes: number,
  crankAngle: number | null,
): Mesh {
  if (lod === 2)
    return cylinder({
      radius: r,
      length: TREAD_W,
      segments: 6,
      axis: 'y',
      at: [0, y, 0],
      ...F.redSteel,
    });
  const segs = (spokes > 0 ? [32, 14, 8] : [24, 10, 8])[lod] ?? 8;
  const h = TREAD_W / 2;
  const parts: Mesh[] = [
    // Steel tyre: a slight coning on the tread, chamfered outer arris. Closed (its bore too): the
    // cast centre is shrunk into it — QA connections found the open tyre and rim only meeting
    // along their edges, so every wheel centre, axle and the engine above hung loose.
    lath({
      profile: [
        [r - 0.065, y - h],
        [r - 0.004, y - h],
        [r, y - h + 0.012],
        [r, y + h - 0.012],
        [r - 0.006, y + h],
        [r - 0.065, y + h],
        [r - 0.065, y - h],
      ],
      segments: segs,
      axis: 'y',
      ...F.castIron,
    }),
    // Cast rim with a rounded inner lip, its outer face 7 mm up inside the tyre's bore.
    lath({
      profile: [
        [r - 0.058, y + 0.035],
        [r - 0.09, y + 0.03],
        [r - 0.11, y + 0.015],
        [r - 0.11, y - 0.03],
        [r - 0.058, y - 0.035],
        [r - 0.058, y + 0.035],
      ],
      segments: segs,
      axis: 'y',
      ...F.redSteel,
    }),
    // Hub boss with a raised face.
    lath({
      profile: [
        [0, y - 0.07],
        [r * 0.21, y - 0.07],
        [r * 0.21, y + 0.05],
        [r * 0.17, y + 0.075],
        [r * 0.1, y + 0.085],
        [0, y + 0.085],
      ],
      segments: Math.max(10, segs / 2),
      axis: 'y',
      ...F.redSteel,
    }),
  ];
  if (lod === 0) parts.push(star(r * 0.12, y + 0.087));
  if (spokes > 0) {
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      // Tapered spoke: wide at the hub, slimmer at the rim (two beams at LOD0).
      parts.push(
        beam({
          from: [c * r * 0.19, y, s * r * 0.19],
          to: [c * r * 0.55, y, s * r * 0.55],
          width: r * 0.075,
          height: 0.045,
          ...F.redSteel,
        }),
        beam({
          from: [c * r * 0.55, y, s * r * 0.55],
          to: [c * (r - 0.1), y, s * (r - 0.1)],
          width: r * 0.055,
          height: 0.04,
          ...F.redSteel,
        }),
      );
    }
  } else {
    // Plate centre, dished, for truck wheels.
    parts.push(
      lath({
        profile: [
          [r - 0.1, y - 0.02],
          [r * 0.21, y - 0.01],
          [r * 0.21, y + 0.03],
          [r - 0.1, y + 0.02],
        ],
        segments: segs,
        axis: 'y',
        ...F.redSteel,
      }),
    );
  }
  if (crankAngle !== null) {
    // Counterweight: a crescent between the spokes opposite the crank pin.
    const c = crankAngle + Math.PI;
    const arc = lod === 0 ? 10 : 5;
    const poly: Vec2[] = [];
    for (let i = 0; i <= arc; i++) {
      const a = c - 0.75 + (1.5 * i) / arc;
      poly.push([Math.cos(a) * (r - 0.1), Math.sin(a) * (r - 0.1)]);
    }
    for (let i = arc; i >= 0; i--) {
      const a = c - 0.45 + (0.9 * i) / arc;
      poly.push([Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42]);
    }
    parts.push(
      translate(prism({ profile: poly, depth: 0.07, plane: 'xz', ...F.redSteel }), [0, y, 0]),
    );
  }
  return merge(parts);
}

/** Flange ring on the inboard side of a tread (s = side sign). */
export const flangeMesh = (lod: Lod, r: number, y: number, s: number): Mesh =>
  lath({
    profile: [
      [r - 0.02, y - s * 0.028],
      [r + 0.028, y - s * 0.028],
      [r + 0.028, y],
      [r - 0.02, y],
    ],
    segments: [32, 16, 8][lod] ?? 8,
    axis: 'y',
    ...F.castIron,
  });
