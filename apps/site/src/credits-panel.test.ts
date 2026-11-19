import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SHOWCASE, type ShowcasePick } from '../../../showcase.config.ts';
import {
  adapterKind,
  adapterLabel,
  creditLine,
  creditOf,
  dataCredits,
  isHosted,
  licenceLabel,
  megabytes,
  modelName,
  recordLine,
  shortLicence,
  sorted,
  stepsOf,
} from './credits-panel.ts';

const RECIPES = join(import.meta.dir, '../../../recipes');

/** Every committed record.json of a recipe folder, through the site's reader. */
const recordsOf = (folder: string) => {
  const dir = join(RECIPES, folder, 'neural');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((key) => {
    if (!/^[0-9a-f]{64}$/.test(key)) return [];
    const c = creditOf(JSON.parse(readFileSync(join(dir, key, 'record.json'), 'utf8')));
    return c ? [c] : [];
  });
};

/** A record as `t3d neural run` writes it (fields the site reads, plus ones it must ignore). */
const record = (over: Record<string, unknown> = {}) => ({
  adapter: 'meshy',
  contract: 't3d-neural/1',
  key: 'k1',
  model: {
    id: 'meshy-7.1',
    licence: 'own',
    task: 'mesh',
    terms: 'https://www.meshy.ai/terms-of-use',
  },
  outputs: [
    { bytes: 20_378_864, file: 'local-0.glb', local: true, mime: 'model/gltf-binary', sha256: 'a' },
  ],
  server: 'meshy task 0000; consumed_credits 30',
  task: 'mesh',
  ...over,
});

const BLENDER = record({
  adapter: 'blender:blender',
  key: 'k2',
  task: 'blender',
  model: {
    id: 'blender-blender',
    licence: 'own',
    task: 'blender',
    tool: { name: 'blender', version: '5.3.0', licence: 'GPL-2.0-or-later', scriptSha256: 'x' },
  },
  outputs: [
    { bytes: 10_154_260, file: 'output-0.glb', mime: 'model/gltf-binary', sha256: 'b' },
    { bytes: 5608, file: 'output-1.json', mime: 'application/json', sha256: 'c' },
  ],
});

describe('creditOf', () => {
  test('anything but a t3d-neural record is no credit', () => {
    expect(creditOf(null)).toBeNull();
    expect(creditOf({ key: 'k', model: { id: 'x' } })).toBeNull();
    expect(creditOf({ contract: 't3d-neural/1', key: 'k', model: {} })).toBeNull();
  });

  test('a local output is never listed or counted: it is not published', () => {
    const c = creditOf(record());
    expect(c?.files).toEqual([]);
    expect(c?.bytes).toBe(0);
  });

  test('a terms link that is not https is dropped', () => {
    const model = { id: 'm', licence: 'own', terms: 'javascript:alert(1)' };
    expect(creditOf(record({ model }))?.terms).toBe('');
  });

  test('a hosted service: model, own outputs, terms, and "a hosted service (paid)"', () => {
    const c = creditOf(record());
    expect(c?.model).toBe('meshy-7.1');
    expect(c?.terms).toBe('https://www.meshy.ai/terms-of-use');
    expect(c ? recordLine(c) : '').toBe(
      'mesh: Meshy 7.1 image-to-3D · own outputs · a hosted service (paid)',
    );
  });

  test('a tool record: Blender, its version and licence, the committed files and their bytes', () => {
    const c = creditOf(BLENDER);
    expect(c?.tool).toEqual({ name: 'blender', version: '5.3.0', licence: 'GPL-2.0-or-later' });
    expect(c?.files).toEqual(['output-0.glb', 'output-1.json']);
    expect(c?.bytes).toBe(10_159_868);
    expect(megabytes(c?.bytes ?? 0)).toBe('10.2 MB');
    expect(megabytes(223_952)).toBe('224 KB');
  });
});

describe('Blender steps', () => {
  test('only a t3d-blender-report lists steps', () => {
    expect(stepsOf(null)).toEqual([]);
    expect(stepsOf({ steps: [{ op: 'clean' }] })).toEqual([]);
    expect(stepsOf({ contract: 't3d-blender-report/1', steps: 'clean' })).toEqual([]);
  });

  test('the step ops, in run order, lead the record line', () => {
    const steps = stepsOf({
      contract: 't3d-blender-report/1',
      steps: [{ op: 'clean', seconds: 2.8 }, { op: 'retopo' }, { nope: 1 }, { op: 'export' }],
    });
    expect(steps).toEqual(['clean', 'retopo', 'export']);
    const c = creditOf(BLENDER);
    expect(c ? recordLine({ ...c, steps }) : '').toBe(
      'Blender steps (clean → retopo → export): Blender 5.3.0 · GPL-2.0-or-later tool, own outputs · run headless, cached',
    );
  });
});

