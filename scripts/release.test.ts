// Release stamp guards: a stamp that would publish nothing, lacks a summary, goes backwards, stamps
// twice or starts from a stale link index is refused; a good stamp also writes docs/changelog/.

import { expect, it } from 'bun:test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ts23dError } from '../src/core/index.ts';
import { changelogSection, drift, readPages } from './changelog.ts';
import { compareSemver, stampChangelog } from './release.ts';

const LOG = `# Changelog

## [Unreleased]

Things users get.

### Added
- a thing

## [0.4.0] - 2026-11-08

### Fixed
- old thing
`;

function refusal(f: () => unknown): Ts23dError {
  try {
    f();
  } catch (e) {
    if (e instanceof Ts23dError) return e;
    throw e;
  }
  throw new Error('expected a T3D_RELEASE refusal');
}

it('refuses a version that is not greater than the current one', () => {
  for (const v of ['0.3.9', '0.4.0', '0.4.0-rc.1']) {
    const e = refusal(() => stampChangelog(LOG, '0.4.0', v, '2026-11-14'));
    expect(e.code).toBe('T3D_RELEASE');
    expect(e.message).toContain('not greater');
  }
});

it('refuses an empty [Unreleased], headings alone included', () => {
  const empty = LOG.replace('### Added\n- a thing\n', '### Added\n\n### Fixed\n');
  const e = refusal(() => stampChangelog(empty, '0.4.0', '0.4.1', '2026-11-14'));
  expect(e.code).toBe('T3D_RELEASE');
  expect(e.message).toContain('no entries');
});

it('refuses an [Unreleased] whose entries have no summary sentence before the first ###', () => {
  for (const log of [
    LOG.replace('Things users get.\n\n', ''),
    LOG.replace('Things users get.\n\n### Added\n', '### Added\n\nThings users get.\n\n'),
    LOG.replace('Things users get.', 'no full stop'),
  ]) {
    const e = refusal(() => stampChangelog(log, '0.4.0', '0.4.1', '2026-11-14'));
    expect(e.code).toBe('T3D_RELEASE');
    expect(e.message).toContain('no summary sentence');
    expect(e.fix).toContain('first paragraph under the heading');
  }
});

it('refuses a summary with no entries under it', () => {
  const e = refusal(() =>
    stampChangelog(LOG.replace('### Added\n- a thing\n', ''), '0.4.0', '0.4.1', '2026-11-14'),
  );
  expect(e.message).toContain('no entries');
});

it('refuses to stamp a version whose section already exists', () => {
  const twice = LOG.replace('## [0.4.0]', '## [0.4.1] - 2026-11-13\n\n- x\n\n## [0.4.0]');
  const e = refusal(() => stampChangelog(twice, '0.4.0', '0.4.1', '2026-11-14'));
  expect(e.code).toBe('T3D_RELEASE');
  expect(e.message).toContain('already has a [0.4.1]');
});

it('refuses a CHANGELOG without [Unreleased] and a non-semver version', () => {
  const none = LOG.replace('## [Unreleased]\n', '');
  expect(refusal(() => stampChangelog(none, '0.4.0', '0.4.1', 'd')).message).toContain(
    'no ## [Unreleased]',
  );
  expect(refusal(() => stampChangelog(LOG, '0.4.0', '1.0', 'd')).message).toContain('not semver');
});

it('stamps: fresh empty [Unreleased] on top, summary and entries under the new version', () => {
  const out = stampChangelog(LOG, '0.4.0', '0.5.0', '2026-11-14');
  expect(out).toContain(
    '## [Unreleased]\n\n## [0.5.0] - 2026-11-14\n\nThings users get.\n\n### Added\n- a thing',
  );
  expect(changelogSection(out, '0.5.0')).toBe('Things users get.\n\n### Added\n- a thing');
  expect(changelogSection(out, 'Unreleased')).toBe('');
});

it('orders versions by semver precedence', () => {
  expect(compareSemver('0.10.0', '0.9.9')).toBeGreaterThan(0);
  expect(compareSemver('1.0.0', '1.0.0-rc.1')).toBeGreaterThan(0);
  expect(compareSemver('1.0.0-rc.2', '1.0.0-rc.10')).toBeLessThan(0);
  expect(compareSemver('1.0.0-alpha', '1.0.0-alpha.1')).toBeLessThan(0);
  expect(compareSemver('1.0.0-1', '1.0.0-alpha')).toBeLessThan(0);
  expect(compareSemver('2.1.3', '2.1.3')).toBe(0);
});

const REPO = 'https://github.com/developerz-ai/ts23d';

/** A minimal stamped-at-0.4.0 tree in a temp dir, then `bun run scripts/release.ts 0.5.0` in it. */
async function stampIn(changelog: string): Promise<{ dir: string; code: number; err: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'ts23d-release-'));
  await mkdir(join(dir, 'src/export'), { recursive: true });
  await writeFile(join(dir, 'package.json'), '{\n  "version": "0.4.0"\n}\n');
  await writeFile(join(dir, 'src/export/version.ts'), "export const VERSION = '0.4.0';\n");
  await writeFile(join(dir, 'CHANGELOG.md'), changelog.replace('### Fixed', 'Old.\n\n### Fixed'));
  const p = Bun.spawnSync(['bun', join(import.meta.dir, 'release.ts'), '0.5.0'], {
    cwd: dir,
    env: { ...process.env, RELEASE_DATE: '2026-11-14' },
  });
  return { dir, code: p.exitCode, err: p.stderr.toString() };
}

it('refuses, writing nothing, when the [Unreleased] link does not compare from the last version', async () => {
  const stale = `${LOG}\n[Unreleased]: ${REPO}/compare/v0.3.0...HEAD\n[0.4.0]: ${REPO}/releases/tag/v0.4.0\n`;
  const r = await stampIn(stale);
  expect(r.code).toBe(1);
  expect(r.err).toContain('[Unreleased] link is');
  expect(await Bun.file(join(r.dir, 'CHANGELOG.md')).text()).toContain('compare/v0.3.0...HEAD');
  expect(await Bun.file(join(r.dir, 'package.json')).json()).toEqual({ version: '0.4.0' });
  expect((await readPages(r.dir)).size).toBe(0);
});

it('stamps the tree: version files, link index and docs/changelog/ with no drift left', async () => {
  const r = await stampIn(
    `${LOG}\n[Unreleased]: ${REPO}/compare/v0.4.0...HEAD\n[0.4.0]: ${REPO}/releases/tag/v0.4.0\n`,
  );
  expect(r.err).toBe('');
  expect(r.code).toBe(0);
  const log = await Bun.file(join(r.dir, 'CHANGELOG.md')).text();
  expect(log).toContain(
    `[Unreleased]: ${REPO}/compare/v0.5.0...HEAD\n[0.5.0]: ${REPO}/compare/v0.4.0...v0.5.0`,
  );
  expect(drift(log, await readPages(r.dir))).toEqual([]);
  expect(await Bun.file(join(r.dir, 'docs/changelog/0.5.0.md')).text()).toContain(
    'Things users get.',
  );
  expect(await Bun.file(join(r.dir, 'package.json')).json()).toEqual({ version: '0.5.0' });
  expect(await Bun.file(join(r.dir, 'src/export/version.ts')).text()).toContain("'0.5.0'");
});
