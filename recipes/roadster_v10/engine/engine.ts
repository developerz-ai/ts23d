// The powertrain as named parts: block (+ mounts), top end (heads, covers, coils, rails),
// intake, exhaust (manifolds + side pipes), cooling (radiator, fans, accessory drive, hoses),
// bay ancillaries and the driveline (bellhousing, gearbox, propshaft). Plus the engine sockets
// and the exhaust emitters game code binds to.

import type { BuildContext } from '@developerz.ai/ts23d';
import { merge } from '@developerz.ai/ts23d';
import { X_CRANK_FRONT, Z_CRANK } from '../dims.ts';
import { ancillaries } from './ancillaries.ts';
import { block, driveline, mounts } from './block.ts';
import { cooling } from './cooling.ts';
import { exhaust, PIPE_TIP } from './exhaust.ts';
import { topEnd } from './heads.ts';
import { intake } from './intake.ts';

export const ENGINE_PARTS = [
  'engine_block',
  'engine_heads',
  'engine_intake',
  'exhaust',
  'cooling',
  'bay_ancillaries',
  'driveline',
] as const;

export function powertrain(ctx: BuildContext): void {
  const lod = ctx.lod;
  ctx.socket('engine_audio', {
    kind: 'audio',
    at: [X_CRANK_FRONT - 0.3, 0, Z_CRANK + 0.3],
    data: { clip: 'v10_idle', rpmIdle: 750, rpmMax: 6200 },
  });
  for (const s of [1, -1] as const) {
    const at: [number, number, number] = [PIPE_TIP[0] - 0.02, s * PIPE_TIP[1], PIPE_TIP[2]];
    const side = s > 0 ? 'l' : 'r';
    ctx.emitter(`exhaust_smoke_${side}`, {
      kind: 'smoke',
      at,
      dir: [-1, s * 0.25, -0.05],
      rate: 18,
      life: 1.4,
      size: [0.06, 0.5],
      color: [0.55, 0.55, 0.57],
      speed: 2.5,
      spreadDeg: 12,
      when: 'always',
    });
    ctx.socket(`exhaust_audio_${side}`, { kind: 'audio', at, data: { clip: 'v10_exhaust' } });
  }
  if (lod === 2) {
    // Far: the hood is shut; keep the block (seen through the mouth) and the side pipes.
    ctx.part('engine_block', merge([block(lod), mounts(lod)]));
    ctx.part('exhaust', exhaust(lod));
    return;
  }
  ctx.part('engine_block', merge([block(lod), mounts(lod)]));
  ctx.part('engine_heads', topEnd(lod));
  ctx.part('engine_intake', intake(lod));
  ctx.part('exhaust', exhaust(lod));
  ctx.part('cooling', cooling(lod));
  ctx.part('bay_ancillaries', ancillaries(lod));
  ctx.part('driveline', driveline(lod));
}
