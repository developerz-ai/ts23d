// Gate: a track belt that runs. A tracked vehicle's `track_l` / `track_r` with geometry must carry
// a `tread` motion: without one the belt merges into the static body and only the wheels turn
// (defect D25). And every belt with a `tread` motion must be able to loop: the baked `run` clip
// moves it one link pitch and starts again (export/tread-morphs.ts), which only looks right when
// the loop is a whole number of pitches long and the mesh one pitch on is the same mesh.

import { BeltLoop, beltRun } from '../passes/index.ts';
import type { Finding, Gate } from './types.ts';

const BELT = /^track_[lr]$/;
/** The loop may miss a whole number of pitches by this share of one pitch. */
const WHOLE = 0.05;

const finding = (part: string, message: string, fix: string): Finding => ({
  gate: 'treads',
  code: 'T3D_QA_TREADS',
  part,
  message,
  fix,
});

export const treads: Gate = (asset) => {
  const out: Finding[] = [];
  for (const p of asset.parts) {
    const mesh = p.mesh && p.mesh.indices.length > 0 ? p.mesh : null;
    if (p.motion?.kind !== 'tread') {
      if (BELT.test(p.name) && p.mesh !== null)
        out.push(
          finding(
            p.name,
            `track belt '${p.name}' has no tread motion: it merges into the body and stands still while the wheels turn`,
            `give it the belt centre line: ctx.part('${p.name}', mesh, { motion: tread(beltLine, y, linkPitch) })`,
          ),
        );
      continue;
    }
    if (!mesh) continue;
    const { path, pitch } = p.motion;
    const length = new BeltLoop(path).length;
    const links = length / pitch;
    if (Math.abs(links - Math.round(links)) > WHOLE)
      out.push(
        finding(
          p.name,
          `track belt '${p.name}': its ${length.toFixed(4)} m loop is ${links.toFixed(2)} pitches of ${pitch.toFixed(4)} m, not a whole number, so links laid at that pitch do not close and the belt runs at the wrong speed`,
          `pass pitch = loop length ÷ link count (${(length / Math.round(links)).toFixed(5)} m for ${Math.round(links)} links; × 2 when two link shapes alternate), measured along the line, not as the chord between two stations`,
        ),
      );
    const run = beltRun(path, pitch, mesh);
    if (run.unmatched > 0)
      out.push(
        finding(
          p.name,
          `track belt '${p.name}' does not repeat every ${pitch.toFixed(4)} m pitch: ${run.unmatched} of ${run.vertices} vertices have no twin one pitch along the loop, so the run clip cannot move it and it stands still in a glTF viewer`,
          'build the belt from one link placed at stations one pitch apart round the whole loop (a plain band: outline points one pitch apart), and pass the length after which the shape repeats as pitch',
        ),
      );
  }
  return out;
};
