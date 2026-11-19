// The Saltmarch kit reads in an RTS: every asset's team colour is visible from the strategy
// camera (58° down, 64 px, LOD2 — what thousands of units on screen actually draw), every asset
// carries the eight team liveries, and the units pass the measured art checks (silhouette kept at
// LOD2, focal point, shape language), and a unit's grip joint holds whichever way a scene turns
// it. Failure first: a buried team part must fail the check.

import { describe, expect, it } from 'bun:test';
import { type Asset, box, compile, defineAsset, hex } from '@developerz.ai/ts23d';
import { teamCoverage } from '@developerz.ai/ts23d/render';
import { assertArt, assertJointsFit, silhouetteReads } from '@developerz.ai/ts23d/testing';
import { TEAMS } from '../_lib/rts/style.ts';
import {
  rts_barracks,
  rts_barracks_damaged,
  rts_barracks_foundation,
  rts_barracks_foundation_damaged,
  rts_barracks_foundation_rubble,
  rts_barracks_rubble,
  rts_barracks_scaffold,
  rts_barracks_scaffold_damaged,
  rts_barracks_scaffold_rubble,
} from '../rts_barracks/rts_barracks.ts';
import { rts_resource, rts_resource_depleted } from '../rts_resource/rts_resource.ts';
import { rts_soldier } from '../rts_soldier/rts_soldier.ts';
import { rts_tank } from '../rts_tank/rts_tank.ts';
import { rts_worker } from '../rts_worker/rts_worker.ts';

/** Team share of the LOD2 silhouette from the RTS camera (red vs blue livery). */
const teamShare = (a: Asset): number =>
  teamCoverage(compile(a, { lod: 2, variant: 'red' }), compile(a, { lod: 2, variant: 'blue' }))
    .share;

/** House rule: at least this much of a unit's 64-px silhouette is team colour. */
const MIN_SHARE = 0.08;

const UNITS = [rts_worker, rts_soldier, rts_tank];
const ALL = [
  ...UNITS,
  rts_barracks,
  rts_barracks_damaged,
  rts_barracks_rubble,
  rts_barracks_scaffold,
  rts_barracks_scaffold_damaged,
  rts_barracks_scaffold_rubble,
  rts_barracks_foundation,
  rts_barracks_foundation_damaged,
  rts_barracks_foundation_rubble,
  rts_resource,
  rts_resource_depleted,
];

describe('team colour from the RTS camera', () => {
  it('fails a unit whose team part is buried', () => {
    const hidden = defineAsset({
      name: 'hidden_team',
      kind: 'prop',
      budget: { triangles: [24, 24, 24] },
      paint: { team: TEAMS.red },
      variants: { red: { team: TEAMS.red }, blue: { team: TEAMS.blue } },
      build(ctx) {
        ctx.part('body', box({ size: [1, 1, 1.8], color: hex('#8a8a84') }));
        ctx.part('badge', box({ size: [0.2, 0.2, 0.2], at: [0, 0, 0.8], color: hex(TEAMS.red) }), {
          paint: 'team',
        });
      },
    });
    expect(teamShare(hidden)).toBeLessThan(MIN_SHARE);
  }, 30000); // the first render paints the 2048² trim sheet

  for (const a of ALL)
    it(`${a.name}: ≥ ${MIN_SHARE * 100}% team colour at 64 px, all eight liveries`, () => {
      expect(Object.keys(a.variants ?? {})).toEqual(Object.keys(TEAMS));
      expect(teamShare(a)).toBeGreaterThanOrEqual(MIN_SHARE);
    }, 30000);
});

describe('readability', () => {
  for (const a of UNITS)
    it(`${a.name} keeps its silhouette at LOD2 and passes the art checks`, () => {
      for (const v of silhouetteReads(a)) expect(v.iou).toBeGreaterThanOrEqual(0.85);
      assertArt(a);
    }, 60000);
});

/** `a` placed in a scene turned `yaw` about Z, as rts_faction places its units. */
const turned = (a: Asset, yaw: number): Asset =>
  defineAsset({
    name: `${a.name}_yaw_${Math.round(yaw * 100)}`,
    kind: 'scene',
    budget: { triangles: [20000, 5000, 1000] },
    build(ctx) {
      ctx.use(a, { prefix: 'u', yaw });
    },
  });

describe('grip joints at any heading', () => {
  // The joint check measures a handle across world axes: a 4-sided LOD2 handle read Ø 2.5–3.6 cm
  // by heading, so rts_faction (Delvers turned 0.9 rad) failed while rts_worker passed (D310).
  for (const a of [rts_worker, rts_soldier])
    for (const yaw of [0, 0.3, Math.PI / 4, 0.9, 1.3])
      it(`${a.name} turned ${yaw.toFixed(2)} rad: the fist fits the handle at every LOD`, () => {
        assertJointsFit(turned(a, yaw));
      });
});
