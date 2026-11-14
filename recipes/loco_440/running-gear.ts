// Jupiter running gear: bar frames, brass-lagged cylinders with steam chests and cocks, guides,
// the four-wheel lead truck, every wheelset (spin), polished side rods (orbit), main rods (crank)
// and crossheads (piston) driven by the wheelsets' own crank pins, driver splashers. Rods are
// bright steel; frames and truck black enamel.

import {
  type BuildContext,
  beam,
  cylinder,
  grime,
  hex,
  type Mesh,
  merge,
  place,
  prism,
  translate,
  type Vec2,
  type Vec3,
} from '@developerz.ai/ts23d';
import {
  bx,
  CRANK,
  CYL_Z,
  DECK_Z,
  DRIVER_R,
  F,
  FRAME_Y,
  GAUGE,
  type Layout,
  LEAD_R,
  lath,
  pipe,
  RAIL_TOP,
  ROD_Y,
  SIDES,
  SPEED,
  support,
  TREAD_W,
} from './shared.ts';
import { flangeMesh, wheelMesh } from './wheels.ts';

const RAILS = ['track_rail_l', 'track_rail_r'];

/** A wheelset's crank on one side, in the locomotive frame at rest: what a rod is pinned to. */
export interface CrankPin {
  readonly wheelset: string;
  /** Axle centre and crank-pin centre (x, z matter; y is the wheelset's centre line). */
  readonly centre: Vec3;
  readonly pin: Vec3;
  /** The wheelset's spin rate, so every rod on it turns with it. */
  readonly rps: number;
}

/** Registers wheelsets; returns the names it made so rods can clear them. */
export interface Gear {
  readonly wheelsets: string[];
  readonly cranks: string[];
  /** Crank pins per side ('l' / 'r'), front wheelset first, in registration order. */
  readonly pins: ReadonlyMap<string, CrankPin[]>;
  wheelset(
    name: string,
    x: number,
    r: number,
    parent: string,
    crankAngle: number | null,
    spokes: number,
    clearOf: readonly string[],
  ): void;
}

export function gearOf(ctx: BuildContext): Gear {
  const lod = ctx.lod;
  const wheelsets: string[] = [];
  const cranks: string[] = [];
  const pins = new Map<string, CrankPin[]>(SIDES.map(([side]) => [side, []]));
  return {
    wheelsets,
    cranks,
    pins,
    wheelset(name, x, r, parent, crankAngle, spokes, clearOf) {
      const rps = SPEED / (2 * Math.PI * r);
      const z = RAIL_TOP + r;
      ctx.group(name, {
        at: [x, 0, z],
        parent,
        motion: { kind: 'spin', axis: [0, 1, 0], rps },
        clearOf: [...RAILS, ...clearOf],
      });
      wheelsets.push(name);
      const ty = GAUGE / 2 + TREAD_W / 2;
      for (const [side, s] of SIDES) {
        // Right-hand cranks lead the left by 90° (quartering).
        const ca = crankAngle === null ? null : crankAngle + (s > 0 ? 0 : Math.PI / 2);
        if (ca !== null)
          pins.get(side)?.push({
            wheelset: name,
            centre: [x, 0, z],
            pin: [x + Math.cos(ca) * CRANK, 0, z + Math.sin(ca) * CRANK],
            rps,
          });
        const w = wheelMesh(lod, r, 0, spokes, lod < 2 ? ca : null);
        ctx.part(
          `${name}_wheel_${side}`,
          grime(translate(s > 0 ? w : place(w, { yaw: Math.PI }), [0, s * ty, 0]), {
            ground: r * 0.9,
            groundStrength: 0.25,
          }),
          { parent: name },
        );
        if (lod < 2)
          ctx.part(`${name}_flange_${side}`, flangeMesh(lod, r, s * (GAUGE / 2), s), {
            parent: name,
          });
        if (ca !== null && lod < 2) {
          const c = `${name}_crank_${side}`;
          cranks.push(c);
          const cx = Math.cos(ca) * CRANK;
          const cz = Math.sin(ca) * CRANK;
          ctx.part(
            c,
            merge([
              cylinder({
                radius: 0.055,
                length: 0.24,
                segments: 10,
                axis: 'y',
                at: [cx, s * (ty + 0.14), cz],
                ...F.steel,
              }),
              // Crank-pin collar nut.
              cylinder({
                radius: 0.07,
                length: 0.03,
                segments: 6,
                axis: 'y',
                at: [cx, s * (ty + 0.27), cz],
                ...F.steel,
              }),
            ]),
            { parent: name },
          );
        }
      }
      if (lod < 2)
        ctx.part(
          `${name}_axle`,
          cylinder({ radius: 0.07, length: GAUGE + 0.1, segments: 10, axis: 'y', ...F.castIron }),
          { parent: name },
        );
    },
  };
}