describe('the ranger’s committed records (recipes/ranger/neural)', () => {
  const records = recordsOf('ranger');

  test('four records; the raw mesh and the rigged mesh stay local, 11.3 MB is published', () => {
    expect(sorted(records).map((r) => r.task)).toEqual(['mesh', 'rig', 'blender', 'image']);
    expect(records.flatMap((r) => r.files).filter((f) => f.startsWith('local-'))).toEqual([]);
    expect(megabytes(records.reduce((n, r) => n + r.bytes, 0))).toBe('11.3 MB');
  });

  test('the credit line names every model and tool with its licence, and nothing else', () => {
    expect(creditLine(records)).toBe(
      'Made with Meshy 7.1 image-to-3D (own outputs), Meshy rigging and animation (own outputs), Blender 5.3.0 (GPL-2.0-or-later tool, own outputs) and Z-Image-Turbo (Apache-2.0)',
    );
  });
});

describe('creditLine', () => {
  test('no models → no line; one model, repeated models named once', () => {
    expect(creditLine([])).toBe('');
    const c = { task: 'mesh', model: 'trellis2', licence: 'MIT', tool: null };
    expect(creditLine([c, c])).toBe('Made with TRELLIS.2 (MIT)');
  });

  test('the surface model comes before the concept image, whatever the record order', () => {
    const image = {
      task: 'image',
      model: 'z-image',
      licence: 'Apache-2.0 (model card Tongyi-MAI/Z-Image-Turbo: "license: apache-2.0")',
      tool: null,
    };
    const mesh = { task: 'mesh', model: 'pixal3d', licence: 'MIT (model card)', tool: null };
    expect(creditLine([image, mesh])).toBe(
      'Made with Pixal3D (MIT) and Z-Image-Turbo (Apache-2.0)',
    );
  });

  test('adapters show their kind and script, never a host', () => {
    expect(adapterLabel('http:http://127.0.0.1:8193')).toBe('http');
    expect(adapterLabel('script:pixal3d_best.py (lab neural-models, --low_vram)')).toBe(
      'script:pixal3d_best.py',
    );
    expect(adapterLabel('')).toBe('adapter not stated');
    expect(isHosted('meshy')).toBe(true);
    expect(isHosted('meshy-local:x')).toBe(false);
  });

  test('an unknown model shows its id and never invents a licence', () => {
    expect(modelName('mystery')).toBe('mystery');
    expect(shortLicence('')).toBe('licence not stated');
    expect(licenceLabel({ licence: '', tool: null })).toBe('licence not stated');
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
  /** Every recipe folder holding committed records, whether or not the table knows it. */
  const folders = readdirSync(RECIPES)
    .filter((folder) => recordsOf(folder).length > 0)
    .sort();
  const rowsOf = (folder: string): Map<string, ShowcasePick> =>
    new Map(Object.entries(SHOWCASE[folder] ?? {}));

  test('has an entry for every recipe folder with committed records, and for no other', () => {
    expect(folders.length).toBeGreaterThan(0);
    expect(Object.keys(SHOWCASE).sort()).toEqual(folders);
  });

  test('has a row for every task the records hold, and no row without a record', () => {
    for (const folder of folders) {
      const tasks = [...new Set(recordsOf(folder).map((r) => r.task))].sort();
      expect({ folder, tasks: [...rowsOf(folder).keys()].sort() }).toEqual({ folder, tasks });
    }
  });

  test('each row names the model, adapter kind and licence of every record of its task', () => {
    for (const folder of folders)
      for (const r of recordsOf(folder)) {
        const pick = rowsOf(folder).get(r.task);
        const at = { folder, task: r.task };
        // The adapter is compared by kind: a record holds the machine-local URL the run used
        // (`http:http://127.0.0.1:8190`), which the table must not publish as a name.
        expect({
          ...at,
          model: pick?.model,
          adapter: adapterKind(pick?.adapter ?? ''),
          licence: pick?.licence,
        }).toEqual({
          ...at,
          model: r.model,
          adapter: adapterKind(r.adapter),
          licence: shortLicence(r.licence),
        });
        // A tool row names the tool and the version that ran (`Blender 5.3.0`).
        if (r.tool)
          expect({ ...at, adapter: pick?.adapter }).toMatchObject({
            ...at,
            adapter: expect.stringContaining(modelName(r)),
          });
      }
  });

  test('no row shows a URL or a host', () => {
    for (const [folder, tasks] of Object.entries(SHOWCASE))
      for (const [task, pick] of Object.entries(tasks))
        expect(`${folder}.${task}: ${pick.adapter}`).not.toMatch(
          /https?:|localhost|\d+\.\d+\.\d+\.\d+/,
        );
  });

  test('adapterKind reads the same kind from a record and from a table row', () => {
    expect(adapterKind('http:http://127.0.0.1:8190')).toBe('http');
    expect(adapterKind('http (ts23d-neural-server)')).toBe('http');
    expect(adapterKind('blender:blender')).toBe('blender');
    expect(adapterKind('script (pixal3d_best.py, --low_vram)')).not.toBe(adapterKind('http:x'));
    expect(adapterKind('')).toBe('');
  });
});
