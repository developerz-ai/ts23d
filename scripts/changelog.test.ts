// CHANGELOG bookkeeping: summaries, the link index, stamping links and docs/changelog/ drift.

import { expect, it } from 'bun:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ts23dError } from '../src/core/index.ts';
import {
  changelogSection,
  drift,
  linkIndex,
  pages,
  readPages,
  releases,
  stampLinks,
  summaryOf,
  writePages,
} from './changelog.ts';

const REPO = 'https://github.com/developerz-ai/ts23d';
const LOG = `# Changelog

## [Unreleased]

## [0.2.0] - 2026-11-08

Lettering in [vector fonts](docs/idea/fonts.md).

### Added
- fonts

## [0.1.0] - 2026-11-07

First release.

### Added
- boxes

[Unreleased]: ${REPO}/compare/v0.2.0...HEAD
[0.2.0]: ${REPO}/compare/v0.1.0...v0.2.0
[0.1.0]: ${REPO}/releases/tag/v0.1.0
`;

const messages = (log: string, existing = pages(log)): string[] =>
  drift(log, existing).map((d) => `${d.file} ${d.message}`);

it('flags a section without a summary sentence', () => {
  const bare = LOG.replace('First release.\n\n', '');
  expect(messages(bare, pages(bare))).toEqual(['CHANGELOG.md [0.1.0] has no summary sentence']);
  expect(summaryOf('### Added\n- x')).toBeNull();
  expect(summaryOf('- x\n- y')).toBeNull();
  expect(summaryOf('no full stop\n\n- x')).toBeNull();
  expect(summaryOf('Two lines\nof one sentence.\n\n### Added')).toBe('Two lines of one sentence.');
});

it('flags a stale [Unreleased] link, a missing version link and an index out of place', () => {
  const stale = LOG.replace('v0.2.0...HEAD', 'v0.1.0...HEAD').replace(/^\[0\.1\.0\].*\n/m, '');
  expect(messages(stale)).toEqual([
    `CHANGELOG.md [Unreleased] link is ${REPO}/compare/v0.1.0...HEAD, expected ${REPO}/compare/v0.2.0...HEAD`,
    `CHANGELOG.md [0.1.0] link is missing, expected ${REPO}/releases/tag/v0.1.0`,
  ]);
  const moved = LOG.replace(/\n\[Unreleased\].*\n/, '\n').replace(
    '## [Unreleased]\n',
    `## [Unreleased]\n\n[Unreleased]: ${REPO}/compare/v0.2.0...HEAD\n`,
  );
  expect(messages(moved)).toEqual([
    'CHANGELOG.md the link index is not the last block, in heading order',
  ]);
  expect(linkIndex(stale)).toBe(LOG);
  expect(linkIndex(LOG)).toBe(LOG);
});

it('flags missing, stale and stray pages', () => {
  const have = pages(LOG);
  have.delete('docs/changelog/0.1.0.md');
  have.set('docs/changelog/0.2.0.md', 'hand edit');
  have.set('docs/changelog/0.0.9.md', 'old');
  expect(messages(LOG, have)).toEqual([
    'docs/changelog/0.2.0.md stale: differs from CHANGELOG.md',
    'docs/changelog/0.1.0.md missing',
    'docs/changelog/0.0.9.md stray: no CHANGELOG.md section makes it',
  ]);
  expect(messages(LOG)).toEqual([]);
});

it('reads versions newest first with summary split from the body; sections stop at the index', () => {
  expect(releases(LOG)).toEqual([
    {
      version: '0.2.0',
      date: '2026-11-08',
      summary: 'Lettering in [vector fonts](docs/idea/fonts.md).',
      body: '### Added\n- fonts',
    },
    { version: '0.1.0', date: '2026-11-07', summary: 'First release.', body: '### Added\n- boxes' },
  ]);
  expect(changelogSection(LOG, '0.1.0')).toBe('First release.\n\n### Added\n- boxes');
});

it('renders a page per version and an index, links re-rooted, prev/next and npm', () => {
  const p = pages(LOG);
  expect([...p.keys()]).toEqual([
    'docs/changelog/0.2.0.md',
    'docs/changelog/0.1.0.md',
    'docs/changelog/README.md',
  ]);
  const two = p.get('docs/changelog/0.2.0.md') ?? '';
  expect(two).toContain('# ts23d 0.2.0');
  expect(two).toContain('https://www.npmjs.com/package/@developerz.ai/ts23d/v/0.2.0');
  expect(two).toContain(`[diff v0.1.0...v0.2.0](${REPO}/compare/v0.1.0...v0.2.0)`);
  expect(two).toContain('[vector fonts](../../docs/idea/fonts.md)');
  expect(two).toContain('Older: [0.1.0](0.1.0.md)');
  expect(two).not.toContain('Newer');
  expect(p.get('docs/changelog/0.1.0.md')).toContain(`[tag v0.1.0](${REPO}/releases/tag/v0.1.0)`);
  expect(p.get('docs/changelog/README.md')).toContain(
    '| [0.1.0](0.1.0.md) | 2026-11-07 | First release. |',
  );
});

it('stampLinks refuses a stale [Unreleased] link or a version already linked', () => {
  const refusal = (f: () => unknown): string => {
    try {
      f();
    } catch (e) {
      if (e instanceof Ts23dError && e.code === 'T3D_RELEASE') return e.message;
      throw e;
    }
    throw new Error('expected a T3D_RELEASE refusal');
  };
  expect(refusal(() => stampLinks(LOG, '0.3.0', '0.1.0'))).toContain('[Unreleased] link is');
  const linked = LOG.replace('[0.2.0]:', `[0.3.0]: x\n[0.2.0]:`);
  expect(refusal(() => stampLinks(linked, '0.3.0', '0.2.0'))).toContain('already links [0.3.0]');
});

it('stampLinks advances [Unreleased] and adds the version link; the result has no drift', () => {
  const stamped = stampLinks(
    LOG.replace('## [Unreleased]\n', '## [Unreleased]\n\n## [0.3.0] - 2026-11-09\n\nMore.\n'),
    '0.3.0',
    '0.2.0',
  );
  expect(stamped).toContain(
    `[Unreleased]: ${REPO}/compare/v0.3.0...HEAD\n[0.3.0]: ${REPO}/compare/v0.2.0...v0.3.0\n[0.2.0]`,
  );
  expect(messages(stamped)).toEqual([]);
  expect(stampLinks(`[Unreleased]: ${REPO}/commits/main\n`, '0.1.0', null)).toContain(
    `[0.1.0]: ${REPO}/releases/tag/v0.1.0`,
  );
});

it('writePages writes every page and removes stray ones', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ts23d-changelog-'));
  expect((await readPages(dir)).size).toBe(0);
  await writePages(LOG, dir);
  await writeFile(join(dir, 'docs/changelog/0.0.1.md'), 'stray');
  await writePages(LOG, dir);
  expect(await readPages(dir)).toEqual(pages(LOG));
});
