// The powertrain as named parts: block (+ mounts), top end (heads, covers, coils, rails),
// intake, exhaust (manifolds + side pipes), cooling (radiator, fans, accessory drive, hoses),
// bay ancillaries and the driveline (bellhousing, gearbox, propshaft). Plus the engine sockets
// and the exhaust emitters game code binds to.

import type { BuildContext, Mesh } from '@developerz.ai/ts23d';
import { merge } from '@developerz.ai/ts23d';
import { X_CRANK_FRONT, Z_CRANK } from '../dims.ts';
import { bayDust, bayGrime } from '../lib/wear.ts';
import { ancillaries } from './ancillaries.ts';
import { block, driveline, mounts } from './block.ts';
import { cooling } from './cooling.ts';
import { exhaust, PIPE_TIP } from './exhaust.ts';
import { topEnd } from './heads.ts';
import { intake } from './intake.ts';

/** Oil mist and road dust: black low on the block and sump, clean by the valve covers. */
const oily = (m: Mesh): Mesh => bayGrime(m, 0.15, 0.6);

export const ENGINE_PARTS = [
  'engine_block',
  'engine_heads',
  'engine_intake',
  'exhaust',
  'cooling',
  'bay_ancillaries',
  'driveline',
] as const;

/**
 * `open` > 0: the hood is up, so the mid LOD keeps the dressed engine. Under a shut hood the mid
 * LOD carries what shows from outside (block through the vents, side pipes) and the far LOD
 * only the side pipes.
 */
export function powertrain(ctx: BuildContext, open: number): void {
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
  const dressed = lod === 0 || (lod === 1 && open > 0);
  if (!dressed) {
    if (lod === 1 || open > 0) ctx.part('engine_block', oily(merge([block(lod), mounts(lod)])));
    ctx.part('exhaust', exhaust(lod, false));
    return;
  }
  ctx.part('engine_block', oily(merge([block(lod), mounts(lod)])));
  // Dust on the covers and runners, oil weeping below the valve-cover gaskets (z 0.62 m).
  const dust = ctx.rng.fork('bay_dust');
  ctx.part('engine_heads', bayDust(topEnd(lod), 0.62, dust));
  ctx.part('engine_intake', bayDust(intake(lod), 0.62, dust));
  ctx.part('exhaust', exhaust(lod, true));
  ctx.part('cooling', oily(cooling(lod)));
  ctx.part('bay_ancillaries', bayGrime(ancillaries(lod), 0.3, 0.6, 0.35));
  ctx.part('driveline', oily(driveline(lod)));
}
