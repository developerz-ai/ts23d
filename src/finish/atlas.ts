// A per-asset texture atlas for the finish layer: the trim sheet's UVs overlap by design, so a
// unique texture needs its own non-overlapping UVs. xatlas-like box projection: each triangle joins
// the chart of its dominant face axis (±X, ±Y, ±Z), charts split into edge-connected islands,
// projected flat onto their axis plane at one texel density, shelf-packed with padding. Vertices
// are split only where charts meet; triangle order is kept, so triangle t is the same triangle
// in the source and atlas meshes. Deterministic: fixed iteration order, no hashing of floats.

import type { CompiledAsset, Mesh, Part } from '../core/index.ts';
import { Ts23dError } from '../core/index.ts';
import { glob } from '../qa/index.ts';

export interface AtlasPart {
  readonly name: string;
  /** Same triangles as the part's mesh; `uvs` = atlas UV (0..1, v down), `colors` untouched. */
  readonly mesh: Mesh;
  /** The original trim-sheet UV of every atlas vertex (to sample the sheet under the finish). */
  readonly trimUv: Float32Array;
}

export interface Atlas {
  readonly size: number;
  readonly texelsPerMetre: number;
  readonly charts: number;
  readonly parts: ReadonlyMap<string, AtlasPart>;
}

/** Parts the finish paints: opaque, no paint slot (liveries stay repaintable), no named finish, no glow. */
export function isFinishable(p: Part, glow: readonly RegExp[]): boolean {
  return (
    p.mesh !== null &&
    p.mesh.indices.length > 0 &&
    (p.surface ?? 'opaque') === 'opaque' &&
    p.paint === undefined &&
    p.finish === undefined &&
    !glow.some((g) => g.test(p.name))
  );
}

export const glowRes = (a: CompiledAsset): RegExp[] =>
  (a.glow ?? []).flatMap((g) => g.parts.map(glob));

interface Chart {
  readonly part: number;
  readonly axis: number;
  readonly tris: number[];
  readonly lo: [number, number];
  readonly hi: [number, number];
  x: number;
  y: number;
}

const PLANE = [
  [1, 2],
  [0, 2],
  [0, 1],
] as const;

function find(parent: Int32Array, i: number): number {
  let r = i;
  while ((parent[r] ?? r) !== r) r = parent[r] ?? r;
  let k = i;
  while ((parent[k] ?? k) !== r) {
    const next = parent[k] ?? k;
    parent[k] = r;
    k = next;
  }
  return r;
}

/** Charts of one mesh: triangles grouped by dominant normal axis, then by shared vertices. */
function chartsOf(m: Mesh, part: number): Chart[] {
  const P = m.positions;
  const I = m.indices;
  const nt = I.length / 3;
  const cls = new Int8Array(nt);
  for (let t = 0; t < nt; t++) {
    const [a, b, c] = [I[t * 3] ?? 0, I[t * 3 + 1] ?? 0, I[t * 3 + 2] ?? 0].map((v) => v * 3) as [
      number,
      number,
      number,
    ];
    const e = [0, 1, 2].map((k) => (P[b + k] ?? 0) - (P[a + k] ?? 0));
    const f = [0, 1, 2].map((k) => (P[c + k] ?? 0) - (P[a + k] ?? 0));
    const n = [
      (e[1] ?? 0) * (f[2] ?? 0) - (e[2] ?? 0) * (f[1] ?? 0),
      (e[2] ?? 0) * (f[0] ?? 0) - (e[0] ?? 0) * (f[2] ?? 0),
      (e[0] ?? 0) * (f[1] ?? 0) - (e[1] ?? 0) * (f[0] ?? 0),
    ];
    let axis = 2;
    for (const k of [0, 1]) if (Math.abs(n[k] ?? 0) > Math.abs(n[axis] ?? 0)) axis = k;
    cls[t] = axis * 2 + ((n[axis] ?? 0) >= 0 ? 1 : 0);
  }
  // Union triangles of one class that share a vertex (by index or by quantised position).
  const parent = new Int32Array(nt).map((_, i) => i);
  const seen = new Map<string, number>();
  for (let t = 0; t < nt; t++)
    for (let k = 0; k < 3; k++) {
      const v = (I[t * 3 + k] ?? 0) * 3;
      const q = [0, 1, 2].map((j) => Math.round((P[v + j] ?? 0) * 1e5)).join(',');
      const key = `${cls[t]}|${q}`;
      const other = seen.get(key);
      if (other === undefined) seen.set(key, t);
      else parent[find(parent, t)] = find(parent, other);
    }
  const byRoot = new Map<number, Chart>();
  for (let t = 0; t < nt; t++) {
    const r = find(parent, t);
    let ch = byRoot.get(r);
    if (!ch) {
      ch = {
        part,
        axis: (cls[t] ?? 0) >> 1,
        tris: [],
        lo: [1e9, 1e9],
        hi: [-1e9, -1e9],
        x: 0,
        y: 0,
      };
      byRoot.set(r, ch);
    }
    ch.tris.push(t);
    const [pu, pv] = PLANE[ch.axis as 0 | 1 | 2];
    for (let k = 0; k < 3; k++) {
      const v = (I[t * 3 + k] ?? 0) * 3;
      ch.lo[0] = Math.min(ch.lo[0], P[v + pu] ?? 0);
      ch.lo[1] = Math.min(ch.lo[1], P[v + pv] ?? 0);
      ch.hi[0] = Math.max(ch.hi[0], P[v + pu] ?? 0);
      ch.hi[1] = Math.max(ch.hi[1], P[v + pv] ?? 0);
    }
  }
  return [...byRoot.values()];
}

