import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import { STEPS, selectSteps } from './verify.ts';

const VERIFY = resolve(import.meta.dir, 'verify.ts');

/** Runs the real script; only the error paths are spawned (they exit before any step runs). */
function verify(...args: string[]): { code: number | null; out: string; err: string } {
  const p = Bun.spawnSync(['bun', 'run', VERIFY, ...args], {
    env: { ...process.env, T3D_SHARD: '' },
  });
  return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
}

describe('verify --only', () => {
  it('exits 2 on an unknown step and lists the valid ones', () => {
    const r = verify('--only', 'lnt');
    expect(r.code).toBe(2);
    expect(r.err).toContain("'lnt'");
    expect(r.err).toContain('lint,typecheck');
  });

  it('exits 2 with a JSON error, never {"ok":true,"results":[]}', () => {
    const r = verify('--only', 'lnt', '--json');
    expect(r.code).toBe(2);
    const body = JSON.parse(r.out) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toContain('lnt');
  });

  it('exits 2 when --only has no value, at the end or before another flag', () => {
    expect(verify('--only').code).toBe(2);
    expect(verify('--only', '--json').code).toBe(2);
  });

  it('rejects one bad name among good ones and an empty item', () => {
    expect(selectSteps(['--only', 'lint,tset'], undefined)).toEqual({
      error: expect.stringContaining("'tset'"),
    });
    expect('error' in selectSteps(['--only', 'lint,'], undefined)).toBe(true);
  });

  it('runs exactly the named steps, in gate order', () => {
    const one = selectSteps(['--only', 'lint'], undefined);
    expect('steps' in one && one.steps.map((s) => s.name)).toEqual(['lint']);
    const two = selectSteps(['--only', 'test,lint'], undefined);
    expect('steps' in two && two.steps.map((s) => s.name)).toEqual(['lint', 'test']);
  });
});

describe('verify sharding', () => {
  it('runs every step unsharded and on shard 1', () => {
    for (const shard of [undefined, { k: 1, n: 12 }]) {
      const all = selectSteps([], shard);
      expect('steps' in all && all.steps.length).toBe(STEPS.length);
    }
  });

  it('runs only recipes on shards 2..n', () => {
    const r = selectSteps([], { k: 3, n: 12 });
    expect('steps' in r && r.steps.map((s) => s.name)).toEqual(['recipes']);
  });

  it('refuses a selection that leaves nothing to run on this shard', () => {
    expect(selectSteps(['--only', 'lint'], { k: 3, n: 12 })).toEqual({
      error: expect.stringContaining('nothing to run on shard 3/12'),
    });
  });
});
