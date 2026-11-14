import { describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CRITERIA } from '../../src/qa/critique.ts';
import { critiqueMode, critiqueViolations, ENFORCE_FROM, keepCritiques } from './critique.ts';

const sha = (s: string): string => new Bun.CryptoHasher('sha256').update(s).digest('hex');

async function recipe(critique?: (h: Record<string, string>) => unknown): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ts23d-critique-'));
  const out = join(dir, 'out', 'crate');
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'hero.png'), 'HERO');
  await writeFile(join(out, 'sheet.png'), 'SHEET');
  const hashes = { 'hero.png': sha('HERO'), 'sheet.png': sha('SHEET') };
  if (critique) await writeFile(join(out, 'critique.json'), JSON.stringify(critique(hashes)));
  return dir;
}

const scored = (score: number, renders: Record<string, string>) => ({
  asset: 'crate',
  reviewer: 'agent',
  overall: score,
  scores: Object.fromEntries(CRITERIA.map((c) => [c, { score, reason: 'r', fixes: ['f'] }])),
  renders,
});

describe('critiqueMode', () => {
  it('warns before ENFORCE_FROM and enforces from that day on', () => {
    expect(ENFORCE_FROM).toBe('2027-01-15');
    expect(critiqueMode(new Date('2027-01-14T23:59:59Z'))).toBe('warn');
    expect(critiqueMode(new Date('2027-01-15T00:00:00Z'))).toBe('enforce');
    expect(critiqueMode(new Date('2030-06-01T00:00:00Z'))).toBe('enforce');
  });
});

describe('critiqueViolations', () => {
  it('reports a missing critique with the command that makes one', async () => {
    const v = await critiqueViolations(await recipe(), 'recipes/crate/crate.ts', 'crate');
    expect(v).toHaveLength(1);
    expect(v[0]?.fix).toContain('t3d critique recipes/crate/crate.ts');
  });

  it('reports a stale critique when the committed hero changed', async () => {
    const dir = await recipe((h) => scored(9, h));
    await writeFile(join(dir, 'out', 'crate', 'hero.png'), 'HERO v2');
    const v = await critiqueViolations(dir, 'x.ts', 'crate');
    expect(v.map((x) => x.message)).toEqual([
      expect.stringContaining('crate: critique is stale — hero.png changed'),
    ]);
  });

  it('reports low scores and unparsable JSON; passes a fresh, good critique', async () => {
    const low = await critiqueViolations(await recipe((h) => scored(7, h)), 'x.ts', 'crate');
    expect(low).toHaveLength(CRITERIA.length);
    const broken = await recipe();
    await writeFile(join(broken, 'out', 'crate', 'critique.json'), '{nope');
    expect((await critiqueViolations(broken, 'x.ts', 'crate'))[0]?.message).toContain(
      'not a JSON object',
    );
    expect(await critiqueViolations(await recipe((h) => scored(8, h)), 'x.ts', 'crate')).toEqual(
      [],
    );
  });
});

describe('keepCritiques', () => {
  it('carries critique.json into the fresh render only for assets still exported', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ts23d-keep-'));
    const out = join(root, 'out');
    const tmp = join(root, '.out-tmp');
    for (const a of ['crate', 'gone']) {
      await mkdir(join(out, a), { recursive: true });
      await writeFile(join(out, a, 'critique.json'), `{"asset":"${a}"}`);
    }
    await mkdir(join(tmp, 'crate'), { recursive: true });
    await writeFile(join(tmp, 'crate', 'manifest.json'), '{}');
    expect(await keepCritiques(out, tmp)).toEqual(['crate/critique.json']);
    expect(await readFile(join(tmp, 'crate', 'critique.json'), 'utf8')).toBe('{"asset":"crate"}');
    expect(await Bun.file(join(tmp, 'gone', 'critique.json')).exists()).toBe(false);
    expect(await keepCritiques(join(root, 'none'), tmp).catch(() => 'threw')).toEqual([]);
  });
});
