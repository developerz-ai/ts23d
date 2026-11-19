import { describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type AssetTriangles,
  bandFindings,
  budgetWhy,
  readAssetTriangles,
} from './budget-bands.ts';
import { BANDS, type Band, bandOf } from './lib/budget-bands.ts';
import { BUDGET_BASELINE } from './lib/budget-baseline.ts';

const BAND: Band = { id: 'car', kind: 'vehicle', triangles: [80000, 15000, 1200], source: 'pb' };
const car = (triangles: AssetTriangles['triangles'], why?: string): AssetTriangles => ({
  asset: 'car_a',
  file: 'recipes/car_a/car_a.ts',
  kind: 'vehicle',
  tags: [],
  triangles,
  ...(why ? { why } : {}),
});
const OVER = [909000, 77900, 5500] as const;
const run = (a: AssetTriangles[], baseline = {}) => bandFindings(a, baseline, [BAND]);

describe('bandFindings', () => {
  it('fails an asset over its class band with no reason, naming the LOD, band and ratio', () => {
    const { enforced, warned } = run([car(OVER)]);
    expect(warned).toEqual([]);
    expect(enforced).toHaveLength(1);
    expect(enforced[0]?.message).toContain('T3D_BUDGET_BAND car_a');
    expect(enforced[0]?.message).toContain('LOD0 909000 > 80000');
    expect(enforced[0]?.message).toContain('11.4×');
    expect(enforced[0]?.fix).toContain('Budget why:');
  });

  it('fails one LOD over even when the others fit', () => {
    expect(run([car([50000, 9000, 1500])]).enforced[0]?.message).toContain('LOD2 1500 > 1200');
  });

  it('passes an over-band asset whose README says why', () => {
    expect(run([car(OVER, 'hero showroom car, seen at 30 cm in a configurator')])).toEqual({
      enforced: [],
      warned: [],
    });
  });

  it('passes an asset within its band (the ceiling itself included)', () => {
    expect(run([car([80000, 15000, 1200])])).toEqual({ enforced: [], warned: [] });
  });

  it('warns, not fails, for a baseline offender no bigger than recorded', () => {
    const { enforced, warned } = run([car(OVER)], {
      car_a: { triangles: OVER, next: 'reduce' },
    });
    expect(enforced).toEqual([]);
    expect(warned[0]?.message).toContain('car_a');
  });

  it('fails a baseline offender that grew past its recorded count', () => {
    const { enforced } = run([car([909001, 77900, 5500])], {
      car_a: { triangles: OVER, next: 'reduce' },
    });
    expect(enforced[0]?.message).toContain('grew past its baseline');
  });

  it('fails a stale baseline entry: the asset now fits or says why', () => {
    const base = { car_a: { triangles: OVER, next: 'reduce' } };
    for (const a of [car([1000, 500, 100]), car(OVER, 'a reason long enough to count here')]) {
      const { enforced } = run([a], base);
      expect(enforced).toHaveLength(1);
      expect(enforced[0]?.message).toContain('stale');
    }
  });

  it('fails a baseline entry for an asset that no longer exists', () => {
    const { enforced } = run([], { gone: { triangles: OVER, next: 'reduce' } });
    expect(enforced[0]?.message).toContain('stale');
  });

  it('fails a manifest without three triangle counts instead of passing it', () => {
    const { enforced } = run([car([Number.NaN, Number.NaN, Number.NaN])]);
    expect(enforced[0]?.message).toContain('has no triangles');
  });

  it('fails an asset whose kind has no band row', () => {
    const { enforced } = run([{ ...car([1, 1, 1]), kind: 'spaceship' }]);
    expect(enforced[0]?.message).toContain("no band for kind 'spaceship'");
  });
});

describe('budgetWhy', () => {
  it('reads a "Budget why:" line of at least 20 characters, case-insensitive', () => {
    expect(budgetWhy('# x\n\nbudget why: a hero bust seen at 40 cm')).toBe(
      'a hero bust seen at 40 cm',
    );
    expect(budgetWhy('# x\n\nBudget why: hero')).toBeUndefined();
    expect(budgetWhy('# x\nno reason')).toBeUndefined();
  });
});

describe('bandOf', () => {
  it('picks the first tagged row of the kind, else the fallback', () => {
    expect(bandOf('vehicle', ['car', 'sports-car'])?.id).toBe('sports-car');
    expect(bandOf('vehicle', ['car'])?.id).toBe('passenger-car');
    expect(bandOf('vehicle', ['military', 'tracked'])?.id).toBe('afv');
    expect(bandOf('vehicle', ['hovercraft'])?.id).toBe('vehicle');
    expect(bandOf('nebula', [])).toBeUndefined();
  });

  it('cites a playbook or the BUDGETS fallback on every row, LODs descending', () => {
    for (const b of BANDS) {
      expect(b.source).toMatch(/^docs\/playbooks\/|BUDGETS\./);
      expect(b.triangles[0]).toBeGreaterThan(b.triangles[1]);
      expect(b.triangles[1]).toBeGreaterThan(b.triangles[2]);
    }
  });
});

/** The offenders and counts in the baseline as it shipped on 2026-11-19 (after this PR's
 *  reductions). The baseline may only shrink: an asset added back (hydra, fox, …) or a count
 *  raised past these fails here (D349). When you lower or delete a baseline entry, lower or delete
 *  its row here too, so the ratchet holds what you reached. */
const RECORDED: Readonly<Record<string, readonly number[]>> = {
  asteroid: [18772, 2036, 360],
  asteroid_b: [17768, 1980, 320],
  asteroid_c: [19608, 2076, 356],
  boxcar: [19098, 7500, 1112],
  boxcar_nw: [19274, 7680, 1112],
  cargo_container_scifi: [16862, 6950, 736],
  rts_barracks: [39024, 7802, 668],
  rts_barracks_damaged: [35810, 8056, 860],
  rts_resource: [9730, 2158, 330],
  rts_resource_depleted: [10158, 2282, 338],
};

describe('BUDGET_BASELINE', () => {
  it('only shrinks: no new asset, no count above the 2026-11-19 record', () => {
    for (const [asset, e] of Object.entries(BUDGET_BASELINE)) {
      const was = RECORDED[asset];
      expect(was, `${asset} was not an offender on 2026-11-19: reduce it or say why`).toBeDefined();
      for (const [i, n] of e.triangles.entries()) expect(n).toBeLessThanOrEqual(was?.[i] ?? 0);
    }
  });

  it('gives every entry a recommendation', () => {
    for (const e of Object.values(BUDGET_BASELINE)) expect(e.next.length).toBeGreaterThan(10);
  });
});

describe('readAssetTriangles', () => {
  it('reads committed manifests and the folder README reason', async () => {
    const root = await mkdtemp(join(tmpdir(), 't3d-bands-'));
    try {
      await mkdir(join(root, 'recipes/car/out/car_open'), { recursive: true });
      await writeFile(join(root, 'recipes/car/car.ts'), '// car\n');
      await writeFile(
        join(root, 'recipes/car/README.md'),
        '# car\n\nBudget why: showroom hero car, close-up\n',
      );
      await writeFile(
        join(root, 'recipes/car/out/car_open/manifest.json'),
        JSON.stringify({ name: 'car_open', kind: 'vehicle', tags: ['car'], triangles: [3, 2, 1] }),
      );
      expect(await readAssetTriangles(root)).toEqual([
        {
          asset: 'car_open',
          file: 'recipes/car/car.ts',
          kind: 'vehicle',
          tags: ['car'],
          triangles: [3, 2, 1],
          why: 'showroom hero car, close-up',
        },
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