/** Frame, cylinders, guides, lead truck frame: the non-moving under-works. */
export function buildFrame(ctx: BuildContext, L: Layout): void {
  const { lod, segs, cylX } = L;
  const m: Mesh[] = [];
  for (const s of [1, -1]) {
    // Bar frame: top bar, with pedestal jaws hanging round each driver bearing at LOD0/1.
    m.push(bx(L.beamX, L.cabRear, s * (FRAME_Y - 0.05), s * (FRAME_Y + 0.05), 0.9, 1.18, F.black));
  }
  // Buffer beam (wood, Caledonian blue, gold lined) and footplate deck.
  m.push(
    bx(L.beamX - 0.225, L.beamX + 0.025, -1.15, 1.15, 0.85, 1.17, F.blueWood),
    bx(L.cabFront + 0.15, L.cabRear - 0.15, -1.25, 1.25, DECK_Z - 0.12, DECK_Z, F.oak),
    // Firebox between the frames ahead of the cab, and its mud ring.
    bx(L.cabFront + 0.3, L.cabFront - 0.9, -0.5, 0.5, 1.0, 2.1, F.black),
    // Cross-stretcher that ties the frames to the boiler.
    bx(L.frontDriver + 1.05, L.frontDriver + 1.35, -0.55, 0.55, 1.18, 2.08, F.black),
  );
  if (lod < 2)
    for (const s of [1, -1])
      m.push(
        bx(L.beamX - 0.21, L.beamX + 0.01, s * 1.15, s * 1.155, 0.87, 1.15, F.brass),
        bx(L.beamX + 0.025, L.beamX + 0.03, s * 0.2, s * 1.1, 1.13, 1.145, F.brass),
        bx(L.beamX + 0.025, L.beamX + 0.03, s * 0.2, s * 1.1, 0.875, 0.89, F.brass),
      );
  for (const s of [1, -1]) {
    // Cylinder in polished brass lagging, cast-iron heads; saddle up to the smokebox.
    const y = s * ROD_Y;
    m.push(
      lath({
        profile: [
          [0.22, cylX - 0.5],
          [0.26, cylX - 0.46],
          [0.26, cylX + 0.46],
          [0.22, cylX + 0.5],
        ],
        segments: segs,
        axis: 'x',
        at: [0, y, CYL_Z],
        caps: true,
        ...F.brass,
      }),
      bx(
        cylX - 0.5,
        cylX + 0.5,
        s * FRAME_Y,
        s * (ROD_Y - 0.15),
        CYL_Z - 0.2,
        CYL_Z + 0.35,
        F.black,
      ),
      // Steam chest: a brass box over a blue base band.
      bx(cylX - 0.42, cylX + 0.42, y - 0.2, y + 0.2, CYL_Z + 0.2, CYL_Z + 0.3, F.blueSteel),
      bx(cylX - 0.4, cylX + 0.4, y - 0.18, y + 0.18, CYL_Z + 0.3, CYL_Z + 0.55, F.brass),
    );
    if (lod < 2)
      for (const dx of [-0.5, 0.5]) {
        const k = Math.sign(dx);
        // Cylinder head: cast-iron cover with a raised boss.
        m.push(
          lath({
            profile: [
              [0.23, 0],
              [0.23, k * 0.03],
              [0.12, k * 0.05],
              [0.06, k * 0.09],
              [0, k * 0.09],
            ],
            segments: segs,
            axis: 'x',
            at: [cylX + dx, y, CYL_Z],
            ...F.brass,
          }),
        );
      }
    if (lod === 0) {
      // Cylinder cocks: brass petcocks under each end with a drain pipe.
      for (const dx of [-0.4, 0.4])
        m.push(
          ...pipe(
            [
              [cylX + dx, y, CYL_Z - 0.24],
              [cylX + dx, y, CYL_Z - 0.36],
              [cylX + dx + 0.06, y, CYL_Z - 0.44],
            ],
            0.03,
            F.brass,
          ),
          cylinder({
            radius: 0.03,
            length: 0.06,
            segments: 8,
            axis: 'y',
            at: [cylX + dx, y, CYL_Z - 0.3],
            ...F.brass,
          }),
        );
      // Steam-chest cover bolts.
      for (let i = 0; i < 8; i++)
        for (const dy of [-0.15, 0.15])
          m.push(
            cylinder({
              radius: 0.012,
              length: 0.02,
              segments: 6,
              at: [cylX - 0.35 + i * 0.1, y + dy, CYL_Z + 0.56],
              ...F.brass,
            }),
          );
    }
  }
  for (const d of L.drivers)
    for (const s of [1, -1]) m.push(support(lod, d.x, RAIL_TOP + d.radius, s, FRAME_Y));
  ctx.part('frame', grime(merge(m), { ground: 1.2, groundStrength: 0.4 }), {
    parent: 'locomotive',
  });

  // Crosshead guides (polished bars above and below the crosshead path) on a black yoke.
  const g: Mesh[] = [];
  for (const s of [1, -1]) {
    for (const dz of [0.11, -0.11])
      g.push(
        bx(
          L.guideFront,
          L.guideRear,
          s * (ROD_Y - 0.03),
          s * (ROD_Y + 0.03),
          CYL_Z + dz - 0.02,
          CYL_Z + dz + 0.02,
          F.steel,
        ),
      );
    g.push(
      bx(
        L.guideRear - 0.04,
        L.guideRear + 0.04,
        s * (FRAME_Y - 0.025),
        s * (ROD_Y + 0.025),
        CYL_Z - 0.15,
        CYL_Z + 0.15,
        F.black,
      ),
    );
  }
  if (lod < 2) ctx.part('guides', merge(g), { parent: 'locomotive' });

  // Lead truck frame: side bars, bolster, and the axle bearings.
  if (L.leads.length) {
    const first = L.leads[0]?.x ?? 0;
    const last = L.leads[L.leads.length - 1]?.x ?? 0;
    const zt = RAIL_TOP + LEAD_R;
    const t: Mesh[] = [];
    for (const s of [1, -1]) {
      t.push(
        bx(
          L.truckX - (Math.abs(first - last) + 0.5) / 2,
          L.truckX + (Math.abs(first - last) + 0.5) / 2,
          s * 0.41,
          s * 0.49,
          zt - 0.09,
          zt + 0.09,
          F.black,
        ),
      );
      if (lod < 2)
        // Journal box at each axle end, a brass lid.
        for (const a of L.leads)
          t.push(
            bx(a.x - 0.12, a.x + 0.12, s * 0.38, s * 0.52, zt - 0.12, zt + 0.12, F.black),
            bx(a.x - 0.1, a.x + 0.1, s * 0.37, s * 0.53, zt + 0.12, zt + 0.14, F.brass),
          );
    }
    t.push(bx(L.truckX - 0.15, L.truckX + 0.15, -0.5, 0.5, zt - 0.05, zt + 0.4, F.black));
    t.push(
      ...L.leads.flatMap((a) =>
        [1, -1].map((s) => support(lod, a.x, RAIL_TOP + a.radius, s, 0.45)),
      ),
    );
    ctx.part('lead_truck', grime(merge(t), { ground: 0.8, groundStrength: 0.35 }), {
      parent: 'locomotive',
    });
  }
}

