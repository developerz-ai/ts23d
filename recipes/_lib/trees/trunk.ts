// LOD2 trunk for the pine, derived from THIS tree's LOD0 trunk so the far silhouette keeps its
// width: ring centres, radii and bark tint are read back from the LOD0 sweep (P rings of S + 1
// vertices, then two caps), resampled to a few points, widened by the pentagon's mean-width loss,
// flared at the foot where LOD0 has its root buttresses, and run up to a point at `apex` (the
// crown's leader pad peaks there, so the crown provably holds on).

import { type Mesh, sweep, type Vec3 } from '@developerz.ai/ts23d';

/** LOD0 trunk: 8 radial segments (+1 seam vertex) per ring, see the tree kind's RADIAL table. */
const S0 = 8;
const SIDES = 5;
/** A pentagon inscribed in r is on average 1.871 r wide; a circle 2 r. */
const WIDEN = 2 / ((10 * Math.sin(Math.PI / 5)) / Math.PI);
/** Root buttresses: LOD0's flare is ~1.7× the trunk radius at the ground. */
const FLARE = 1.45;

interface Ring {
  readonly c: Vec3;
  readonly r: number;
  readonly col: Vec3;
}

function rings(m: Mesh): Ring[] {
  const per = S0 + 1;
  const P = Math.floor((m.positions.length / 3 - 2 * (S0 + 1)) / per);
  const out: Ring[] = [];
  for (let i = 0; i < P; i++) {
    const c: [number, number, number] = [0, 0, 0];
    const col: [number, number, number] = [0, 0, 0];
    for (let j = 0; j < S0; j++) {
      const v = (i * per + j) * 3;
      for (let k = 0; k < 3; k++) {
        c[k] = (c[k] ?? 0) + (m.positions[v + k] ?? 0) / S0;
        col[k] = (col[k] ?? 0) + (m.colors[v + k] ?? 0) / S0;
      }
    }
    let r = 0;
    for (let j = 0; j < S0; j++) {
      const v = (i * per + j) * 3;
      r += Math.hypot((m.positions[v] ?? 0) - c[0], (m.positions[v + 1] ?? 0) - c[1]) / S0;
    }
    out.push({ c, r, col });
  }
  return out;
}

/** ≤ 65 triangles: foot flare, breast height, every other LOD0 ring up the bole, LOD0's top, apex. */
export function lowTrunk(lod0Trunk: Mesh, apex: Vec3): Mesh {
  const all = rings(lod0Trunk);
  const last = all.length - 1;
  const pick = [0, 1, 3, 5, 7, last].map((i) => Math.min(last, i));
  const chosen = [...new Set(pick)].map((i) => all[i]).filter((r): r is Ring => r !== undefined);
  const first = chosen[0];
  if (!first) return lod0Trunk;
  const path: Vec3[] = chosen.map((r) => r.c);
  const scale = chosen.map((r, i) => r.r * WIDEN * (i === 0 ? FLARE : 1));
  const top = chosen[chosen.length - 1] ?? first;
  if (apex[2] > top.c[2] + 1e-3) {
    path.push(apex);
    scale.push(0);
  }
  const m = sweep({
    section: { radius: 1, segments: SIDES },
    path,
    scale,
    color: first.col,
    strip: 'wood',
    caps: 'start',
  });
  // Bark tint per ring from LOD0 (grey-brown low → orange high), nearest ring by height.
  for (let i = 0; i < m.colors.length / 3; i++) {
    const z = m.positions[i * 3 + 2] ?? 0;
    let best = first;
    for (const r of chosen) if (Math.abs(r.c[2] - z) < Math.abs(best.c[2] - z)) best = r;
    m.colors.set(best.col, i * 3);
  }
  return m;
}
