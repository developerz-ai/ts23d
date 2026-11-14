// Jupiter fittings: the big box headlamp (blue case, red side diamonds, gold lining, crest, brass
// posts, glass lens over a chrome reflector) on scrolled brackets; running boards with brass
// edging; brass handrails on stanchions; the slatted blue pilot with gold-lined slats and braces;
// pipework (check valves, feed and injector pipes, sand pipes).

import {
  type BuildContext,
  beam,
  type Mesh,
  merge,
  planar,
  prism,
  translate,
  type Vec3,
} from '@developerz.ai/ts23d';
import {
  BOARD_Z,
  BOILER_R,
  BOILER_Z,
  bx,
  DECK_Z,
  F,
  type Layout,
  lath,
  pipe,
  RAIL_TOP,
  ROD_Y,
  SMOKEBOX_R,
} from './shared.ts';

export function buildHeadlamp(ctx: BuildContext, L: Layout): void {
  const { lod, segs, smokeFront } = L;
  const lampZ = BOILER_Z + SMOKEBOX_R + 0.02;
  const cx = smokeFront - 0.1;
  const m: Mesh[] = [
    // Platform on the smokebox top, the lamp case, its hipped roof.
    bx(cx - 0.42, cx + 0.36, -0.55, 0.55, lampZ - 0.14, lampZ - 0.06, F.blueSteel),
    bx(cx - 0.3, cx + 0.25, -0.32, 0.32, lampZ - 0.06, lampZ + 0.64, F.blueWood),
    translate(
      prism({
        profile: [
          [-0.36, 0],
          [0.36, 0],
          [0.22, 0.14],
          [-0.22, 0.14],
        ],
        depth: 0.64,
        plane: 'yz',
        ...F.blueWood,
      }),
      [cx - 0.025, 0, lampZ + 0.64],
    ),
  ];
  if (lod < 2) {
    const fz = lampZ + 0.29;
    m.push(
      // Lens bezel: red ring round a chrome reflector rim (glass is its own part).
      lath({
        profile: [
          [0.26, 0],
          [0.26, 0.025],
          [0.225, 0.03],
          [0.225, 0.0],
        ],
        segments: segs,
        axis: 'x',
        at: [cx + 0.25, 0, fz],
        ...F.redSteel,
      }),
      lath({
        profile: [
          [0.226, 0.0],
          [0.14, -0.08],
          [0.03, -0.1],
          [0, -0.1],
        ],
        segments: segs,
        axis: 'x',
        at: [cx + 0.25, 0, fz],
        ...F.chrome,
      }),
      // Crest on the roof: a shaped blue board with a gold edge.
      translate(
        prism({
          profile: [
            [-0.1, 0],
            [0.1, 0],
            [0.08, 0.1],
            [0.11, 0.22],
            [0.06, 0.3],
            [-0.06, 0.3],
            [-0.11, 0.22],
            [-0.08, 0.1],
          ],
          depth: 0.04,
          plane: 'yz',
          ...F.blueWood,
        }),
        [cx + 0.08, 0, lampZ + 0.74],
      ),
      // Chimney.
      lath({
        profile: [
          [0.06, 0],
          [0.05, 0.1],
          [0.08, 0.13],
          [0.02, 0.17],
        ],
        segments: 10,
        at: [cx - 0.12, 0, lampZ + 0.78],
        caps: true,
        ...F.brass,
      }),
    );
    for (const s of [1, -1]) {
      // Red diamond panel on each side of the case, gold lined edge.
      const y = s * 0.322;
      const dia: Vec3[] = [
        [cx - 0.025, y, lampZ + 0.04],
        [cx + 0.2, y, lampZ + 0.29],
        [cx - 0.025, y, lampZ + 0.54],
        [cx - 0.25, y, lampZ + 0.29],
      ];
      m.push(planar({ points: s > 0 ? dia.slice().reverse() : dia, ...F.redSteel }));
      // Gold lining: the case's corner posts and top/bottom rails in brass.
      for (const x of [cx - 0.3, cx + 0.25])
        m.push(bx(x - 0.012, x + 0.012, s * 0.31, s * 0.332, lampZ - 0.06, lampZ + 0.65, F.brass));
      m.push(
        bx(cx - 0.3, cx + 0.25, s * 0.31, s * 0.332, lampZ + 0.63, lampZ + 0.65, F.brass),
        // Brass posts flanking the lamp (flag-staff sockets), standing on the platform.
        lath({
          profile: [
            [0.025, 0],
            [0.02, 0.75],
            [0.035, 0.77],
            [0, 0.81],
          ],
          segments: 8,
          at: [cx + 0.27, s * 0.45, lampZ - 0.06],
          caps: true,
          ...F.brass,
        }),
      );
      // Scrolled bracket from the smokebox side up to the platform.
      m.push(
        ...pipe(
          [
            [cx - 0.3, s * 0.5, lampZ - 0.14],
            [cx - 0.35, s * 0.6, BOILER_Z + 0.3],
          ],
          0.05,
          F.blueSteel,
        ),
        ...pipe(
          [
            [cx + 0.2, s * 0.5, lampZ - 0.14],
            [cx + 0.15, s * 0.6, BOILER_Z + 0.3],
          ],
          0.05,
          F.blueSteel,
        ),
      );
    }
    ctx.part(
      'headlamp_lens',
      lath({
        profile: [
          [0.226, 0.0],
          [0.14, 0.014],
          [0, 0.016],
        ],
        segments: segs,
        axis: 'x',
        at: [cx + 0.25, 0, fz],
        ...F.glass,
      }),
      { parent: 'locomotive', surface: 'glass' },
    );
  }
  ctx.part('headlamp', merge(m), { parent: 'locomotive' });
}

