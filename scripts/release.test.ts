// Release stamp guards: a stamp that would publish nothing, go backwards or stamp twice is refused.

import { expect, it } from 'bun:test';
import { Ts23dError } from '../src/core/index.ts';
import { changelogSection, compareSemver, stampChangelog } from './release.ts';

const LOG = `# Changelog

## [Unreleased]

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

it('stamps: fresh empty [Unreleased] on top, the entries under the new version', () => {
  const out = stampChangelog(LOG, '0.4.0', '0.5.0', '2026-11-14');
  expect(out).toContain('## [Unreleased]\n\n## [0.5.0] - 2026-11-14\n\n### Added\n- a thing');
  expect(changelogSection(out, '0.5.0')).toBe('### Added\n- a thing');
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
