// Asset plan: a planned asset with no recipe and a build over its platform budget are findings;
// so are unplanned recipes and planned clips the build lacks; the template parses back empty;
// malformed rows are usage errors. plan check on disk reads defaults from the plan.

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planCheck } from './plan-cmd.ts';
import { type BuiltStats, checkPlan, parsePlan, planTemplate } from './plan-template.ts';

const PLAN = `# Asset plan

Brief: a lone wolf hunts deer in a winter forest
Engine: godot
Platform: desktop

## creatures
| asset | kind | refs | tris | clips | hooks |
|---|---|---|---|---|---|
| wolf | creature | Canis lupus | 150k | walk, trot, bite | head hitbox |
| deer | creature | Capreolus capreolus | 40000 | walk | |

## props
| asset | kind | refs | tris | clips | hooks |
|---|---|---|---|---|---|
| log_pile | prop | split firewood | | | |
`;

const wolfBuilt: BuiltStats = {
  lods: [0, 1, 2],
  triangles: [141854, 24968, 2268],
  clips: [{ name: 'walk' }, { name: 'trot' }, { name: 'bite' }],
};

describe('plan check', () => {
  it('flags a planned asset with no recipe and a build over its budget', () => {
    const plan = parsePlan(PLAN);
    const recipes = new Map([
      ['wolf', 'assets/wolf/wolf.ts'],
      ['deer', 'assets/deer/deer.ts'],
    ]);
    const built = new Map([
      ['wolf', wolfBuilt],
      ['deer', { lods: [0, 1, 2], triangles: [52000, 9000, 900], clips: [{ name: 'walk' }] }],
    ]);
    const f = checkPlan(plan, recipes, built);
    expect(f.map((x) => `${x.check}:${x.asset}`)).toEqual(['budget:deer', 'missing:log_pile']);
    expect(f[0]?.message).toContain('52000');
    expect(f[0]?.code).toBe('T3D_QA_FAILED');
    expect(f[1]?.code).toBe('T3D_RECIPE_NOT_FOUND');
    for (const x of f) expect(x.fix.length).toBeGreaterThan(10);
  });

  it('flags an unplanned recipe and a planned clip the build lacks', () => {
    const plan = parsePlan(PLAN);
    const recipes = new Map([
      ['wolf', 'w'],
      ['deer', 'd'],
      ['log_pile', 'l'],
      ['crate', 'assets/crate/crate.ts'],
    ]);
    const built = new Map([
      ['wolf', { ...wolfBuilt, clips: [{ name: 'walk' }, { name: 'trot' }] }],
    ]);
    const f = checkPlan(plan, recipes, built);
    expect(f.map((x) => `${x.check}:${x.asset}`)).toEqual(['clip:wolf', 'extra:crate']);
    expect(f[0]?.message).toContain("'bite'");
  });

  it('agrees when every planned asset has a recipe within budget', () => {
    const plan = parsePlan(PLAN);
    const recipes = new Map([
      ['wolf', 'w'],
      ['deer', 'd'],
      ['log_pile', 'l'],
    ]);
    expect(checkPlan(plan, recipes, new Map([['wolf', wolfBuilt]]))).toEqual([]);
  });

  it('parses header fields, sets, tris units and clips', () => {
    const p = parsePlan(PLAN);
    expect(p).toMatchObject({ engine: 'godot', platform: 'desktop' });
    expect(p.brief).toContain('winter forest');
    expect(p.assets.map((a) => [a.name, a.set, a.tris])).toEqual([
      ['wolf', 'creatures', 150000],
      ['deer', 'creatures', 40000],
      ['log_pile', 'props', undefined],
    ]);
    expect(p.assets[0]?.clips).toEqual(['walk', 'trot', 'bite']);
  });

  it('malformed rows are usage errors', () => {
    const row = (r: string) => `## x\n| asset | tris |\n|---|---|\n${r}\n`;
    expect(() => parsePlan(row('| Wolf | 1 |'))).toThrow(/not snake_case/);
    expect(() => parsePlan(row('| wolf | lots |'))).toThrow(/not a number/);
    expect(() => parsePlan(`${row('| wolf | 1 |')}| wolf | 2 |\n`)).toThrow(/planned twice/);
  });

  it('the template parses back with no assets (the example row is a comment)', () => {
    for (const e of ['godot', 'three', 'unity'] as const) {
      const p = parsePlan(planTemplate(e, 'a fox steals eggs'));
      expect(p).toMatchObject({ engine: e, brief: 'a fox steals eggs', assets: [] });
    }
    expect(planTemplate('godot')).toContain('## creatures');
  });
});

describe('plan check on disk', () => {
  let dir = '';
  const cwd = process.cwd();
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 't3d-plan-'));
    mkdirSync(join(dir, 'assets/wolf'), { recursive: true });
    mkdirSync(join(dir, 'models/wolf'), { recursive: true });
    writeFileSync(join(dir, 'assets/PLAN.md'), PLAN);
    writeFileSync(join(dir, 'assets/wolf/wolf.ts'), 'export const x = 1;\n');
    writeFileSync(join(dir, 'models/wolf/manifest.json'), JSON.stringify(wolfBuilt));
    process.chdir(dir);
  });
  afterEach(() => {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
  });

  it('finds assets/PLAN.md, the godot import folder and the built manifest', () => {
    const r = planCheck(['check']);
    expect(r).toMatchObject({ plan: 'assets/PLAN.md', recipes: 'assets', out: 'models', built: 1 });
    expect(r.findings.map((f) => `${f.check}:${f.asset}`)).toEqual([
      'missing:deer',
      'missing:log_pile',
    ]);
  });

  it('a wrong subcommand or no plan is a usage error', () => {
    expect(() => planCheck(['lint'])).toThrow(/unknown plan command/);
    expect(() => planCheck(['check', 'nope/PLAN.md'])).toThrow(/no plan/);
  });
});