/** Running boards, splasher-level brass edge, boiler handrails on stanchions. */
export function buildBoards(ctx: BuildContext, L: Layout): void {
  const { lod, barrelFront, cabFront, smokeFront, frontDriver } = L;
  const m: Mesh[] = [];
  for (const s of [1, -1]) {
    m.push(
      bx(barrelFront, cabFront, s * 0.74, s * 1.16, BOARD_Z, BOARD_Z + 0.04, F.black),
      // Drop plate ahead of the drivers: inboard of the main rod's plane (ROD_Y ± 0.03), which
      // it used to fill — the rod drove straight through it.
      bx(
        frontDriver + 0.94,
        frontDriver + 1.06,
        s * 0.74,
        s * (ROD_Y - 0.06),
        1.04,
        BOARD_Z,
        F.black,
      ),
    );
    if (lod < 2)
      m.push(
        // Brass edge angle along the board.
        bx(
          barrelFront + 0.05,
          cabFront,
          s * 1.16,
          s * 1.175,
          BOARD_Z - 0.05,
          BOARD_Z + 0.045,
          F.brass,
        ),
        // Boiler handrail on stanchions, front end bent down to the smokebox.
        ...pipe(
          [
            [cabFront - 0.02, s * (BOILER_R + 0.1), BOILER_Z + 0.3],
            [smokeFront - 0.2, s * (SMOKEBOX_R + 0.1), BOILER_Z + 0.3],
          ],
          0.032,
          F.brass,
          lod === 0 ? 8 : 5,
        ),
      );
    if (lod === 0)
      for (let i = 0; i < 5; i++) {
        const x = cabFront + 0.3 + ((smokeFront - 0.25 - cabFront - 0.3) * i) / 4;
        const r = x > barrelFront ? SMOKEBOX_R : BOILER_R;
        m.push(
          beam({
            from: [x, s * (r - 0.02), BOILER_Z + 0.27],
            to: [x, s * (r + 0.11), BOILER_Z + 0.3],
            width: 0.022,
            segments: 6,
            ...F.brass,
          }),
          lath({
            profile: [
              [0.028, -0.02],
              [0.028, 0.02],
              [0, 0.03],
            ],
            segments: 8,
            axis: 'y',
            at: [x, s * (r + 0.08), BOILER_Z + 0.3],
            ...F.brass,
          }),
        );
      }
  }
  ctx.part('running_boards', merge(m), { parent: 'locomotive' });
}

