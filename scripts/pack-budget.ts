// What the npm tarball may weigh and carry: a packed and unpacked size budget, a per-file limit and
// no `recipes/*/neural/` model outputs (they stay in git; without them `ranger` and `human_head`
// build their CPU tier, and the model-first hybrids stop with T3D_NEURAL_MISSING). `tarEntries` reads paths and sizes straight from the .tgz bytes (ustar, GNU
// long names, pax paths), so the check needs no `tar` flavour. Used by scripts/pack-smoke.ts.

import { gunzipSync } from 'node:zlib';

export interface TarEntry {
  /** Path inside the package, without the leading `package/`. */
  readonly path: string;
  readonly size: number;
}

export interface PackBudget {
  readonly packedBytes: number;
  readonly unpackedBytes: number;
  readonly fileBytes: number;
}

/**
 * Measured 2026-11-19 with `recipes/*\/neural` excluded: 4.22 MB packed, 12.7 MB unpacked, largest
 * file 0.50 MB (a dist chunk). Limits sit ~25 % above; raise them only with a reason in the diff.
 */
export const PACK_BUDGET: PackBudget = {
  packedBytes: 5_300_000,
  unpackedBytes: 16_000_000,
  fileBytes: 1_000_000,
};

const NEURAL = /^recipes\/[^/]+\/neural\//;
const decoder = new TextDecoder();

function field(b: Uint8Array, at: number, len: number): string {
  const s = b.subarray(at, at + len);
  const end = s.indexOf(0);
  return decoder.decode(end === -1 ? s : s.subarray(0, end));
}

function paxPath(data: Uint8Array): string | undefined {
  // Records are "<len> key=value\n".
  for (const rec of decoder.decode(data).split('\n')) {
    const m = /^\d+ path=(.*)$/.exec(rec);
    if (m) return m[1];
  }
  return undefined;
}

/** Every regular file in a .tgz with its size, `package/` stripped. */
export function tarEntries(tgz: Uint8Array): TarEntry[] {
  const tar = gunzipSync(tgz);
  const out: TarEntry[] = [];
  let next: string | undefined;
  for (let at = 0; at + 512 <= tar.length; ) {
    const h = tar.subarray(at, at + 512);
    if (h.every((x) => x === 0)) break;
    const size = Number.parseInt(field(h, 124, 12).trim() || '0', 8);
    const type = String.fromCharCode(h[156] ?? 0);
    const data = tar.subarray(at + 512, at + 512 + size);
    at += 512 + Math.ceil(size / 512) * 512;
    if (type === 'L') next = field(data, 0, data.length);
    else if (type === 'x') next = paxPath(data) ?? next;
    else {
      const prefix = field(h, 257, 6) === 'ustar' ? field(h, 345, 155) : '';
      const path = next ?? (prefix ? `${prefix}/${field(h, 0, 100)}` : field(h, 0, 100));
      next = undefined;
      if (type === '0' || type === '\0') out.push({ path: path.replace(/^package\//, ''), size });
    }
  }
  return out;
}

const mb = (n: number): string => `${(n / 1_000_000).toFixed(2)} MB`;

function largest(entries: readonly TarEntry[]): string {
  return [...entries]
    .sort((a, b) => b.size - a.size)
    .slice(0, 5)
    .map((e) => `${e.path} (${mb(e.size)})`)
    .join(', ');
}

/** What breaks the budget (empty = fine); each message names the offenders and the fix. */
export function budgetProblems(
  entries: readonly TarEntry[],
  packedBytes: number,
  budget: PackBudget = PACK_BUDGET,
): string[] {
  const problems: string[] = [];
  const fix =
    'exclude what a consumer does not need in package.json "files", or raise PACK_BUDGET in scripts/pack-budget.ts with a reason';
  if (packedBytes > budget.packedBytes)
    problems.push(
      `tarball is ${mb(packedBytes)} packed, budget ${mb(budget.packedBytes)}; largest: ${largest(entries)}; ${fix}`,
    );
  const unpacked = entries.reduce((s, e) => s + e.size, 0);
  if (unpacked > budget.unpackedBytes)
    problems.push(
      `tarball is ${mb(unpacked)} unpacked, budget ${mb(budget.unpackedBytes)}; largest: ${largest(entries)}; ${fix}`,
    );
  for (const e of entries) {
    if (NEURAL.test(e.path))
      problems.push(
        `ships a model output: ${e.path}; recipes/*/neural/ stays in git (keep "!recipes/*/neural" in package.json "files")`,
      );
    else if (e.size > budget.fileBytes)
      problems.push(
        `ships a ${mb(e.size)} file (limit ${mb(budget.fileBytes)}): ${e.path}; exclude it in package.json "files"`,
      );
  }
  return problems;
}
