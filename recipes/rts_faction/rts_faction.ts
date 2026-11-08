// The Saltmarch Accord sample faction as one scene: the Warden Hall with its garrison drawn up in
// front (three Wardens, two Delvers, a Brinehound light tank) and a claimed sunstone deposit.
// Every unit is the real asset via ctx.use, so the lineup is the roster's scale and colour check:
// one team slot repaints the whole scene. Style guide: README.md; shared code: style.ts, figure.ts.

import { box, defineAsset, hex } from '@developerz.ai/ts23d';
import { TEAM_PAINT, TEAM_VARIANTS } from '../_lib/rts/style.ts';
import { rts_barracks } from '../rts_barracks/rts_barracks.ts';
import { rts_resource } from '../rts_resource/rts_resource.ts';
import { rts_soldier } from '../rts_soldier/rts_soldier.ts';
import { rts_tank } from '../rts_tank/rts_tank.ts';
import { rts_worker } from '../rts_worker/rts_worker.ts';

const SALT_FLAT = hex('#f2eee4');
const TRODDEN = hex('#d8d2c4');

export const rts_faction = defineAsset({
  name: 'rts_faction',
  kind: 'scene',
  description:
    'Saltmarch Accord sample RTS faction lineup: barracks, three soldiers, two workers, a light tank and a claimed sunstone deposit, all on one team slot (8 liveries).',
  tags: ['rts', 'saltmarch', 'faction', 'scene', 'team-colour'],
  sources: ['recipes/rts_faction/README.md (the style guide this lineup checks)'],
  // Measured 145k / 32k / 3.6k: the sum of the weathered assets plus the ground.
  budget: { triangles: [160000, 36000, 4600] },
  paint: TEAM_PAINT,
  variants: TEAM_VARIANTS,
  build(ctx) {
    // Salt-flat ground with two trodden gravel paths: hall gate → muster line, and → tank park.
    ctx.part(
      'ground',
      box({ size: [30, 25, 0.1], at: [-1, 0.5, -0.1], color: SALT_FLAT, strip: 'sand' }),
    );
    ctx.part(
      'paths',
      box({ size: [5.2, 2.6, 0.1], at: [0.4, 0, -0.098], color: TRODDEN, strip: 'gravel' }),
    );
    ctx.part(
      'paths_tank',
      box({ size: [6.4, 1.2, 0.1], at: [5.8, -2.8, -0.097], color: TRODDEN, strip: 'gravel' }),
    );
    ctx.use(rts_barracks, { prefix: 'hall', at: [-8, 0, 0] });
    ctx.use(rts_tank, { prefix: 'tank', at: [6.5, -6.5, 0], yaw: 0.35 });
    for (let i = 0; i < 3; i++)
      ctx.use(rts_soldier, { prefix: `warden_${i}`, at: [5.2, -1.6 + i * 1.3, 0] });
    for (let i = 0; i < 2; i++)
      ctx.use(rts_worker, { prefix: `delver_${i}`, at: [3.6, 3.6 + i * 1.3, 0], yaw: 0.6 });
    ctx.use(rts_resource, { prefix: 'deposit', at: [6, 7.5, 0], yaw: -0.8 });
  },
});