/** Pilot (cowcatcher): blue V of slats with gold lining from the buffer beam to the point. */
export function buildPilot(ctx: BuildContext, L: Layout): void {
  const { beamX, pilotTip, smokeFront, lod } = L;
  const m: Mesh[] = [];
  const slats = ctx.pick([10, 6, 2]);
  const z0 = RAIL_TOP + 0.08;
  const z1 = 1.0;
  for (const s of [1, -1]) {
    for (let i = 0; i < slats; i++) {
      const t = i / (slats - 1);
      const y = s * (0.1 + t * 1.0);
      const from: Vec3 = [beamX + 0.03, y, z1];
      const to: Vec3 = [pilotTip - Math.abs(y) * 0.85, y * 0.55, z0 + 0.02];
      m.push(beam({ from, to, width: 0.06, height: 0.07, ...F.blueWood }));
      // Gold line down the slat's face.
      if (lod === 0)
        m.push(
          beam({
            from: [from[0] + 0.035, from[1], from[2] - 0.06],
            to: [to[0] + 0.03, to[1], to[2] + 0.06],
            width: 0.012,
            height: 0.012,
            ...F.brass,
          }),
        );
    }
    m.push(
      beam({
        from: [beamX + 0.03, s * 1.12, z1],
        to: [pilotTip, 0, z1 - 0.15],
        width: 0.08,
        ...F.blueWood,
      }),
      beam({
        from: [beamX + 0.03, s * 1.12, z0 + 0.05],
        to: [pilotTip, 0, z0],
        width: 0.08,
        ...F.blueWood,
      }),
    );
    // Braces from the smokebox down to the pilot frame.
    if (lod < 2)
      m.push(
        ...pipe(
          [
            [smokeFront - 0.15, s * 0.5, BOILER_Z - 0.4],
            [beamX + 0.45, s * 0.45, z1 - 0.05],
          ],
          0.05,
          F.black,
        ),
      );
  }
  m.push(beam({ from: [beamX + 0.03, 0, z1], to: [pilotTip, 0, z0], width: 0.09, ...F.blueWood }));
  if (lod < 2)
    // Coupler pin pocket on the nose.
    m.push(bx(pilotTip - 0.35, pilotTip - 0.05, -0.06, 0.06, z0 + 0.05, z0 + 0.35, F.blueSteel));
  ctx.part('pilot', merge(m), { parent: 'locomotive' });
}

/** Check valves, feed pipes, injector, sand pipes, whistle cord: LOD0 plumbing. */
export function buildPipework(ctx: BuildContext, L: Layout): void {
  if (L.lod !== 0) return;
  const { cabFront, barrelRear, frontDriver } = L;
  const m: Mesh[] = [];
  const valveX = frontDriver + 0.75;
  for (const s of [1, -1]) {
    const y = s * (BOILER_R - 0.02);
    // Check valve: a brass globe on the boiler side, feed pipe back to the injector under the cab.
    m.push(
      translate(
        lath({
          profile: [
            [0.05, 0],
            [0.07, s * 0.03],
            [0.08, s * 0.08],
            [0.06, s * 0.13],
            [0.03, s * 0.16],
          ],
          segments: 12,
          axis: 'y',
          caps: true,
          ...F.brass,
        }),
        [valveX, y - s * 0.03, BOILER_Z - 0.18],
      ),
      ...pipe(
        [
          [valveX, s * (BOILER_R + 0.12), BOILER_Z - 0.2],
          [valveX - 0.3, s * (BOILER_R + 0.15), BOILER_Z - 0.45],
          [cabFront + 0.2, s * (BOILER_R + 0.15), BOILER_Z - 0.45],
          [cabFront - 0.2, s * 0.95, DECK_Z - 0.2],
        ],
        0.04,
        F.brass,
      ),
      // Injector body hanging under the deck edge.
      lath({
        profile: [
          [0.03, 0],
          [0.06, 0.05],
          [0.06, 0.3],
          [0.03, 0.35],
        ],
        segments: 10,
        axis: 'x',
        at: [cabFront - 0.55, s * 0.95, DECK_Z - 0.26],
        caps: true,
        ...F.brass,
      }),
      // Steam supply from the backhead turret to the injector.
      ...pipe(
        [
          [cabFront - 0.2, s * 0.95, DECK_Z - 0.2],
          [cabFront - 0.2, s * 0.95, DECK_Z - 0.26],
        ],
        0.04,
        F.brass,
      ),
      // Sand pipes from the sand dome down ahead of the front driver.
      ...pipe(
        [
          [barrelRear + 2.25, s * 0.3, BOILER_Z + BOILER_R * 0.95 - 0.01],
          [barrelRear + 2.25, s * 0.47, BOILER_Z + 0.43],
          [barrelRear + 2.25, s * 0.62, BOILER_Z + 0.22],
          [barrelRear + 2.25, s * (BOILER_R + 0.05), BOILER_Z + 0.1],
          [frontDriver + 0.95, s * (BOILER_R + 0.12), BOARD_Z - 0.05],
          [frontDriver + 0.95, s * 0.74, RAIL_TOP + 0.5],
          [frontDriver + 0.72, s * 0.72, RAIL_TOP + 0.25],
        ],
        0.03,
        F.brass,
      ),
    );
  }
  ctx.part('pipework', merge(m), { parent: 'locomotive' });
}
