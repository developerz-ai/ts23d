// Crown reshaping after the kind's fit: `squash` pulls a crown-frame mesh up towards the crown top
// (z' = top − (top − z)·k), so a crown the kind grew as a ball reads as the flat, shallow, wider
// than tall umbrella of an old open-grown tree. The top and the plan spread are unchanged (the
// measured height and spread hold); branch roots slide up the bole they sit on. Normals follow by
// the inverse transpose of the scale (n.z / k), renormalised.

import type { Mesh } from '@developerz.ai/ts23d';
import { dmath } from '@developerz.ai/ts23d';

export function squash(m: Mesh, top: number, k: number): Mesh {
  const positions = new Float32Array(m.positions);
  const normals = new Float32Array(m.normals);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i + 2] = top - (top - (positions[i + 2] ?? 0)) * k;
    const nx = normals[i] ?? 0;
    const ny = normals[i + 1] ?? 0;
    const nz = (normals[i + 2] ?? 0) / k;
    const l = dmath.hypot(nx, ny, nz) || 1;
    normals[i] = nx / l;
    normals[i + 1] = ny / l;
    normals[i + 2] = nz / l;
  }
  return { ...m, positions, normals };
}
