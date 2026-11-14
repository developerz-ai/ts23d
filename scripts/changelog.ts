// CHANGELOG.md bookkeeping shared by the release script and the conventions gate: read the version
// sections, keep the link-reference index at the bottom current, render docs/changelog/.
//   bun run changelog           rewrite the link index and docs/changelog/ from CHANGELOG.md
//   bun run changelog --check   exit 1 listing drift (the conventions gate runs the same check)
// Summary convention: the first paragraph under `## [x.y.z] - date` (and under `## [Unreleased]`),
// before any `###`, is one sentence telling users what the release gives them.

import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Ts23dError } from '../src/core/index.ts';

export const REPO = 'https://github.com/developerz-ai/ts23d';
export const NPM = 'https://www.npmjs.com/package/@developerz.ai/ts23d/v';
export const PAGES_DIR = 'docs/changelog';
export const SUMMARY_RULE =
  'one sentence of what users get, as the first paragraph under the heading, before any ###';

export interface Release {
  readonly version: string;
  readonly date: string;
  /** The summary paragraph, or null when the section opens with a list or a heading. */
  readonly summary: string | null;
  /** The section without its summary. */
  readonly body: string;
}

export interface Drift {
  readonly file: string;
  readonly message: string;
}

const reEscape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const HEADING = /^## \[(\d+\.\d+\.\d+[^\]]*)\] - (\d{4}-\d{2}-\d{2})\s*$/gm;
const INDEX_LINE = /^\[(?:Unreleased|\d+\.\d+\.\d+[^\]]*)\]: \S+[ \t]*$/;

/** The body of `## [<v>]` (trimmed), or null when CHANGELOG has no such section. */
export function changelogSection(changelog: string, v: string): string | null {
  const m = new RegExp(
    `^## \\[${reEscape(v)}\\][^\\n]*\\n([\\s\\S]*?)(?=^## \\[|^\\[[^\\]\\n]+\\]: |$(?![\\s\\S]))`,
    'm',
  ).exec(changelog);
  return m?.[1]?.trim() ?? null;
}

