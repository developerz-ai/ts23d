// The cockpit as named parts: seats, dash (+ glowing gauge faces), steering wheel, controls,
// carpet and trim, roll hoops; and the seat / camera sockets game code binds to.

import type { BuildContext } from '@developerz.ai/ts23d';
import { merge } from '@developerz.ai/ts23d';
import { FLOOR_Z } from '../chassis/structure.ts';
import { carpet, rollHoops } from './cabin.ts';
import { DRIVER_Y, dashboard } from './dash.ts';
import { seatAt } from './seats.ts';

export const SEAT_X = -0.55;

export function cockpit(ctx: BuildContext): void {
  const lod = ctx.lod;
  for (const [name, y] of [
    ['seat_driver', DRIVER_Y],
    ['seat_passenger', -DRIVER_Y],
  ] as const)
    ctx.socket(name, { kind: 'seat', at: [SEAT_X + 0.12, y, FLOOR_Z + 0.18], dir: [1, 0, 0] });
  ctx.socket('camera_cockpit', {
    kind: 'camera',
    at: [SEAT_X + 0.08, DRIVER_Y, 1.02],
    dir: [1, 0, -0.05],
    data: { fov: 70 },
  });
  ctx.socket('camera_chase', {
    kind: 'camera',
    at: [-6.5, 0, 1.9],
    dir: [1, 0, -0.12],
    data: { fov: 60 },
  });
  ctx.socket('tow_front', { kind: 'attach', at: [2.15, 0, 0.2], dir: [1, 0, 0] });
  ctx.socket('tow_rear', { kind: 'attach', at: [-2.18, 0, 0.3], dir: [-1, 0, 0] });
  if (lod === 2) {
    // Far: seat backs, the dash top and the hoops are all that read.
    ctx.part(
      'seats',
      merge([
        seatAt(2, [SEAT_X, DRIVER_Y, FLOOR_Z + 0.03]),
        seatAt(2, [SEAT_X, -DRIVER_Y, FLOOR_Z + 0.03]),
      ]),
    );
    const d = dashboard(2);
    ctx.part('dashboard', d.dash);
    ctx.part('roll_hoops', rollHoops(2, DRIVER_Y), { finish: 'brushed' });
    return;
  }
  ctx.part(
    'seats',
    merge([
      seatAt(lod, [SEAT_X, DRIVER_Y, FLOOR_Z + 0.03]),
      seatAt(lod, [SEAT_X, -DRIVER_Y, FLOOR_Z + 0.03]),
    ]),
  );
  const d = dashboard(lod);
  ctx.part('dashboard', merge([d.dash, d.gauges]));
  ctx.part('gauge_faces', d.gaugeFaces);
  ctx.part('steering_wheel', d.wheel);
  ctx.part('controls', d.controls);
  ctx.part('carpet', carpet(lod), { finish: 'carpet' });
  ctx.part('roll_hoops', rollHoops(lod, DRIVER_Y), { finish: 'brushed' });
}
