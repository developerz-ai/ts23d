import { compile } from '@developerz.ai/ts23d';
import { teamCoverage } from '@developerz.ai/ts23d/render';
import * as B from './rts_barracks.ts';

for (const [k, a] of Object.entries(B)) {
  if (typeof a !== 'object' || !a || !('build' in a) || !k.includes('rubble')) continue;
  const r = [0, 1, 2].map((lod) =>
    teamCoverage(
      compile(a as never, { lod: lod as 0, variant: 'red' }),
      compile(a as never, { lod: lod as 0, variant: 'blue' }),
    ).share.toFixed(3),
  );
  console.log(k, r.join(' '));
}
