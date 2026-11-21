import { describe, expect, it } from 'bun:test';
import {
  compile,
  createRng,
  dmath,
  MATERIAL_LIBRARY,
  type Mesh,
  type StripId,
  type WeatherCoverage,
} from '@developerz.ai/ts23d';
import { dot, sub, type V } from '../_lib/bust/kit.ts';
import { pauldron } from './armour.ts';
import { cap, LAP } from './fittings.ts';
import { orc_head } from './orc_head.ts';
import { PLATE_STRIP } from './palette.ts';

/** D547: plate must be a bare metal. A painted strip is a dielectric film over the steel: it
 *  takes no reflection of its own and reads as grey plastic. */
function stripFindings(strip: StripId): string[] {
  const m = (
    MATERIAL_LIBRARY as Record<string, (typeof MATERIAL_LIBRARY)[keyof typeof MATERIAL_LIBRARY]>
  )[strip];
  if (!m) return [`'${strip}' is not a material strip`];
  const out: string[] = [];
  if ((m.metalness ?? 0) < 1) out.push(`'${strip}' is not a metal`);
  if (m.params && 'paint' in m.params) out.push(`'${strip}' is painted: the plate shows paint`);
  return out;
}

/** How far the crown plate's outer face leaves its ellipsoid, metres (RMS over the vertices of
 *  the left pauldron's crown, between 20° and 55° from its axis): the hammer's work. */
function relief(plate: Mesh): number {
  const { at, axis, R, H } = cap(1);
  let sum = 0;
  let n = 0;
  for (let i = 0; i < plate.positions.length; i += 3) {
    const p: V = [
      plate.positions[i] ?? 0,
      plate.positions[i + 1] ?? 0,
      plate.positions[i + 2] ?? 0,
    ];
    const d = sub(p, at);
    const h = dot(d, axis);
    const r = dmath.hypot(d[0] - axis[0] * h, d[1] - axis[1] * h, d[2] - axis[2] * h);
    // Outer face only: on or just inside the crown's ellipsoid (the inner face is 6 mm in).
    const e = dmath.hypot(r / (R + LAP), h / (H + LAP));
    const polar = dmath.atan2(r / (R + LAP), h / (H + LAP));
    if (polar < 0.35 || polar > 0.96 || e < 0.965) continue;
    const off = (e - 1) * (R + LAP);
    sum += off * off;
    n++;
  }
  return n ? Math.sqrt(sum / n) : 0;
}

function reliefFindings(plate: Mesh | undefined): string[] {
  if (!plate) return ['no crown plate'];
  const rms = relief(plate);
  return rms < 0.0004
    ? [`crown relief ${(rms * 1000).toFixed(2)} mm RMS (want ≥ 0.4): a pressed bowl, not forged`]
    : [];
}

describe('orc plate reads as metal (D547)', () => {
  it('painted steel, the strip the pauldrons were on, is caught', () => {
    expect(stripFindings('steel_painted').length).toBeGreaterThan(0);
  });
  it('the plates are on a bare metal strip', () => {
    expect(stripFindings(PLATE_STRIP)).toEqual([]);
  });
  it('a smooth dome (the LOD1 crown, no hammer work) is caught', () => {
    expect(reliefFindings(pauldron(1, 1, createRng(7)).plates[0]).length).toBeGreaterThan(0);
  });
  it('the LOD0 crown is hammer-peened and dented', () => {
    expect(reliefFindings(pauldron(1, 0, createRng(7)).plates[0])).toEqual([]);
  });
  it('the crown laps over the skirt by a plate and a gap, riveted through the lap', () => {
    const p = pauldron(1, 0, createRng(7));
    expect(LAP).toBeGreaterThanOrEqual(0.006);
    // Eight in the lap ring, three on each of the two lames.
    expect(p.rivets).toHaveLength(14);
  });
});

/** D548: the plate must carry measured wear, each kind where it happens. */
function wearFindings(report: readonly WeatherCoverage[]): string[] {
  const plate = report.filter((w) => w.target === 'plate');
  const out: string[] = [];
  for (const [effect, where] of [
    ['chips', 'convex-edges'],
    ['scratches', 'exposed-panels'],
    ['mud', 'cavities'],
  ] as const) {
    const hit = plate.find((w) => w.effect === effect);
    if (!hit) out.push(`no ${effect} on the plate`);
    else if (!hit.where.includes(where)) out.push(`${effect} on '${hit.where}', not ${where}`);
    else if (!(hit.actual > 0.02)) out.push(`${effect} covers ${hit.actual} of its surface`);
  }
  return out;
}

describe('orc plate wear (D548)', () => {
  const c = compile(orc_head, { lod: 1 });
  it('a plate with only the fur and strap weathered is caught', () => {
    const others = (c.weather ?? []).filter((w) => w.target !== 'plate');
    expect(others.length).toBeGreaterThan(0);
    expect(wearFindings(others)).toHaveLength(3);
  });
  it('edges are rubbed bright, the open plate scratched, the hollows sooted', () => {
    expect(wearFindings(c.weather ?? [])).toEqual([]);
  });
});
