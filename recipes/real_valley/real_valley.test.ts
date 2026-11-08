// The pinned data agree with each other: the USGS 3DEP heights put Half Dome's summit where and
// as high as Wikidata says, and Glacier Point's overlook within Wikidata's figure. A re-pinned DEM
// that shifted or mis-scaled the box fails here before it reaches a render.

import { describe, expect, test } from 'bun:test';
import { sampler } from '@developerz.ai/ts23d';
import {
  crossCheck,
  decodeDem,
  lonLatToLocal,
  quantity,
  readWikidata,
} from '@developerz.ai/ts23d/data';
import glacierPointJson from './data/wikidata-Q3108318.json';
import { DATUM, DEM, HALF_DOME } from './real_valley.ts';

const grid = decodeDem(DEM);
const at = sampler(grid);

/** Highest DEM point within `r` metres of a Wikidata coordinate. */
function peakNear(lat: number, lon: number, r: number): number {
  const [cx, cy] = lonLatToLocal(DEM.centre, lon, lat);
  let best = -Infinity;
  for (let dy = -r; dy <= r; dy += 5)
    for (let dx = -r; dx <= r; dx += 5)
      if (dx * dx + dy * dy <= r * r) best = Math.max(best, at(cx + dx, cy + dy));
  return best;
}

describe('real_valley data', () => {
  test('a shifted box would miss Half Dome (the check can fail)', () => {
    const c = HALF_DOME.coordinates ?? { lat: 0, lon: 0 };
    expect(peakNear(c.lat - 0.01, c.lon, 30)).toBeLessThan(quantity(HALF_DOME, 'elevation') - 100);
  });

  test('Half Dome: DEM summit at the Wikidata coordinate matches its elevation (±10 m)', () => {
    const c = HALF_DOME.coordinates ?? { lat: 0, lon: 0 };
    expect(Math.abs(peakNear(c.lat, c.lon, 30) - quantity(HALF_DOME, 'elevation'))).toBeLessThan(
      10,
    );
    expect(Math.abs(DEM.max - quantity(HALF_DOME, 'elevation'))).toBeLessThan(10);
  });

  test('Glacier Point: overlook within 150 m agrees with Wikidata to 2 %', () => {
    const gp = readWikidata(glacierPointJson);
    const c = gp.coordinates ?? { lat: 0, lon: 0 };
    const h = peakNear(c.lat, c.lon, 150);
    // The coordinate sits on the cliff edge (900 m drop within ~50 m), hence the search radius.
    expect(crossCheck(gp, { elevation: h }, 0.02)).toEqual([]);
  });

  test('the tile stands on its datum below the valley floor', () => {
    expect(DATUM).toBeLessThan(DEM.min);
    expect(DEM.min).toBeGreaterThan(1150);
    expect(DEM.min).toBeLessThan(1250);
  });
});
