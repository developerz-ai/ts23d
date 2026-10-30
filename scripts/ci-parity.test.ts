// Keep the local check aligned with CI verification and contact-sheet rendering.

import { expect, it } from 'bun:test';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { STEPS } from './verify.ts';

it('ci.yml runs the full local gate', async () => {
  const ci = await Bun.file('.github/workflows/ci.yml').text();
  expect(ci).toContain('bun run verify');
  expect(ci).not.toMatch(/bun run verify --only/);
});

it('every package.json gate script is a verify step', async () => {
  const pkg = (await Bun.file('package.json').json()) as { scripts: Record<string, string> };
  for (const s of [
    'lint',
    'typecheck',
    'boundaries',
    'determinism',
    'filesize',
    'test',
    'recipes',
    'build',
  ]) {
    expect(pkg.scripts[s]).toBeDefined();
    expect(STEPS.map((x) => x.name)).toContain(s as (typeof STEPS)[number]['name']);
  }
});

it.each([
  { name: 'runs verify before shots', verify: 0, shots: 0, expected: 0 },
  { name: 'stops when verify fails', verify: 23, shots: 0, expected: 23 },
  { name: 'propagates a shots failure', verify: 0, shots: 42, expected: 42 },
])('bin/check $name', ({ verify, shots, expected }) => {
  const root = resolve(import.meta.dir, '..');
  const fixture = mkdtempSync(join(tmpdir(), 'ts23d-ci-parity-'));
  try {
    const log = join(fixture, 'calls');
    const mise = join(fixture, 'mise');
    writeFileSync(
      mise,
      `#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$PWD" "$*" >> "$CHECK_LOG"
case "$*" in
  *' -- bun run verify') exit "$VERIFY_EXIT" ;;
  *' -- bun run shots') exit "$SHOTS_EXIT" ;;
  *) exit 99 ;;
esac
`,
    );
    chmodSync(mise, 0o755);
    const result = Bun.spawnSync(['bash', join(root, 'bin/check')], {
      cwd: fixture,
      env: {
        ...process.env,
        PATH: `${fixture}:${process.env['PATH'] ?? ''}`,
        CHECK_LOG: log,
        VERIFY_EXIT: String(verify),
        SHOTS_EXIT: String(shots),
      },
    });
    expect(result.stderr.toString()).toBe('');
    expect(result.exitCode).toBe(expected);
    const pin = readFileSync(join(root, '.bun-version'), 'utf8').trim();
    const calls = [root, `exec bun@${pin} -- bun run verify`];
    if (verify === 0) calls.push(root, `exec bun@${pin} -- bun run shots`);
    expect(readFileSync(log, 'utf8').trim().split('\n')).toEqual(calls);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
