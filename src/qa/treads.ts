// Gate: a track belt that runs. A tracked vehicle's `track_l` / `track_r` with geometry must carry
// a `tread` motion: without one the belt merges into the static body and only the wheels turn
// (defect D25), and no engine can find the belt to run its links round the loop.

import type { Finding, Gate } from './types.ts';

const BELT = /^track_[lr]$/;

export const treads: Gate = (asset) =>
  asset.parts
    .filter((p) => BELT.test(p.name) && p.mesh !== null && p.motion?.kind !== 'tread')
    .map(
      (p): Finding => ({
        gate: 'treads',
        code: 'T3D_QA_TREADS',
        part: p.name,
        message: `track belt '${p.name}' has no tread motion: it merges into the body and stands still while the wheels turn`,
        fix: `give it the belt centre line: ctx.part('${p.name}', mesh, { motion: tread(beltLine, y, linkPitch) })`,
      }),
    );
