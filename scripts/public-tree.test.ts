// Guard: no tracked file names an internal host on our own domain or the internal setup mode (#21).
import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

/**
 * This repository is public, so every tracked file is a public document. Forbidden values are
 * assembled from parts so this file never carries one, and a failure names the file, never the
 * value it matched: CI logs are public. `.dz/` is written wholesale by the maintainer platform and
 * is out of scope.
 */
const SELF = 'scripts/public-tree.test.ts';
const DOMAIN = ['developerz', 'ai'].join('.');
const PERMITTED_OWN_HOSTS = new Set([DOMAIN, `www.${DOMAIN}`]);
const OWN_HOST = new RegExp(`\\b(?:[a-z0-9-]+\\.)*${DOMAIN.replace('.', '\\.')}\\b`, 'gi');
const SETUP_MODE = ['dz', 'runner'].join('-');
const PLATFORM_OWNED = /^\.dz\//;

/** Hosts on our own domain in one text that are not the public ones. */
export function forbiddenOwnHosts(text: string): string[] {
  return [...text.matchAll(OWN_HOST)]
    .map((m) => m[0])
    .filter((host) => !PERMITTED_OWN_HOSTS.has(host.toLowerCase()));
}

/** Whether one text names the internal setup mode, in any case. */
export function namesSetupMode(text: string): boolean {
  return text.toLowerCase().includes(SETUP_MODE);
}

/** Tracked files from git's own index; a git that cannot answer is a broken oracle, not an empty tree. */
function tracked(): string[] {
  const proc = Bun.spawnSync(['git', 'ls-files', '-z'], { stdout: 'pipe', stderr: 'pipe' });
  if (proc.exitCode !== 0) throw new Error(`git ls-files exited ${proc.exitCode}: ${proc.stderr}`);
  return proc.stdout
    .toString()
    .split('\0')
    .filter((p) => p.length > 0 && !PLATFORM_OWNED.test(p));
}

/** Files whose text fails `bad`, plus how many were read: a scan of nothing must not pass. */
function scan(bad: (text: string) => boolean): { read: number; offenders: string[] } {
  const files = tracked();
  expect(files).toContain(SELF);
  let read = 0;
  const offenders: string[] = [];
  for (const path of files) {
    let bytes: Buffer;
    try {
      bytes = readFileSync(path);
    } catch {
      continue; // deleted in the working tree but still in the index
    }
    read += 1;
    if (!bytes.includes(0) && bad(bytes.toString('utf8'))) offenders.push(path);
  }
  return { read, offenders };
}

describe('the guard itself', () => {
  it('catches an internal host in any case and lets the public hosts through', () => {
    expect(forbiddenOwnHosts(`"url": "https://${['mcp', DOMAIN].join('.')}/v1/mcp"`)).toHaveLength(
      1,
    );
    expect(forbiddenOwnHosts(`https://DB.${DOMAIN}/x`)).toHaveLength(1);
    expect(forbiddenOwnHosts(`see https://${DOMAIN}/docs and https://www.${DOMAIN}`)).toEqual([]);
    expect(forbiddenOwnHosts(`"@${DOMAIN}/ts23d"`)).toEqual([]);
  });

  it('catches the setup mode in any case', () => {
    expect(namesSetupMode(`established by ${SETUP_MODE.toUpperCase()} setup mode`)).toBe(true);
    expect(namesSetupMode("owned by this repository's maintainers")).toBe(false);
  });
});

describe('the public tree', () => {
  it('names no internal host on our own domain', () => {
    const { read, offenders } = scan((t) => forbiddenOwnHosts(t).length > 0);
    expect(read).toBeGreaterThan(100);
    expect(offenders, `fix: remove the internal host from ${offenders.join(', ')}`).toEqual([]);
  });

  it('names no internal setup mode', () => {
    const { read, offenders } = scan(namesSetupMode);
    expect(read).toBeGreaterThan(100);
    expect(offenders, `fix: drop the setup-mode name from ${offenders.join(', ')}`).toEqual([]);
  });
});
