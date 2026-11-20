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

/** Team share of the silhouette from the RTS camera (red vs blue livery), LOD2 unless given. */
const teamShare = (a: Asset, lod: 0 | 2 = 2): number =>
  teamCoverage(compile(a, { lod, variant: 'red' }), compile(a, { lod, variant: 'blue' })).share;

/** House rule: at least this much of a unit's 64-px silhouette is team colour. */
const MIN_SHARE = 0.08;
/**
 * Ruins are the exception, measured differently: a burnt-out hall's paint is under ash and
 * rubble (its near LOD0 shows 1-3 % team colour, the floor chevron and a few flecks), so the far
 * view must show what the near one does: no more than this many points of extra team colour
 * at the LOD switch (D485: fallen slates popped from ash-grey to clean red at LOD2), and never
 * less than the near view shows, so the owner's mark stays.
 */
const RUIN_POP = 0.04;

const UNITS = [rts_worker, rts_soldier, rts_tank];
const ALL = [
  ...UNITS,
  rts_barracks,
  rts_barracks_damaged,
  rts_barracks_scaffold,
  rts_barracks_scaffold_damaged,
  rts_barracks_foundation,
  rts_barracks_foundation_damaged,
  rts_resource,
  rts_resource_depleted,
];
const RUINS = [rts_barracks_rubble, rts_barracks_scaffold_rubble, rts_barracks_foundation_rubble];

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

  for (const a of RUINS)
    it(`${a.name}: the far ruin shows the team colour the near one does (no pop at LOD2)`, () => {
      expect(Object.keys(a.variants ?? {})).toEqual(Object.keys(TEAMS));
      const near = teamShare(a, 0);
      const far = teamShare(a);
      expect(near).toBeGreaterThan(0);
      // Never below the near share (the README's rule): with a point of slack a 1 % near ruin
      // could lose its mark entirely at LOD2 and still pass.
      expect(far).toBeGreaterThanOrEqual(near);
      expect(far - near).toBeLessThanOrEqual(RUIN_POP);
    }, 60000);
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