/** Shelf-pack every chart at `s` texels per metre; false when they do not fit. */
function pack(charts: readonly Chart[], s: number, size: number, pad: number): boolean {
  let x = 0;
  let y = 0;
  let row = 0;
  for (const c of charts) {
    const w = Math.ceil((c.hi[0] - c.lo[0]) * s) + 2 * pad + 1;
    const h = Math.ceil((c.hi[1] - c.lo[1]) * s) + 2 * pad + 1;
    if (x + w > size) {
      x = 0;
      y += row;
      row = 0;
    }
    if (w > size || y + h > size) return false;
    c.x = x + pad;
    c.y = y + pad;
    x += w;
    row = Math.max(row, h);
  }
  return true;
}

export function buildAtlas(asset: CompiledAsset, size: number, pad = 2): Atlas {
  const glow = glowRes(asset);
  const parts = asset.parts.filter((p) => isFinishable(p, glow));
  const charts = parts.flatMap((p, i) => (p.mesh ? chartsOf(p.mesh, i) : []));
  if (charts.length === 0)
    throw new Ts23dError('T3D_FINISH_INVALID', {
      cause: `'${asset.name}' has no part the finish can paint (all are see-through, painted, glowing or named finishes)`,
      fix: 'finish an asset with opaque, unpainted parts; painted parts keep their liveries by design',
    });
  const dim = (c: Chart): number => Math.max(c.hi[1] - c.lo[1], c.hi[0] - c.lo[0]);
  const order = [...charts].sort(
    (a, b) => dim(b) - dim(a) || b.hi[1] - b.lo[1] - (a.hi[1] - a.lo[1]) || a.part - b.part,
  );
  const area = charts.reduce((s, c) => s + (c.hi[0] - c.lo[0]) * (c.hi[1] - c.lo[1]), 0);
  let s = Math.sqrt((0.6 * size * size) / Math.max(area, 1e-9));
  let tries = 0;
  while (!pack(order, s, size, pad)) {
    s *= 0.92;
    if (++tries > 80)
      throw new Ts23dError('T3D_FINISH_INVALID', {
        cause: `${charts.length} charts do not fit a ${size}² atlas with ${pad}-texel padding`,
        fix: 'raise the atlas size (--atlas 2048) or finish a lower-detail LOD',
      });
  }
  const out = new Map<string, AtlasPart>();
  parts.forEach((p, i) => {
    if (p.mesh)
      out.set(
        p.name,
        splitPart(
          p.name,
          p.mesh,
          charts.filter((c) => c.part === i),
          s,
          size,
        ),
      );
  });
  return { size, texelsPerMetre: s, charts: charts.length, parts: out };
}

/** New vertices per (chart, source vertex); triangle order kept. */
function splitPart(
  name: string,
  m: Mesh,
  charts: readonly Chart[],
  s: number,
  size: number,
): AtlasPart {
  const nt = m.indices.length / 3;
  const chartOf = new Int32Array(nt);
  charts.forEach((c, ci) => {
    for (const t of c.tris) chartOf[t] = ci;
  });
  const remap = new Map<number, number>();
  const nv = m.positions.length / 3;
  const src: number[] = [];
  const uv: number[] = [];
  const indices = new Uint32Array(m.indices.length);
  for (let t = 0; t < nt; t++) {
    const ci = chartOf[t] ?? 0;
    const c = charts[ci] as Chart;
    const [pu, pv] = PLANE[c.axis as 0 | 1 | 2];
    for (let k = 0; k < 3; k++) {
      const v = m.indices[t * 3 + k] ?? 0;
      const key = ci * nv + v;
      let n = remap.get(key);
      if (n === undefined) {
        n = src.length;
        remap.set(key, n);
        src.push(v);
        uv.push(
          (c.x + ((m.positions[v * 3 + pu] ?? 0) - c.lo[0]) * s) / size,
          (c.y + ((m.positions[v * 3 + pv] ?? 0) - c.lo[1]) * s) / size,
        );
      }
      indices[t * 3 + k] = n;
    }
  }
  const pick = (a: Float32Array, k: number): Float32Array => {
    const o = new Float32Array(src.length * k);
    src.forEach((v, i) => {
      for (let j = 0; j < k; j++) o[i * k + j] = a[v * k + j] ?? 0;
    });
    return o;
  };
  return {
    name,
    mesh: {
      positions: pick(m.positions, 3),
      normals: pick(m.normals, 3),
      uvs: new Float32Array(uv),
      colors: pick(m.colors, 3),
      indices,
    },
    trimUv: pick(m.uvs, 2),
  };
}
