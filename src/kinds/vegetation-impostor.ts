// LOD2 stand-ins, < 300 triangles. 'blob': a lathe of the real crown envelope (binned from the
// full skeleton, so it is THIS tree's silhouette) whose top apex is the trunk's tip — one shared
// point, so the crown provably touches the trunk. 'cards': a dozen coarse folded frond strips
// rooted on the trunk's top cap centre (palms). Smooth normals on the blob, flat on the cards.

import { type Mesh, MeshBuilder, type Rng, type Vec3 } from '../core/index.ts';
import { lathe, sweep, transportFrames } from '../primitives/index.ts';
import type { TreeParams } from './vegetation-params.ts';
import type { Stem } from './vegetation-skeleton.ts';

export interface Impostor {
  readonly trunk: Mesh;
  readonly leaves: Mesh;
}

/** Trunk at 4 path points; `apex` extends it straight up to a point (blob's top). */
function coarseTrunk(trunk: Stem, p: TreeParams, apex: number | null): Mesh {
  const n = trunk.pts.length - 1;
  const idx = [...new Set([0, Math.round(n / 3), Math.round((2 * n) / 3), n])];
  const pts = idx.map((i): Vec3 => trunk.pts[i] ?? [0, 0, 0]);
  const radii = idx.map((i) => trunk.radii[i] ?? 0.1);
  const last = pts.length - 1;
  const tip = pts[last] ?? [0, 0, 1];
  if (apex !== null && apex > tip[2] + 1e-6) {
    pts.push([tip[0], tip[1], apex]);
    radii.push(0);
  } else radii[last] = 0;
  return sweep({
    section: { radius: 1, segments: 5 },
    path: pts,
    scale: radii,
    color: p.bark,
    strip: 'wood',
    caps: apex === null ? 'end' : false,
  });
}

export function blob(stems: readonly Stem[], p: TreeParams, rng: Rng): Impostor {
  const trunk = stems[0];
  if (!trunk) return { trunk: new MeshBuilder().build(), leaves: new MeshBuilder().build() };
  const tip = trunk.pts[trunk.pts.length - 1] ?? [0, 0, 1];
  const margin = p.leaves.size * 0.6;
  let z0 = Infinity;
  let z1 = tip[2];
  for (const s of stems)
    for (const q of s.level > 0 ? s.pts : []) {
      z0 = Math.min(z0, q[2] - margin * (1 + (p.leaves.hang ?? 0) * 2));
      z1 = Math.max(z1, q[2] + margin);
    }
  if (!Number.isFinite(z0)) z0 = tip[2] * 0.5;
  const BINS = 6;
  const r = new Array<number>(BINS).fill(0.2);
  for (const s of stems)
    for (const q of s.level > 0 ? s.pts : []) {
      const b = Math.min(BINS - 1, Math.max(0, Math.floor(((q[2] - z0) / (z1 - z0)) * BINS)));
      r[b] = Math.max(r[b] ?? 0, Math.hypot(q[0] - tip[0], q[1] - tip[1]) + margin);
    }
  const profile: [number, number][] = [[0, z0]];
  for (let b = 0; b < BINS; b++) profile.push([r[b] ?? 0.2, z0 + ((b + 0.5) / BINS) * (z1 - z0)]);
  profile.push([0, z1]);
  const leaves = lathe({ profile, segments: 10, color: p.leaves.color, at: [tip[0], tip[1], 0] });
  const [cr, cg, cb] = p.leaves.color;
  for (let i = 0; i < leaves.colors.length / 3; i++) {
    const t = ((leaves.positions[i * 3 + 2] ?? 0) - z0) / (z1 - z0);
    const k = (0.55 + 0.5 * t) * (1 + rng.range(-0.08, 0.08));
    leaves.colors.set([cr * k, cg * k, cb * k], i * 3);
  }
  return { trunk: coarseTrunk(trunk, p, z1), leaves };
}

export function frondCards(stems: readonly Stem[], p: TreeParams, level: number): Impostor {
  const trunk = stems[0];
  const mb = new MeshBuilder();
  if (!trunk) return { trunk: mb.build(), leaves: mb.build() };
  const top = trunk.pts[trunk.pts.length - 1] ?? [0, 0, 1];
  const fronds = stems.filter((s) => s.level === level);
  const every = Math.max(1, Math.ceil(fronds.length / 12));
  const [cr, cg, cb] = p.leaves.color;
  for (const [fi, st] of fronds.entries()) {
    if (fi % every !== 0) continue;
    const n = st.pts.length - 1;
    const pts = [top, st.pts[Math.round(n / 2)] ?? top, st.pts[n] ?? top];
    const fr = transportFrames(pts);
    const w = [0.25, 1, 0.35].map((k) => k * st.length * p.leaves.width);
    for (const side of [1, -1]) {
      const edge = pts.map((c, j): Vec3 => {
        const f = fr[j];
        const ww = (w[j] ?? 0) * side;
        if (!f) return c;
        return [
          c[0] + (f.b[0] * 0.85 - f.n[0] * 0.45 * side) * ww,
          c[1] + (f.b[1] * 0.85 - f.n[1] * 0.45 * side) * ww,
          c[2] + (f.b[2] * 0.85 - f.n[2] * 0.45 * side) * ww,
        ];
      });
      for (let j = 0; j < 2; j++) {
        const q = [pts[j], pts[j + 1], edge[j + 1], edge[j]] as Vec3[];
        const [a, b, c] = [q[0] ?? top, q[1] ?? top, q[2] ?? top];
        const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const nx = (e1[1] ?? 0) * (e2[2] ?? 0) - (e1[2] ?? 0) * (e2[1] ?? 0);
        const ny = (e1[2] ?? 0) * (e2[0] ?? 0) - (e1[0] ?? 0) * (e2[2] ?? 0);
        const nz = (e1[0] ?? 0) * (e2[1] ?? 0) - (e1[1] ?? 0) * (e2[0] ?? 0);
        const l = Math.hypot(nx, ny, nz) || 1;
        for (const s of [1, -1]) {
          const nn: Vec3 = [(nx / l) * s, (ny / l) * s, (nz / l) * s];
          const ids = q.map((v, k) => {
            const sh = k < 2 ? 0.7 : 1;
            return mb.vertex({ p: v, n: nn, uv: [0, 0], color: [cr * sh, cg * sh, cb * sh] });
          });
          const [i0 = 0, i1 = 0, i2 = 0, i3 = 0] = s > 0 ? ids : [...ids].reverse();
          mb.quad(i0, i1, i2, i3);
        }
      }
    }
  }
  return { trunk: coarseTrunk(trunk, p, null), leaves: mb.build() };
}