/** A section's summary: its first paragraph when that is prose ending in a full stop. */
export function summaryOf(section: string): string | null {
  const first =
    section
      .trim()
      .split(/\n[ \t]*\n/)[0]
      ?.trim() ?? '';
  if (first === '' || /^(#|[-*] |\d+\. |\[[^\]\n]+\]: )/.test(first) || !first.endsWith('.'))
    return null;
  return first.replace(/\s*\n\s*/g, ' ');
}

/** Every released version, newest first (file order). */
export function releases(changelog: string): Release[] {
  return [...changelog.matchAll(HEADING)].map((m) => {
    const version = m[1] ?? '';
    const section = changelogSection(changelog, version) ?? '';
    const summary = summaryOf(section);
    const body = summary === null ? section : section.replace(/^[\s\S]*?(\n[ \t]*\n|$)/, '');
    return { version, date: m[2] ?? '', summary, body: body.trim() };
  });
}

const tagUrl = (v: string, prev: string | null): string =>
  prev === null ? `${REPO}/releases/tag/v${v}` : `${REPO}/compare/v${prev}...v${v}`;
const unreleasedUrl = (latest: string | null): string =>
  latest === null ? `${REPO}/commits/main` : `${REPO}/compare/v${latest}...HEAD`;

/** The link-reference lines CHANGELOG.md should end with. */
function indexLines(changelog: string): string[] {
  const vs = releases(changelog).map((r) => r.version);
  return [
    `[Unreleased]: ${unreleasedUrl(vs[0] ?? null)}`,
    ...vs.map((v, i) => `[${v}]: ${tagUrl(v, vs[i + 1] ?? null)}`),
  ];
}

/** CHANGELOG with its `[Unreleased]` / version link index rebuilt from the headings. */
export function linkIndex(changelog: string): string {
  const kept = changelog
    .split('\n')
    .filter((l) => !INDEX_LINE.test(l))
    .join('\n')
    .trimEnd();
  return `${kept}\n\n${indexLines(changelog).join('\n')}\n`;
}

/** Release-time edit: `[Unreleased]` compares from the new version, which gets its own link. */
export function stampLinks(changelog: string, version: string, prev: string | null): string {
  const current = /^\[Unreleased\]: (\S+)/m.exec(changelog)?.[1];
  const want = unreleasedUrl(prev);
  if (current !== want)
    throw new Ts23dError('T3D_RELEASE', {
      cause: `CHANGELOG.md [Unreleased] link is ${current ?? 'missing'}, expected ${want}`,
      fix: 'bun run changelog (rebuilds the link index), then stamp again',
    });
  if (new RegExp(`^\\[${reEscape(version)}\\]: `, 'm').test(changelog))
    throw new Ts23dError('T3D_RELEASE', {
      cause: `CHANGELOG.md already links [${version}]`,
      fix: 'that version is stamped already; stamp the next one',
    });
  return changelog.replace(
    /^\[Unreleased\]: \S+/m,
    `[Unreleased]: ${unreleasedUrl(version)}\n[${version}]: ${tagUrl(version, prev)}`,
  );
}

const GENERATED =
  '<!-- Generated from CHANGELOG.md by `bun run changelog`. Edit CHANGELOG.md, never this file. -->';
/** Repo-root-relative markdown links, re-rooted for a page two folders down. */
const reroot = (md: string): string =>
  md.replace(/\]\((?![a-z][a-z0-9+.-]*:|#|\/)([^)\s]+)\)/gi, '](../../$1)');

function page(r: Release, newer: Release | undefined, older: Release | undefined): string {
  const diff = older ? `diff v${older.version}...v${r.version}` : `tag v${r.version}`;
  const nav = [
    older ? `Older: [${older.version}](${older.version}.md)` : '',
    newer ? `Newer: [${newer.version}](${newer.version}.md)` : '',
  ].filter((s) => s !== '');
  return [
    GENERATED,
    `# ts23d ${r.version}`,
    `Released ${r.date} · [npm](${NPM}/${r.version}) · [${diff}](${tagUrl(r.version, older?.version ?? null)}) · [all releases](README.md) · [CHANGELOG](../../CHANGELOG.md)`,
    ...(r.summary === null ? [] : [reroot(r.summary)]),
    ...(r.body === '' ? [] : [reroot(r.body)]),
    ...(nav.length === 0 ? [] : ['---', nav.join(' · ')]),
  ].join('\n\n');
}

/** docs/changelog/<x.y.z>.md per release plus the README index, keyed by repo path. */
export function pages(changelog: string): Map<string, string> {
  const rs = releases(changelog);
  const out = new Map<string, string>();
  rs.forEach((r, i) => {
    out.set(`${PAGES_DIR}/${r.version}.md`, `${page(r, rs[i - 1], rs[i + 1])}\n`);
  });
  const rows = rs.map(
    (r) =>
      `| [${r.version}](${r.version}.md) | ${r.date} | ${reroot(r.summary ?? '').replaceAll('|', '\\|')} |`,
  );
  const index = [
    GENERATED,
    '# Releases',
    'Every published version of `@developerz.ai/ts23d`, newest first: one page each with the summary, the changes, the diff and the npm link. Unreleased work is at the top of [CHANGELOG.md](../../CHANGELOG.md); `bun run release <x.y.z>` regenerates these pages.',
    ['| Version | Date | Summary |', '|---|---|---|', ...rows].join('\n'),
  ].join('\n\n');
  out.set(`${PAGES_DIR}/README.md`, `${index}\n`);
  return out;
}

/** What `--check` fails on: missing summaries, stale links, stale / missing / stray pages. */
export function drift(changelog: string, existing: ReadonlyMap<string, string>): Drift[] {
  const out: Drift[] = [];
  const log = (message: string): void => {
    out.push({ file: 'CHANGELOG.md', message });
  };
  const rs = releases(changelog);
  for (const r of rs) if (r.summary === null) log(`[${r.version}] has no summary sentence`);
  const links = new Map(
    [...changelog.matchAll(/^\[([^\]\n]+)\]: (\S+)/gm)].map((m) => [m[1] ?? '', m[2] ?? '']),
  );
  const want = unreleasedUrl(rs[0]?.version ?? null);
  if (links.get('Unreleased') !== want)
    log(`[Unreleased] link is ${links.get('Unreleased') ?? 'missing'}, expected ${want}`);
  rs.forEach((r, i) => {
    const url = tagUrl(r.version, rs[i + 1]?.version ?? null);
    if (links.get(r.version) !== url)
      log(`[${r.version}] link is ${links.get(r.version) ?? 'missing'}, expected ${url}`);
  });
  if (out.length === 0 && linkIndex(changelog) !== changelog)
    log('the link index is not the last block, in heading order');
  const expected = pages(changelog);
  for (const [file, text] of expected) {
    const have = existing.get(file);
    if (have === undefined) out.push({ file, message: 'missing' });
    else if (have !== text) out.push({ file, message: 'stale: differs from CHANGELOG.md' });
  }
  for (const file of existing.keys())
    if (!expected.has(file)) out.push({ file, message: 'stray: no CHANGELOG.md section makes it' });
  return out;
}

/** The files under docs/changelog/ now, keyed by repo path. */
export async function readPages(cwd = process.cwd()): Promise<Map<string, string>> {
  const names = await readdir(join(cwd, PAGES_DIR)).catch((e: unknown) => {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  });
  const out = new Map<string, string>();
  for (const n of names.sort())
    out.set(`${PAGES_DIR}/${n}`, await Bun.file(join(cwd, PAGES_DIR, n)).text());
  return out;
}

/** Write docs/changelog/ from CHANGELOG text and delete pages no section makes. */
export async function writePages(changelog: string, cwd = process.cwd()): Promise<void> {
  const want = pages(changelog);
  for (const file of (await readPages(cwd)).keys()) if (!want.has(file)) await rm(join(cwd, file));
  for (const [file, text] of want) await Bun.write(join(cwd, file), text);
}

if (import.meta.main) {
  const changelog = await Bun.file('CHANGELOG.md').text();
  if (process.argv.includes('--check')) {
    const found = drift(changelog, await readPages());
    for (const d of found) console.error(`  ${d.file}  ${d.message}`);
    if (found.length > 0) {
      console.error(`✗ changelog: ${found.length} drift(s)\n  fix: bun run changelog`);
      console.error(`  a missing summary: write ${SUMMARY_RULE}`);
      process.exit(1);
    }
    console.log('✔ changelog index and docs/changelog are current');
  } else {
    const indexed = linkIndex(changelog);
    if (indexed !== changelog) await Bun.write('CHANGELOG.md', indexed);
    await writePages(indexed);
    console.log(`✔ wrote the CHANGELOG link index and ${pages(indexed).size} docs/changelog pages`);
  }
}
