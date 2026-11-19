// Chain gate: every part selector of a recipe's built-in checks (`touches`, `clear`, `noOverlap`)
// matches some part at some LOD. Per LOD a check over a missing part is skipped on purpose (a part
// gated behind ctx.lod has nothing to touch there), so a typo ('lanturn') would pass every LOD;
// across the chain it cannot hide. Judged only when LOD0, where detail lives, is in the chain.

import { type CompiledAsset, worldMeshes } from '../core/index.ts';
import { selectorsOf } from './checks.ts';
import { glob } from './inspect.ts';
import type { LodGate } from './lods.ts';
import type { Finding } from './types.ts';

function editDistance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next.push(
        Math.min(
          (row[j] ?? 0) + 1,
          (next[j - 1] ?? 0) + 1,
          (row[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
        ),
      );
    row = next;
  }
  return row[b.length] ?? 0;
}

/** Up to three part names nearest the selector's literal text (wildcards dropped). */
function closestNames(selector: string, names: readonly string[]): string[] {
  const word = selector.replace(/[*?]/g, '');
  return [...names]
    .map((n) => ({
      n,
      d: editDistance(word, n.slice(0, Math.max(word.length, 1))) + editDistance(word, n) / 100,
    }))
    .sort((x, y) => x.d - y.d || (x.n < y.n ? -1 : 1))
    .slice(0, 3)
    .map(({ n }) => n);
}

const partNames = (a: CompiledAsset): string[] => [...worldMeshes(a.parts).keys()];

export const checkSelectors: LodGate = (lods) => {
  if (!lods.some((a) => a.lod === 0)) return [];
  const names = [...new Set(lods.flatMap(partNames))];
  const wanted = [...new Set((lods[0]?.checks ?? []).flatMap((c) => [...selectorsOf(c)]))];
  return wanted
    .filter((s) => !names.some((n) => glob(s).test(n)))
    .map(
      (s): Finding => ({
        gate: 'check',
        code: 'T3D_QA_CHECK',
        message: `check selector '${s}' matches no part at any LOD: the check tests nothing`,
        fix: `fix the name in the recipe's \`checks\` (a selector is a part name or a glob like 'wheel_*')${
          names.length
            ? `; closest parts: ${closestNames(s, names)
                .map((n) => `'${n}'`)
                .join(', ')}`
            : ''
        }`,
      }),
    );
};
