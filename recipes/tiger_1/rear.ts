// Tiger I rear (mid production, Oct–Nov 1943: Feifel air filters deleted, armoured exhaust
// covers): engine deck (central engine hatch, mesh radiator grilles left and right, four round fan
// grilles), rear plate furniture (two tall vertical exhausts in their covers, starter-crank cover,
// jack, convoy and tail lights, tow pintle), hull side plates standing proud of the rear plate,
// hinged rear mudguards. Sources: recipes/tiger_1/README.md "Rear".

import {
  beam,
  box,
  cylinder,
  type Lod,
  lathe,
  type Mesh,
  place,
  planar,
  prism,
  type Vec3,
} from '@developerz.ai/ts23d';

export interface RearSpec {
  readonly lod: Lod;
  readonly deck: number;
  readonly pannierZ: number;
  readonly rearLow: number;
  readonly sideY: number;
  /** x of the rear plate surface at height z. */
  readonly rearX: (z: number) => number;
  readonly paint: Vec3;
  readonly dark: Vec3;
  readonly steel: Vec3;
  readonly rust: Vec3;
  readonly black: Vec3;
  readonly red: Vec3;
}

/** Engine deck between the turret ring and the rear plate (hull structure dressing). */
export function engineDeck(o: RearSpec): Mesh[] {
  const { deck: z, lod, paint, dark, black } = o;
  const segs = [16, 10, 6][lod] ?? 6;
  const out: Mesh[] = [
    // Central engine access hatch with its lifting handles.
    box({ size: [1.1, 0.72, 0.04], at: [-2.15, 0, z], color: paint }),
  ];
  for (const s of [1, -1]) {
    // Radiator intake grilles: raised frame over a dark recess, mesh bars across.
    out.push(box({ size: [0.95, 0.85, 0.05], at: [-1.95, s * 0.93, z], color: dark }));
    if (lod < 2)
      out.push(box({ size: [0.85, 0.75, 0.005], at: [-1.95, s * 0.93, z + 0.05], color: black }));
    // Two round cooling-fan grilles per side behind the radiators.
    for (const y of [0.52, 1.12]) {
      out.push(
        lathe({
          profile: [
            [0.25, 0],
            [0.25, 0.045],
            [0.21, 0.045],
            [0.21, 0.02],
            [0, 0.02],
          ],
          segments: segs * 2,
          at: [-2.72, s * y, z],
          color: dark,
        }),
      );
      if (lod === 0)
        for (const a of [0, Math.PI / 3, (2 * Math.PI) / 3])
          out.push(
            place(box({ size: [0.42, 0.018, 0.025], color: dark }), {
              at: [-2.72, s * y, z + 0.02],
              yaw: a,
            }),
          );
    }
    if (lod === 0) {
      for (let k = 0; k < 9; k++)
        out.push(
          box({
            size: [0.85, 0.014, 0.02],
            at: [-1.95, s * (0.93 - 0.36 + k * 0.09), z + 0.05],
            color: dark,
          }),
        );
      out.push(
        beam({
          from: [-2.6, s * 0.2, z + 0.04],
          to: [-2.6, s * 0.2, z + 0.1],
          width: 0.02,
          color: o.steel,
        }),
        beam({
          from: [-1.7, s * 0.2, z + 0.04],
          to: [-1.7, s * 0.2, z + 0.1],
          width: 0.02,
          color: o.steel,
        }),
      );
    }
  }
  return out;
}

/** Hull side plates standing ~7 cm proud of the inclined rear plate (interlocked construction). */
export function sideExtensions(o: RearSpec): Mesh[] {
  const ext = (z0: number, z1: number): Mesh =>
    prism({
      profile: [
        [o.rearX(z0) + 0.02, z0],
        [o.rearX(z1) + 0.02, z1],
        [o.rearX(z1) - 0.07, z1],
        [o.rearX(z0) - 0.07, z0],
      ],
      depth: 0.08,
      plane: 'xz',
      color: o.paint,
    });
  const out: Mesh[] = [];
  for (const s of [1, -1])
    out.push(
      place(ext(o.pannierZ, o.deck), { at: [0, s * (o.sideY - 0.04), 0] }),
      place(ext(o.rearLow + 0.02, o.pannierZ), { at: [0, s * 0.96, 0] }),
    );
  return out;
}

/** Exhaust x/y and heights: pipe leaves the plate at `stubZ`, rises to `top`. */
export const exhaustAt = (
  o: RearSpec,
  s: number,
): { x: number; y: number; stubZ: number; top: number } => ({
  x: o.rearX(1.3) - 0.17,
  y: s * 0.55,
  stubZ: 1.3,
  top: o.deck + 0.3,
});

