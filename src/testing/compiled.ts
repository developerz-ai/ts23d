// Shared plumbing for the assertions: compile an asset at the LODs asked for, and turn QA
// findings into one thrown Ts23dError an agent can act on (code, every finding, the first fix).

import { type Asset, type CompiledAsset, compile, type Lod, Ts23dError } from '../core/index.ts';
import type { Finding } from '../qa/index.ts';

export interface LodOptions {
  /** LODs to check. Default all three. */
  readonly lods?: readonly Lod[];
  readonly seed?: number;
}

export const ALL_LODS: readonly Lod[] = [0, 1, 2];

export const compileLods = (asset: Asset, o: LodOptions = {}): CompiledAsset[] =>
  (o.lods ?? ALL_LODS).map((lod) =>
    compile(asset, { lod, ...(o.seed !== undefined ? { seed: o.seed } : {}) }),
  );

export const describeFinding = (f: Finding, lod?: Lod): string =>
  `${lod !== undefined ? `LOD${lod} ` : ''}${f.code} ${f.gate}${f.part ? ` [${f.part}]` : ''}: ${f.message}`;

/** Throw T3D_QA_FAILED listing every finding; no-op when there are none. */
export function failOn(what: string, found: ReadonlyArray<{ finding: Finding; lod?: Lod }>): void {
  if (found.length === 0) return;
  const lines = found.map(({ finding, lod }) => `  - ${describeFinding(finding, lod)}`);
  throw new Ts23dError('T3D_QA_FAILED', {
    cause: `${what}: ${found.length} finding(s)\n${lines.join('\n')}`,
    fix: found[0]?.finding.fix ?? 'read the findings above',
  });
}