/** Driver splashers: a curved band over each driver with a brass beading, under the board. */
export function buildSplashers(ctx: BuildContext, L: Layout): void {
  if (L.lod === 2) return;
  const arc = L.lod === 0 ? 14 : 6;
  const m: Mesh[] = [];
  const band = (r0: number, r1: number, a0: number, a1: number): Vec2[] => {
    const out: Vec2[] = [];
    for (let i = 0; i <= arc; i++) {
      const a = a0 + ((a1 - a0) * i) / arc;
      out.push([Math.cos(a) * r1, Math.sin(a) * r1]);
    }
    for (let i = arc; i >= 0; i--) {
      const a = a0 + ((a1 - a0) * i) / arc;
      out.push([Math.cos(a) * r0, Math.sin(a) * r0]);
    }
    return out;
  };
  for (const d of L.drivers) {
    const zA = RAIL_TOP + DRIVER_R;
    for (const s of [1, -1]) {
      const y = s * (GAUGE / 2 + TREAD_W / 2);
      // Arc ends where it meets the running board above.
      const a0 = Math.PI / 2 - 0.9;
      m.push(
        translate(
          prism({
            profile: band(DRIVER_R + 0.05, DRIVER_R + 0.09, a0, Math.PI - a0),
            depth: 0.18,
            plane: 'xz',
            ...F.blueSteel,
          }),
          [d.x, y, zA],
        ),
        translate(
          prism({
            profile: band(DRIVER_R + 0.05, DRIVER_R + 0.095, a0, Math.PI - a0),
            depth: 0.02,
            plane: 'xz',
            ...F.brass,
          }),
          [d.x, y + s * 0.095, zA],
        ),
      );
    }
  }
  ctx.part('splashers', merge(m), { parent: 'locomotive' });
}