/** Rear plate furniture: exhausts in armoured covers, crank cover, jack, lights, pintle. */
export function rearPlate(o: RearSpec): Mesh[] {
  const { lod, paint, dark, steel, rust } = o;
  const segs = [14, 8, 6][lod] ?? 6;
  const out: Mesh[] = [];
  for (const s of [1, -1]) {
    const e = exhaustAt(o, s);
    out.push(
      // Elbow stub out of the plate, then the tall vertical pipe with a flared mouth.
      beam({
        from: [o.rearX(e.stubZ) + 0.02, e.y, e.stubZ],
        to: [e.x, e.y, e.stubZ],
        width: 0.15,
        segments: segs,
        color: rust,
      }),
      lathe({
        profile: [
          [0.085, 0],
          [0.085, e.top - e.stubZ - 0.05],
          [0.1, e.top - e.stubZ],
          [0.075, e.top - e.stubZ],
        ],
        segments: segs,
        at: [e.x, e.y, e.stubZ - 0.08],
        color: rust,
      }),
    );
    if (lod < 2) {
      // Armoured exhaust cover: a three-sided shroud from the plate round the pipe, open on top.
      const h = e.top - 0.06 - (e.stubZ + 0.06);
      const z0 = e.stubZ + 0.06;
      const back = o.rearX(z0 + h / 2);
      out.push(
        box({ size: [0.025, 0.3, h], at: [e.x - 0.12, e.y, z0], color: paint }),
        box({
          size: [back - (e.x - 0.13), 0.025, h],
          at: [(back + e.x - 0.13) / 2, e.y + 0.14, z0],
          color: paint,
        }),
        box({
          size: [back - (e.x - 0.13), 0.025, h],
          at: [(back + e.x - 0.13) / 2, e.y - 0.14, z0],
          color: paint,
        }),
      );
      if (lod === 0)
        // Heat slit and pipe clamp bands.
        out.push(
          box({ size: [0.03, 0.2, 0.025], at: [e.x - 0.125, e.y, z0 + h * 0.7], color: o.black }),
          cylinder({
            radius: 0.095,
            length: 0.03,
            segments: segs,
            at: [e.x, e.y, e.stubZ + 0.1],
            color: dark,
          }),
        );
    }
  }
  if (lod < 2) {
    // Starter-crank access cover (centre), tow pintle below, convoy light + tail light.
    out.push(
      lathe({
        profile: [
          [0.11, 0],
          [0.11, 0.03],
          [0.08, 0.05],
          [0, 0.05],
        ],
        segments: segs,
        axis: 'x',
        at: [o.rearX(1.25) + 0.02, 0, 1.25],
        color: paint,
      }),
      box({ size: [0.22, 0.24, 0.12], at: [o.rearX(1.0) - 0.06, 0, 0.94], color: steel }),
      box({ size: [0.06, 0.12, 0.1], at: [o.rearX(1.65) - 0.03, 0.95, 1.6], color: dark }),
      box({ size: [0.04, 0.08, 0.06], at: [o.rearX(1.65) - 0.04, -0.95, 1.62], color: o.red }),
    );
  }
  if (lod === 0)
    out.push(
      // Jack on its brackets across the upper plate.
      cylinder({
        radius: 0.08,
        length: 0.55,
        segments: 10,
        axis: 'y',
        at: [o.rearX(1.6) - 0.08, 0, 1.6],
        color: steel,
      }),
      box({ size: [0.05, 0.06, 0.08], at: [o.rearX(1.56) - 0.025, 0.22, 1.56], color: steel }),
      box({ size: [0.05, 0.06, 0.08], at: [o.rearX(1.56) - 0.025, -0.22, 1.56], color: steel }),
      // Pintle pin.
      cylinder({
        radius: 0.03,
        length: 0.2,
        segments: 8,
        at: [o.rearX(1.0) - 0.12, 0, 1.0],
        color: steel,
      }),
    );
  return out;
}

/** Hinged rear mudguards over the track ends, continuing the side fenders. */
export function rearMudguards(o: RearSpec, x0: number): Mesh[] {
  return [1, -1].map((s) =>
    planar({
      points: [
        // Hinge line tucked under the hull floor (welded to nothing, so no shared shell).
        [x0, s * 1.779, o.pannierZ - 0.003],
        [x0 - 0.34, s * 1.779, o.pannierZ - 0.15],
        [x0 - 0.34, s * 1.06, o.pannierZ - 0.15],
        [x0, s * 1.06, o.pannierZ - 0.003],
      ],
      color: o.paint,
      doubleSided: true,
    }),
  );
}
