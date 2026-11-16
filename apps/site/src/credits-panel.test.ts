import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SHOWCASE } from '../../../showcase.config.ts';
import {
  adapterLabel,
  creditLine,
  creditOf,
  dataCredits,
  modelName,
  shortLicence,
} from './credits-panel.ts';

const RECIPES = join(import.meta.dir, '../../../recipes');

/** Every committed record.json of a recipe folder, through the site's reader. */
const recordsOf = (folder: string) => {
  const dir = join(RECIPES, folder, 'neural');
  return readdirSync(dir).flatMap((key) => {
    const c = creditOf(JSON.parse(readFileSync(join(dir, key, 'record.json'), 'utf8')));
    return c ? [c] : [];
  });
};

describe('creditOf', () => {
  test('anything but a t3d-neural record is no credit', () => {
    expect(creditOf(null)).toBeNull();
    expect(creditOf({ key: 'k', model: { id: 'x' } })).toBeNull();
    expect(creditOf({ contract: 't3d-neural/1', key: 'k', model: {} })).toBeNull();
  });

  test('reads model id, licence, task, adapter and outputs from wolf_hybrid’s record.json', () => {
    const records = recordsOf('wolf_hybrid');
    const mesh = records.find((r) => r.task === 'mesh');
    expect(mesh?.model).toBe('pixal3d');
    expect(shortLicence(mesh?.licence ?? '')).toBe('MIT');
    expect(mesh?.files).toEqual(['output-0.glb']);
    const image = records.find((r) => r.task === 'image');
    expect(image?.model).toBe('z-image');
    expect(shortLicence(image?.licence ?? '')).toBe('Apache-2.0');
    expect(creditLine(records)).toBe(
      'Made with Pixal3D (MIT) and Z-Image-Turbo (Apache-2.0) on the code skeleton',
    );
  });
});

describe('creditLine', () => {
  test('no models → no line; one model, repeated models named once', () => {
    expect(creditLine([])).toBe('');
    const c = { task: 'mesh', model: 'trellis2', licence: 'MIT' };
    expect(creditLine([c, c])).toBe('Made with TRELLIS.2 (MIT) on the code skeleton');
  });

  test('adapters show their kind and script, never a host', () => {
    expect(adapterLabel('http:http://127.0.0.1:8193')).toBe('http');
    expect(adapterLabel('script:pixal3d_best.py (lab neural-models, --low_vram)')).toBe(
      'script:pixal3d_best.py',
    );
    expect(adapterLabel('')).toBe('adapter not stated');
  });

  test('an unknown model shows its id and never invents a licence', () => {
    expect(modelName('mystery')).toBe('mystery');
    expect(shortLicence('')).toBe('licence not stated');
  });
});

describe('dataCredits', () => {
  test('the OpenStreetMap source of city_block is credited ODbL; plain sources are not', () => {
    const manifest = JSON.parse(
      readFileSync(join(RECIPES, 'city_block/out/city_block/manifest.json'), 'utf8'),
    ) as { sources: string[] };
    const credits = dataCredits(manifest.sources);
    expect(credits).toHaveLength(1);
    expect(credits[0]).toStartWith('© OpenStreetMap contributors, ODbL 1.0');
    expect(dataCredits(['https://en.wikipedia.org/wiki/Wolf'])).toEqual([]);
  });
});

describe('showcase.config.ts', () => {
  test('names the model each committed record actually used, per task', () => {
    for (const [asset, tasks] of Object.entries(SHOWCASE)) {
      const records = recordsOf(asset);
      for (const [task, pick] of Object.entries(tasks))
        expect(records.find((r) => r.task === task)?.model).toBe(pick.model);
    }
  });
});