/**
 * Side rods (orbit: every point follows the crank pins), main rods (crank: big end on the front
 * pin, small end on the crosshead) and crossheads (piston, the exact slider-crank law), all read
 * from the wheelsets' own crank pins and rate so they cannot fall out of phase; cylinder steam.
 */
export function buildRods(ctx: BuildContext, L: Layout, gear: Gear): void {
  if (L.lod === 2) return;
  for (const [side, s] of SIDES) {
    const pins = gear.pins.get(side) ?? [];
    const front = pins[0];
    if (!front) continue;
    const yS = s * (GAUGE / 2 + TREAD_W + 0.1);
    const xs = pins.map((p) => p.pin[0]);
    const boss = (x: number, r: number, z = 0): Mesh =>
      cylinder({
        radius: r,
        length: 0.06,
        segments: L.lod === 0 ? 16 : 10,
        axis: 'y',
        at: [x, 0, z],
        ...F.steel,
      });
    const sideRod = merge([
      beam({
        from: [Math.min(...xs) - 0.08, 0, 0],
        to: [Math.max(...xs) + 0.08, 0, 0],
        width: 0.05,
        height: 0.11,
        ...F.steel,
      }),
      ...xs.map((x) => boss(x, 0.09)),
      // Brass oil cups on top of each rod end.
      ...(L.lod === 0
        ? xs.map((x) =>
            cylinder({ radius: 0.022, length: 0.05, segments: 8, at: [x, 0, 0.1], ...F.brass }),
          )
        : []),
    ]);
    const arm: Vec3 = [front.pin[0] - front.centre[0], 0, front.pin[2] - front.centre[2]];
    ctx.part(`rod_side_${side}`, sideRod, {
      parent: 'locomotive',
      at: [0, yS, front.pin[2]],
      motion: { kind: 'orbit', axis: [0, 1, 0], arm, hz: front.rps },
      clearOf: [
        ...gear.cranks,
        `rod_main_${side}`,
        ...gear.wheelsets.map((w) => `${w}_wheel_${side}`),
      ],
    });
    const crossX = (L.guideFront + L.guideRear) / 2;
    const small: Vec3 = [crossX, s * ROD_Y, CYL_Z];
    // The linkage seen from the small end (crosshead pin): big end on the front crank pin.
    const rel = (p: Vec3): Vec3 => [p[0] - small[0], 0, p[2] - small[2]];
    const linkage = {
      axis: [0, 1, 0] as Vec3,
      centre: rel(front.centre),
      pin: rel(front.pin),
      line: [1, 0, 0] as Vec3,
      hz: front.rps,
    };
    ctx.part(
      `crosshead_${side}`,
      merge([
        bx(-0.13, 0.13, -0.07, 0.07, -0.09, 0.09, F.steel),
        bx(-0.09, 0.09, -0.075, 0.075, -0.05, 0.05, F.brass),
        beam({
          from: [0, 0, 0],
          to: [L.cylX - 0.5 - crossX, 0, 0],
          width: 0.06,
          segments: 8,
          ...F.steel,
        }),
      ]),
      {
        parent: 'locomotive',
        at: small,
        motion: { kind: 'piston', ...linkage },
        clearOf: ['guides', 'frame', `rod_main_${side}`],
      },
    );
    const big = linkage.pin;
    ctx.part(
      `rod_main_${side}`,
      merge([
        beam({ from: [0, 0, 0], to: big, width: 0.05, height: 0.13, ...F.steel }),
        boss(big[0], 0.1, big[2]),
        boss(0, 0.075),
      ]),
      {
        parent: 'locomotive',
        at: small,
        motion: { kind: 'crank', ...linkage },
        clearOf: [
          ...gear.cranks,
          `crosshead_${side}`,
          'guides',
          `rod_side_${side}`,
          ...gear.wheelsets.map((w) => `${w}_wheel_${side}`),
        ],
      },
    );
    ctx.emitter(`cylinder_steam_${side}`, {
      kind: 'steam',
      at: [L.cylX + 0.5, s * ROD_Y, CYL_Z - 0.2],
      dir: [0.3, s * 0.6, -0.3],
      rate: 25,
      life: 1.2,
      size: [0.15, 0.9],
      color: hex('#e8e8e8'),
      speed: 2,
      spreadDeg: 30,
      when: 'moving',
    });
  }
}
