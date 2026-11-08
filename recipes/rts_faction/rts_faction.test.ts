// The Saltmarch kit reads in an RTS: every asset's team colour is visible from the strategy
// camera (58° down, 64 px, LOD2 — what thousands of units on screen actually draw), every asset
// carries the eight team liveries, and the units pass the measured art checks (silhouette kept at
// LOD2, focal point, shape language). Failure first: a buried team part must fail the check.

import { describe, expect, it } from 'bun:test';
import { type Asset, box, compile, defineAsset, hex } from '@developerz.ai/ts23d';
import { teamCoverage } from '@developerz.ai/ts23d/render';
import { assertArt, silhouetteReads } from '@developerz.ai/ts23d/testing';
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
