// assertPartMotionClear: one moving part (and everything parented to it) sweeps its baked motion —
// spin, sway sector or slide stroke — without cutting into anything else. The QA `clashes` sweep,
// run with only that part moving, so the failure names exactly the part you are testing.
//   it('turret traverses clear of the hull', () => assertPartMotionClear(tank, 'turret'));

import type { Asset } from '../core/index.ts';
import { clashes, glob } from '../qa/index.ts';
import { compileLods, failOn, type LodOptions } from './compiled.ts';

/** Parts matching `part` (name or glob) have motion and sweep clear, at every LOD checked. */
export function assertPartMotionClear(asset: Asset, part: string, o: LodOptions = {}): void {
  const re = glob(part);
  failOn(
    `${asset.name} motion '${part}'`,
    compileLods(asset, o).flatMap((c) => {
      const movers = c.parts.filter((p) => re.test(p.name) && p.motion);
      if (movers.length === 0)
        return [
          {
            lod: c.lod,
            finding: {
              gate: 'motion',
              code: 'T3D_QA_MOTION',
              part,
              message: c.parts.some((p) => re.test(p.name))
                ? `'${part}' has no motion to sweep`
                : `no part matches '${part}'`,
              fix: "give the part its motion (ctx.part(name, mesh, { motion: { kind: 'spin', … } })) or name the moving pivot",
            },
          },
        ];
      const only = {
        ...c,
        parts: c.parts.map((p) => (re.test(p.name) ? p : { ...p, motion: null })),
      };
      return clashes(only).map((finding) => ({ finding, lod: c.lod }));
    }),
  );
}
