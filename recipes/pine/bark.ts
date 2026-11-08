// Pine bark finish: moves the tree kind's wood (classic `wood` strip) onto `bark_pine`, keeps the
// kind's height gradient (grey-brown low → orange high) as a soft tint, greens the north (+Y),
// shaded lower trunk with moss.
//
// Why not `_lib/finish/grove.ts`'s barkOf: a sweep's seam column (and its cap rims) sits at
// V = v1 of the wood band, which `stripAtV` classifies as the NEXT strip — those vertices kept
// the wood UVs and the kind's dark untinted colour, a grey streak down the whole trunk. Here the
// band test includes its top edge, and the remapped V is kept a hair inside the bark band.

import { type Mesh, type StripId, stripRect, type Vec3 } from '@developerz.ai/ts23d';

const MOSS: Vec3 = [0.22, 0.32, 0.08];
/** Keep remapped V this far inside the target band so filtering never reads the next strip. */
const INSET = 1e-4;

/** True when `v` lies in the wood band, top edge included (a sweep's seam column sits there). */
export function inWoodBand(v: number): boolean {
  const wood = stripRect('wood');
  return v >= wood.v0 - 1e-7 && v <= wood.v1 + 1e-7;
}

export function pineBark(m: Mesh, bark: StripId, moss: number, noise: (p: Vec3) => number): Mesh {
  const uvs = new Float32Array(m.uvs);
  const colors = new Float32Array(m.colors);
  const wood = stripRect('wood');
  const to = stripRect(bark);
  for (let i = 0; i < m.positions.length / 3; i++) {
    const v = m.uvs[i * 2 + 1] ?? 0;
    if (!inWoodBand(v)) continue;
    uvs[i * 2] = to.u0 + ((uvs[i * 2] ?? 0) - wood.u0) * (wood.metres / to.metres);
    uvs[i * 2 + 1] = Math.min(to.v1 - INSET, Math.max(to.v0 + INSET, to.v0 + (v - wood.v0)));
    const c: Vec3 = [colors[i * 3] ?? 0, colors[i * 3 + 1] ?? 0, colors[i * 3 + 2] ?? 0];
    const top = Math.max(...c, 1e-3);
    let out: Vec3 = [
      0.55 + 0.45 * (c[0] / top),
      0.55 + 0.45 * (c[1] / top),
      0.55 + 0.45 * (c[2] / top),
    ];
    const p: Vec3 = [
      m.positions[i * 3] ?? 0,
      m.positions[i * 3 + 1] ?? 0,
      m.positions[i * 3 + 2] ?? 0,
    ];
    const north = m.normals[i * 3 + 1] ?? 0;
    const low = Math.max(0, 1 - p[2] / 4);
    const w = moss * Math.max(0, north) * low * (0.6 + 0.4 * noise(p));
    if (w > 0)
      out = [
        out[0] + (MOSS[0] - out[0]) * w,
        out[1] + (MOSS[1] - out[1]) * w,
        out[2] + (MOSS[2] - out[2]) * w,
      ];
    colors.set(out, i * 3);
  }
  return { ...m, uvs, colors };
}
