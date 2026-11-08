// Jupiter running gear: bar frames, brass-lagged cylinders with steam chests and cocks, guides,
// the four-wheel lead truck, every wheelset (spin), polished side and main rods and crossheads
// (slide), driver splashers. Rods are bright steel; frames and truck black enamel.

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
} from '@developerz.ai/ts23d';
import {
  bx,
  CRANK,
  CYL_Z,
  DECK_Z,
  DRIVER_R,
  DRIVER_RPS,
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

/** Registers wheelsets; returns the names it made so rods can clear them. */
export interface Gear {
  readonly wheelsets: string[];
  readonly cranks: string[];
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
  return {
    wheelsets,
    cranks,
    wheelset(name, x, r, parent, crankAngle, spokes, clearOf) {
      ctx.group(name, {
        at: [x, 0, RAIL_TOP + r],
        parent,
        motion: { kind: 'spin', axis: [0, 1, 0], rps: SPEED / (2 * Math.PI * r) },
        clearOf: [...RAILS, ...clearOf],
      });
      wheelsets.push(name);
      const ty = GAUGE / 2 + TREAD_W / 2;
      for (const [side, s] of SIDES) {
        // Right-hand cranks lead the left by 90° (quartering).
        const ca = crankAngle === null ? null : crankAngle + (s > 0 ? 0 : Math.PI / 2);
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

/** Side rods, main rods, crossheads (slide approximations of the crank orbit) and cylinder steam. */
export function buildRods(ctx: BuildContext, L: Layout, gear: Gear): void {
  if (L.lod === 2) return;
  const zA = RAIL_TOP + DRIVER_R;
  for (const [side, s] of SIDES) {
    const ca = s > 0 ? 0 : Math.PI / 2;
    const cx = Math.cos(ca) * CRANK;
    const cz = Math.sin(ca) * CRANK;
    const yS = s * (GAUGE / 2 + TREAD_W + 0.1);
    const xs = L.drivers.map((d) => d.x + cx);
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
    ctx.part(`rod_side_${side}`, sideRod, {
      parent: 'locomotive',
      at: [0, yS, zA + cz],
      motion: { kind: 'slide', offset: [0, 0, CRANK], hz: DRIVER_RPS },
      clearOf: [
        ...gear.cranks,
        `rod_main_${side}`,
        ...gear.wheelsets.map((w) => `${w}_wheel_${side}`),
      ],
    });
    const crossX = (L.guideFront + L.guideRear) / 2;
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
        at: [crossX, s * ROD_Y, CYL_Z],
        motion: { kind: 'slide', offset: [CRANK, 0, 0], hz: DRIVER_RPS },
        clearOf: ['guides', 'frame', `rod_main_${side}`],
      },
    );
    const fx = (L.drivers[0]?.x ?? L.frontDriver) + cx;
    ctx.part(
      `rod_main_${side}`,
      merge([
        beam({
          from: [0, 0, 0],
          to: [fx - crossX, 0, zA + cz - CYL_Z],
          width: 0.05,
          height: 0.13,
          ...F.steel,
        }),
        boss(fx - crossX, 0.1, zA + cz - CYL_Z),
        boss(0, 0.075),
      ]),
      {
        parent: 'locomotive',
        at: [crossX, s * ROD_Y, CYL_Z],
        motion: { kind: 'slide', offset: [CRANK, 0, 0], hz: DRIVER_RPS },
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
