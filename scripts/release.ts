// Stamp a release: `bun run release <x.y.z>` sets package.json's version, turns CHANGELOG's
// `## [Unreleased]` into `## [x.y.z] - <date>`, advances the link index at the bottom and
// regenerates docs/changelog/ (scripts/changelog.ts). Then open a PR titled `chore: release x.y.z`;
// merging it is the release (.github/workflows/release-tag.yml → release.yml → npm via OIDC).
//   bun run release --check <x.y.z>   exit 1 unless the tree is stamped at that version
//   bun run release --notes <x.y.z>   print that version's CHANGELOG section (release notes)
// A stamp is refused (T3D_RELEASE) when the version is not above package.json's, when
// `[Unreleased]` has no entries or no summary sentence, when CHANGELOG already has that version's
// section, or when the `[Unreleased]` link does not compare from the latest version.

import { Ts23dError } from '../src/core/index.ts';
import {
  changelogSection,
  releases,
  SUMMARY_RULE,
  stampLinks,
  summaryOf,
  writePages,
} from './changelog.ts';

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
const VERSION_FILE = 'src/export/version.ts';

function parse(v: string): { core: number[]; pre: string[] } {
  const m = SEMVER.exec(v);
  if (!m)
    throw new Ts23dError('T3D_RELEASE', {
      cause: `'${v}' is not semver`,
      fix: 'bun run release 0.1.0',
    });
  return { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4]?.split('.') ?? [] };
}

/** Semver precedence: < 0 when a sorts before b, 0 when equal, > 0 after. */
export function compareSemver(a: string, b: string): number {
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (x.core[i] ?? 0) - (y.core[i] ?? 0);
    if (d !== 0) return d;
  }
  if (x.pre.length === 0 || y.pre.length === 0) return y.pre.length - x.pre.length;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === undefined || q === undefined) return p === undefined ? -1 : 1;
    if (p === q) continue;
    const pn = /^\d+$/.test(p);
    const qn = /^\d+$/.test(q);
    if (pn && qn) return Number(p) - Number(q);
    if (pn !== qn) return pn ? -1 : 1;
    return p < q ? -1 : 1;
  }
  return 0;
}

/** CHANGELOG with `[Unreleased]` turned into `[version] - date`, after every stamp guard. */
export function stampChangelog(
  changelog: string,
  current: string,
  version: string,
  date: string,
): string {
  if (compareSemver(version, current) <= 0)
    throw new Ts23dError('T3D_RELEASE', {
      cause: `${version} is not greater than the current version ${current}`,
      fix: `pick a version above ${current} (e.g. bump the patch)`,
    });
  if (changelogSection(changelog, version) !== null)
    throw new Ts23dError('T3D_RELEASE', {
      cause: `CHANGELOG.md already has a [${version}] section`,
      fix: 'that version is stamped already; stamp the next one',
    });
  const unreleased = changelogSection(changelog, 'Unreleased');
  if (unreleased === null)
    throw new Ts23dError('T3D_RELEASE', {
      cause: 'CHANGELOG.md has no ## [Unreleased] section',
      fix: 'add one at the top',
    });
  if (!/^[-*] \S/m.test(unreleased))
    throw new Ts23dError('T3D_RELEASE', {
      cause: 'CHANGELOG.md ## [Unreleased] has no entries: nothing to release',
      fix: 'add the changes under ## [Unreleased] (### Added / ### Changed / ### Fixed) first',
    });
  if (summaryOf(unreleased) === null)
    throw new Ts23dError('T3D_RELEASE', {
      cause: 'CHANGELOG.md ## [Unreleased] has no summary sentence',
      fix: `under ## [Unreleased] write ${SUMMARY_RULE}`,
    });
  return changelog.replace(/^## \[Unreleased\]/m, `## [Unreleased]\n\n## [${version}] - ${date}`);
}

async function main(args: readonly string[]): Promise<void> {
  const mode = args[0]?.startsWith('--') ? args[0] : '--stamp';
  const version = (mode === '--stamp' ? args[0] : args[1])?.replace(/^v/, '') ?? '';
  parse(version);
  const pkgFile = Bun.file('package.json');
  const pkg = (await pkgFile.json()) as { version: string };
  const changelog = await Bun.file('CHANGELOG.md').text();
  const notStamped = (cause: string): Ts23dError =>
    new Ts23dError('T3D_RELEASE', { cause, fix: `bun run release ${version}` });

  if (mode === '--check') {
    if (pkg.version !== version) throw notStamped(`package.json is ${pkg.version}, not ${version}`);
    if (!changelogSection(changelog, version))
      throw notStamped(`CHANGELOG.md has no [${version}] section`);
    if (!(await Bun.file(VERSION_FILE).text()).includes(`VERSION = '${version}'`))
      throw notStamped(`${VERSION_FILE} is not ${version}`);
    console.log(`✔ stamped at ${version}`);
  } else if (mode === '--notes') {
    const notes = changelogSection(changelog, version);
    if (!notes)
      throw new Ts23dError('T3D_RELEASE', {
        cause: `CHANGELOG.md has no [${version}] section`,
        fix: 'stamp the release first',
      });
    console.log(notes);
  } else {
    const date = process.env['RELEASE_DATE'] ?? new Date().toISOString().slice(0, 10);
    const prev = releases(changelog)[0]?.version ?? null;
    const stamped = stampLinks(
      stampChangelog(changelog, pkg.version, version, date),
      version,
      prev,
    );
    await Bun.write('CHANGELOG.md', stamped);
    await writePages(stamped);
    await Bun.write(pkgFile, `${JSON.stringify({ ...pkg, version }, null, 2)}\n`);
    // The generator string every GLB carries (version.test.ts pins the pair).
    const src = await Bun.file(VERSION_FILE).text();
    await Bun.write(VERSION_FILE, src.replace(/VERSION = '[^']*'/, `VERSION = '${version}'`));
    console.log(
      `✔ stamped ${version}. Next: git switch -c release/${version} && git add -A CHANGELOG.md docs/changelog && git commit -am 'chore: release ${version}' && gh pr create --fill`,
    );
  }
}

if (import.meta.main) {
  try {
    await main(process.argv.slice(2));
  } catch (e) {
    if (!(e instanceof Ts23dError)) throw e;
    console.error(`${e.message}\n  fix: ${e.fix}`);
    process.exit(1);
  }
}
