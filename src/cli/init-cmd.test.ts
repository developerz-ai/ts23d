// t3d init: an existing assets/ is never overwritten and every skip is listed; a second run changes
// nothing; JSON files only gain missing keys; the engine is guessed or must be named; the import
// folder must sit inside the project (D53).

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectEngine, initProject } from './init-cmd.ts';
import { parsePlan } from './plan-template.ts';

let dir = '';
const read = (rel: string): string => readFileSync(join(dir, rel), 'utf8');
const init = (...a: string[]) => initProject(['--dir', dir, ...a]);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 't3d-init-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('t3d init', () => {
  it('refuses to overwrite an existing assets/ and lists what it skipped', async () => {
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'assets/PLAN.md'), 'my plan\n');
    writeFileSync(join(dir, 'assets/style.ts'), 'mine\n');
    const r = await init('--engine', 'godot');
    expect(r.skipped).toEqual(['assets/PLAN.md', 'assets/style.ts']);
    expect(read('assets/PLAN.md')).toBe('my plan\n');
    expect(read('assets/style.ts')).toBe('mine\n');
    expect(r.created).toContain('t3d.config.ts');
  });

  it('a second run creates nothing and changes no byte', async () => {
    await init('--engine', 'godot');
    const before = ['package.json', '.mcp.json', 'assets/PLAN.md'].map(read);
    const r = await init('--engine', 'godot');
    expect(r.created).toEqual([]);
    expect(r.merged).toEqual([]);
    expect(['package.json', '.mcp.json', 'assets/PLAN.md'].map(read)).toEqual(before);
  });

  it('godot: plan, style, config, mcp entry, scripts into models/ with the godot profile', async () => {
    const r = await init('--engine', 'godot', '--brief', 'a wolf hunts deer');
    expect(r.out).toBe('models');
    expect(parsePlan(read('assets/PLAN.md'))).toMatchObject({
      engine: 'godot',
      brief: 'a wolf hunts deer',
    });
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts['assets:watch']).toBe(
      't3d build --watch assets --out models --profile godot',
    );
    expect(pkg.devDependencies['@developerz.ai/ts23d']).toMatch(/^\^\d+\.\d+\.\d+/);
    expect(JSON.parse(read('.mcp.json')).mcpServers.ts23d.args).toContain('mcp');
    expect(existsSync(join(dir, '.ts23d/.gdignore'))).toBe(true);
    expect(read('t3d.config.ts')).toContain('export const config = defineConfig');
  });

  it('existing package.json and .mcp.json only gain missing keys', async () => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'game', scripts: { assets: 'mine' }, dependencies: { three: '1' } }),
    );
    writeFileSync(
      join(dir, '.mcp.json'),
      JSON.stringify({ mcpServers: { other: { command: 'x' } } }),
    );
    const r = await init();
    expect(r.engine).toBe('three');
    expect(r.merged).toEqual(['.mcp.json', 'package.json']);
    const pkg = JSON.parse(read('package.json'));
    expect(pkg).toMatchObject({ name: 'game', dependencies: { three: '1' } });
    expect(pkg.scripts.assets).toBe('mine');
    expect(pkg.scripts['assets:watch']).toContain('--profile web');
    expect(Object.keys(JSON.parse(read('.mcp.json')).mcpServers)).toEqual(['other', 'ts23d']);
  });

  it('no engine named or detectable, an unknown engine, an outside --out: usage errors', async () => {
    await expect(init()).rejects.toThrow(/cannot tell the engine/);
    await expect(init('--engine', 'cry')).rejects.toThrow(/--engine takes/);
    await expect(init('--engine', 'godot', '--out', '../shared')).rejects.toThrow(
      /outside the project/,
    );
    writeFileSync(join(dir, 'project.godot'), '');
    expect(detectEngine(dir)).toBe('godot');
  });

  it('unity keeps recipes out of Assets/', async () => {
    const r = await init('--engine', 'unity');
    expect(r.created).toContain('ts23d/PLAN.md');
    expect(JSON.parse(read('package.json')).scripts.assets).toContain('--out Assets/Models/ts23d');
  });
});
