// The Saltmarch Accord sample faction as one scene: the Warden Hall, its forecourt and what a
// garrison leaves on it. A gravel road runs from the gate out through a gap in the perimeter wall
// (sandbag posts either side of it), three Wardens stand a wedge on the road, the Brinehound is
// parked on its hardstand with its track ruts leading back to the road, fuel drums and crates are
// stacked by the park, two Delvers work the claimed sunstone deposit. Every unit is the real asset
// via ctx.use, so the scene is the roster's scale and colour check: one team slot repaints all of
// it. The ground, road, ruts, wall, sandbags and props are this recipe's own (ground.ts).
// Style guide: README.md; shared code: ../_lib/rts.

import { defineAsset } from '@developerz.ai/ts23d';
import { TEAM_PAINT, TEAM_VARIANTS } from '../_lib/rts/style.ts';
import { rts_barracks } from '../rts_barracks/rts_barracks.ts';
import { rts_resource } from '../rts_resource/rts_resource.ts';
import { rts_soldier } from '../rts_soldier/rts_soldier.ts';
import { rts_tank } from '../rts_tank/rts_tank.ts';
import { rts_worker } from '../rts_worker/rts_worker.ts';
import { forecourt, PARK, perimeter, stores } from './ground.ts';

export const rts_faction = defineAsset({
  name: 'rts_faction',
  kind: 'scene',
  description:
    'Saltmarch Accord sample RTS faction as a compound: barracks, a wedge of three soldiers on the gate road, a light tank on its hardstand, two workers at a claimed sunstone deposit, perimeter wall, sandbags, stores; one team slot (8 liveries).',
  tags: ['rts', 'saltmarch', 'faction', 'scene', 'team-colour'],
  sources: ['recipes/rts_faction/README.md (the style guide this scene checks)'],
  // Measured 131k / 32.9k / 3.9k: the sum of the weathered assets plus the ground (true-scale
  // salt flat, road and ruts), the perimeter and the stores. Was 148k (D590): the figures' small
  // forms at LOD1 rings, the tank's wheels and wear cells and the hall's slates and towers
  // trimmed where the strategy camera never looks (D596).
  budget: { triangles: [132000, 34000, 4600] },
  paint: TEAM_PAINT,
  variants: TEAM_VARIANTS,
  build(ctx) {
    forecourt(ctx);
    perimeter(ctx);
    stores(ctx);
    ctx.use(rts_barracks, { prefix: 'hall', at: [-8, 0, 0] });
    // The Brinehound parked on its hardstand, nose to the road gate.
    ctx.use(rts_tank, { prefix: 'tank', at: [PARK.x, PARK.y, 0] });
    // Three Wardens in a wedge on the gate road, facing out, each his own stance and glance
    // (the seed picks it, D597) and squared off a little differently.
    for (const [i, [x, y, yaw]] of [
      [6.2, 0, 0.05],
      [5.0, -1.15, -0.12],
      [5.0, 1.15, 0.1],
    ].entries())
      ctx.use(rts_soldier, {
        prefix: `warden_${i}`,
        at: [x ?? 0, y ?? 0, 0],
        yaw: yaw ?? 0,
        seed: 11 + i,
      });
    for (let i = 0; i < 2; i++)
      ctx.use(rts_worker, {
        prefix: `delver_${i}`,
        at: [4.4 + i * 1.5, 5.4 + i * 0.5, 0],
        yaw: 0.9 - i * 0.25,
        seed: 21 + i,
      });
    ctx.use(rts_resource, { prefix: 'deposit', at: [7.2, 8.3, 0], yaw: -0.8 });
  },
});
