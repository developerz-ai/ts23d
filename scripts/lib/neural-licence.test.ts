import { afterAll, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { neuralLicenceViolations } from './neural-licence.ts';

const root = await mkdtemp(join(tmpdir(), 'neural-licence-'));
afterAll(() => rm(root, { recursive: true, force: true }));

const record = (licence: string) => ({
  contract: 't3d-neural/1',
  task: 'mesh',
  key: 'a'.repeat(64),
  model: { id: 'm', licence, weightsSha256: 'b'.repeat(64) },
  server: 'test',
  request: {},
  outputs: [],
});

async function cacheWith(licence: string): Promise<string> {
  const dir = join(root, licence.replace(/\W/g, '_'));
  await mkdir(join(dir, 'neural', 'k1'), { recursive: true });
  await writeFile(join(dir, 'neural', 'k1', 'record.json'), JSON.stringify(record(licence)));
  return dir;
}

describe('neuralLicenceViolations (ADR 015)', () => {
  it('refuses a committed output whose model licence does not allow publishing', async () => {
    const v = await neuralLicenceViolations(await cacheWith('CC-BY-NC-4.0'));
    expect(v).toHaveLength(1);
    expect(v[0]?.message).toContain('CC-BY-NC-4.0');
  });

  it('passes a permissive licence and a recipe with no neural cache', async () => {
    expect(await neuralLicenceViolations(await cacheWith('MIT'))).toEqual([]);
    expect(await neuralLicenceViolations(join(root, 'none'))).toEqual([]);
  });
});
