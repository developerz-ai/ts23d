// Ground finishing shared by the terrain tiles (mountain_range, real_valley). The library's
// per-triangle ground strips switch material at every triangle border and squeeze each triangle's
// V on its own, which renders as diagonal stripe banding over every slope; here the surface stays
// welded and its colour lives in smooth per-vertex blends, on ONE matte greyscale strip
// (`concrete`) stretched to macro scale (its noise reads as 50–300 m mottling, no seam anywhere).
// The tile's cut sides carry `rock_strata` with one band over the whole wall height, so its beds
// read as formations tens of metres thick. Plus: a D8 flow map (water accumulation), a single-cell
// spike clamp, the stream's ribbon along the valley floor (least-cost path between its lowest
// border points), and conifer impostors scattered over the forest belt.

import {
  type Mesh,
  MeshBuilder,
  merge,
  type Rng,
  stripRect,
  type TerrainGrid,
  type Vec3,
} from '@developerz.ai/ts23d';

const HALF = 0.5 / 4096;

/** Faces flatter than this (|nz|) are the tile's cut sides. */
const SIDE = 0.05;

/**
 * Surface UVs on the stretched `concrete` strip and side UVs on `rock_strata` (one band = the
 * wall's full height `wall`, metres), for a heightfield over `rect`.
 */
export function macroUV(
  m: Mesh,
  rect: readonly [number, number, number, number],
  wall: number,
): Mesh {
  const uvs = new Float32Array(m.uvs);
  const top = stripRect('concrete');
  const side = stripRect('rock_strata');
  const span = Math.max(rect[2] - rect[0], rect[3] - rect[1]);
  for (let i = 0; i < m.positions.length / 3; i++) {
    const x = m.positions[i * 3] ?? 0;
    const y = m.positions[i * 3 + 1] ?? 0;
    const z = m.positions[i * 3 + 2] ?? 0;
    const nz = Math.abs(m.normals[i * 3 + 2] ?? 1);
    if (nz < SIDE) {
      // Beds horizontal: V up the wall in one band, U along the perimeter at the SAME texel
      // scale (texture metres per wall metre = 1 / wall both ways). U squeezed harder than V
      // drew every texel as a tall thin sliver: vertical streaks down the cut sides.
      const along = (x - rect[0] + (y - rect[1])) / wall;
      uvs[i * 2] = side.u0 + (along / side.metres) * (side.u1 - side.u0);
      uvs[i * 2 + 1] =
        side.v0 + HALF + Math.min(1, Math.max(0, z / wall)) * (side.v1 - side.v0 - 2 * HALF);
    } else {
      uvs[i * 2] = top.u0 + ((x - rect[0]) / span) * (top.u1 - top.u0) * 3;
      uvs[i * 2 + 1] = top.v0 + HALF + ((y - rect[1]) / span) * (top.v1 - top.v0 - 2 * HALF);
    }
  }
  return { ...m, uvs };
}

/** Wall tint: the strata strip's own beds, darkened toward the base. */
export function sideTint(m: Mesh, wall: number, tint: Vec3): Mesh {
  const colors = new Float32Array(m.colors);
  for (let i = 0; i < m.positions.length / 3; i++) {
    if (Math.abs(m.normals[i * 3 + 2] ?? 1) >= SIDE) continue;
    const t = Math.min(1, Math.max(0, (m.positions[i * 3 + 2] ?? 0) / wall));
    const k = 0.62 + 0.38 * t;
    colors.set([tint[0] * k, tint[1] * k, tint[2] * k], i * 3);
  }
  return { ...m, colors };
}

/** Points rising more than `step` metres above all eight neighbours drop to that (needles). */
export function despike(g: TerrainGrid, step: number): TerrainGrid {
  const z = new Float64Array(g.z);
  for (let j = 0; j < g.ny; j++)
    for (let i = 0; i < g.nx; i++) {
      let hi = -Infinity;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          if (di === 0 && dj === 0) continue;
          const a = i + di;
          const b = j + dj;
          if (a < 0 || b < 0 || a >= g.nx || b >= g.ny) continue;
          hi = Math.max(hi, g.z[b * g.nx + a] ?? 0);
        }
      const k = j * g.nx + i;
      if ((g.z[k] ?? 0) > hi + step) z[k] = hi + step;
    }
  return { ...g, z };
}

/** D8 flow accumulation (cells draining through each point), as log share 0..1. */
export function d8Flow(g: TerrainGrid): Float64Array {
  const n = g.nx * g.ny;
  const order = Array.from({ length: n }, (_, k) => k).sort(
    (a, b) => (g.z[b] ?? 0) - (g.z[a] ?? 0),
  );
  const acc = new Float64Array(n).fill(1);
  for (const k of order) {
    const i = k % g.nx;
    const j = Math.floor(k / g.nx);
    let best = -1;
    let drop = 0;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        const a = i + di;
        const b = j + dj;
        if ((di === 0 && dj === 0) || a < 0 || b < 0 || a >= g.nx || b >= g.ny) continue;
        const d = ((g.z[k] ?? 0) - (g.z[b * g.nx + a] ?? 0)) / Math.hypot(di, dj);
        if (d > drop) {
          drop = d;
          best = b * g.nx + a;
        }
      }
    if (best >= 0) acc[best] = (acc[best] ?? 0) + (acc[k] ?? 0);
  }
  const top = Math.log(n);
  return acc.map((a) => Math.log(a) / top);
}

/** Bilinear read of a per-point map at (x, y). */
export function mapAt(g: TerrainGrid, map: Float64Array, x: number, y: number): number {
  const [x0, y0, x1, y1] = g.rect;
  const fx = Math.min(g.nx - 1.001, Math.max(0, ((x - x0) / (x1 - x0)) * (g.nx - 1)));
  const fy = Math.min(g.ny - 1.001, Math.max(0, ((y - y0) / (y1 - y0)) * (g.ny - 1)));
  const i = Math.floor(fx);
  const j = Math.floor(fy);
  const u = fx - i;
  const v = fy - j;
  const at = (a: number, b: number): number => map[b * g.nx + a] ?? 0;
  return (
    at(i, j) * (1 - u) * (1 - v) +
    at(i + 1, j) * u * (1 - v) +
    at(i, j + 1) * (1 - u) * v +
    at(i + 1, j + 1) * u * v
  );
}

/**
 * The valley's stream: the cheapest path over the grid between the lowest border point and the
 * lowest border point at least `apart` metres from it, where a step costs its length × (height
 * above the tile's lowest point + 1)² — so it keeps to the floor of the valley that joins them.
 * Plan points (x, y), downstream (the lowest end) last.
 */
export function valleyPath(g: TerrainGrid, apart: number): [number, number][] {
  const [x0, y0, x1, y1] = g.rect;
  const sx = (x1 - x0) / (g.nx - 1);
  const sy = (y1 - y0) / (g.ny - 1);
  const xy = (q: number): [number, number] => [
    x0 + (q % g.nx) * sx,
    y0 + Math.floor(q / g.nx) * sy,
  ];
  const border: number[] = [];
  for (let j = 0; j < g.ny; j++)
    for (let i = 0; i < g.nx; i++)
      if (i === 0 || j === 0 || i === g.nx - 1 || j === g.ny - 1) border.push(j * g.nx + i);
  const low = (qs: readonly number[]): number =>
    qs.reduce((b, q) => ((g.z[q] ?? 0) < (g.z[b] ?? 0) ? q : b), qs[0] ?? 0);
  const mouth = low(border);
  const [mx, my] = xy(mouth);
  const source = low(border.filter((q) => Math.hypot(xy(q)[0] - mx, xy(q)[1] - my) >= apart));
  let zMin = Infinity;
  for (const z of g.z) zMin = Math.min(zMin, z);
  // Dijkstra from the source with a binary heap.
  const n = g.nx * g.ny;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const heap: [number, number][] = [];
  const push = (d: number, q: number): void => {
    heap.push([d, q]);
    let c = heap.length - 1;
    while (c > 0) {
      const pnt = (c - 1) >> 1;
      if ((heap[pnt]?.[0] ?? 0) <= d) break;
      [heap[c], heap[pnt]] = [heap[pnt] ?? [0, 0], heap[c] ?? [0, 0]];
      c = pnt;
    }
  };
  const pop = (): [number, number] | undefined => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0 && last) {
      heap[0] = last;
      let c = 0;
      for (;;) {
        const l = 2 * c + 1;
        const r = l + 1;
        let m = c;
        if (l < heap.length && (heap[l]?.[0] ?? 0) < (heap[m]?.[0] ?? 0)) m = l;
        if (r < heap.length && (heap[r]?.[0] ?? 0) < (heap[m]?.[0] ?? 0)) m = r;
        if (m === c) break;
        [heap[c], heap[m]] = [heap[m] ?? [0, 0], heap[c] ?? [0, 0]];
        c = m;
      }
    }
    return top;
  };
  dist[source] = 0;
  push(0, source);
  for (let top = pop(); top; top = pop()) {
    const [d, k] = top;
    if (d > (dist[k] ?? 0) || k === mouth) {
      if (k === mouth) break;
      continue;
    }
    const i = k % g.nx;
    const j = Math.floor(k / g.nx);
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        const a = i + di;
        const b = j + dj;
        if ((di === 0 && dj === 0) || a < 0 || b < 0 || a >= g.nx || b >= g.ny) continue;
        const q = b * g.nx + a;
        const h = (g.z[q] ?? 0) - zMin + 1;
        const nd = d + Math.hypot(di * sx, dj * sy) * h * h;
        if (nd < (dist[q] ?? 0)) {
          dist[q] = nd;
          prev[q] = k;
          push(nd, q);
        }
      }
  }
  const out: [number, number][] = [];
  for (let q = mouth; q >= 0; q = prev[q] ?? -1) out.push(xy(q));
  return out.reverse();
}

/** Smooth a plan polyline (moving average) and keep every `every`-th point. */
export function smoothPath(p: readonly [number, number][], every: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < p.length; i += every) {
    let [sx, sy, n] = [0, 0, 0];
    for (let k = Math.max(0, i - 3); k <= Math.min(p.length - 1, i + 3); k++) {
      sx += p[k]?.[0] ?? 0;
      sy += p[k]?.[1] ?? 0;
      n++;
    }
    out.push([sx / n, sy / n]);
  }
  const last = p[p.length - 1];
  if (last && out.length > 0) out.push(last);
  return out;
}

/**
 * A water ribbon `width` metres wide along a plan path, `lift` metres over the ground read by
 * `height` (the same surface the terrain meshes), widening downstream, on the `water` strip.
 * `vary(x, y)` (default 1) scales the width there: pools and riffles instead of a canal.
 */
export function ribbon(
  path: readonly [number, number][],
  width: [number, number],
  height: (x: number, y: number) => number,
  lift: number,
  color: Vec3,
  vary: (x: number, y: number) => number = () => 1,
): Mesh {
  const r = stripRect('water');
  const mb = new MeshBuilder();
  let run = 0;
  const rows: [number, number, number][] = [];
  path.forEach((p, i) => {
    const a = path[Math.max(0, i - 1)] ?? p;
    const b = path[Math.min(path.length - 1, i + 1)] ?? p;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    if (i > 0)
      run += Math.hypot(p[0] - (path[i - 1]?.[0] ?? p[0]), p[1] - (path[i - 1]?.[1] ?? p[1]));
    const t = i / Math.max(1, path.length - 1);
    const w = ((width[0] + (width[1] - width[0]) * t) / 2) * vary(p[0], p[1]);
    const side: [number, number] = [-dy / l, dx / l];
    const v = r.v0 + HALF + ((run % 40) / 40) * (r.v1 - r.v0 - 2 * HALF);
    // The water level: `lift` over the bed's centre line. The centre row carries it; the banks
    // sink into the ground so the surface meets the terrain along both shores (never climbing a
    // valley wall), so on flat ground the surface still shows between them.
    const level = height(p[0], p[1]) + lift;
    const ids = [-1, 0, 1].map((s) => {
      const x = p[0] + side[0] * w * s;
      const y = p[1] + side[1] * w * s;
      const z = s === 0 ? level : Math.min(height(x, y) - 0.3, level);
      return mb.vertex({
        p: [x, y, z],
        n: [0, 0, 1],
        uv: [r.u0 + ((s + 1) / 2) * 0.02, v],
        color,
      });
    });
    rows.push([ids[0] ?? 0, ids[1] ?? 0, ids[2] ?? 0]);
  });
  for (let i = 0; i + 1 < rows.length; i++) {
    const [a, m, b] = rows[i] ?? [0, 0, 0];
    const [c, n, d] = rows[i + 1] ?? [0, 0, 0];
    // Left bank a/c, centre m/n, right bank b/d: counter-clockwise seen from above.
    mb.tri(a, n, m);
    mb.tri(a, c, n);
    mb.tri(m, d, b);
    mb.tri(m, n, d);
  }
  return mb.build();
}

/**
 * `count` conifer impostors (3-sided spires, 3 triangles, on the matte strip) where `forest(x, y)`
 * (0..1) is high, standing 0.4 m into the ground read by `height`. Sizes in metres.
 */
export function conifers(
  g: TerrainGrid,
  height: (x: number, y: number) => number,
  forest: (x: number, y: number) => number,
  count: number,
  size: { readonly height: [number, number]; readonly radius: number },
  color: Vec3,
  rng: Rng,
): Mesh {
  const r = stripRect('concrete');
  const uv: [number, number] = [r.u0 + 0.5, (r.v0 + r.v1) / 2];
  const mb = new MeshBuilder();
  const [x0, y0, x1, y1] = g.rect;
  let placed = 0;
  for (let tries = 0; placed < count && tries < count * 12; tries++) {
    const x = x0 + rng.next() * (x1 - x0);
    const y = y0 + rng.next() * (y1 - y0);
    if (rng.next() > forest(x, y)) continue;
    placed++;
    const z = height(x, y) - 0.4;
    const h = size.height[0] + rng.next() * (size.height[1] - size.height[0]);
    const rad = size.radius * (0.7 + 0.5 * rng.next());
    const a0 = rng.next() * Math.PI * 2;
    const k = 0.75 + 0.35 * rng.next();
    const tint: Vec3 = [color[0] * k, color[1] * k, color[2] * k];
    const top: Vec3 = [x, y, z + h];
    const base = [0, 1, 2].map((s): Vec3 => {
      const a = a0 + (s / 3) * Math.PI * 2;
      return [x + Math.cos(a) * rad, y + Math.sin(a) * rad, z];
    });
    for (let s = 0; s < 3; s++) {
      const p = base[s] ?? top;
      const q = base[(s + 1) % 3] ?? top;
      const e1: Vec3 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
      const e2: Vec3 = [top[0] - p[0], top[1] - p[1], top[2] - p[2]];
      const nx = e1[1] * e2[2] - e1[2] * e2[1];
      const ny = e1[2] * e2[0] - e1[0] * e2[2];
      const nz = e1[0] * e2[1] - e1[1] * e2[0];
      const l = Math.hypot(nx, ny, nz) || 1;
      const n: Vec3 = [nx / l, ny / l, nz / l];
      const dark: Vec3 = [tint[0] * 0.7, tint[1] * 0.7, tint[2] * 0.7];
      mb.tri(
        mb.vertex({ p, n, uv, color: dark }),
        mb.vertex({ p: q, n, uv, color: dark }),
        mb.vertex({ p: top, n, uv, color: tint }),
      );
    }
  }
  return merge([mb.build()]);
}

/**
 * `color` averaged over an `n` × `n` footprint ±`r` metres round each point (heights read by
 * `height`): a vertex `2r` apart from its neighbours then carries the mean of the ground it stands
 * for, so a snow line or a forest edge fades across a few far cells instead of switching cell by
 * cell (a one-cell ridge of snow becomes a soft dusting, not a bright seam). `r` = 0 keeps `color`.
 */
export function footprint(
  color: (x: number, y: number, z: number) => Vec3,
  height: (x: number, y: number) => number,
  r: number,
  n: number,
): (x: number, y: number, z: number) => Vec3 {
  if (r <= 0 || n < 2) return color;
  return (x, y) => {
    let [r0, g0, b0] = [0, 0, 0];
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const sx = x - r + (2 * r * i) / (n - 1);
        const sy = y - r + (2 * r * j) / (n - 1);
        const c = color(sx, sy, height(sx, sy));
        r0 += c[0];
        g0 += c[1];
        b0 += c[2];
      }
    const k = 1 / (n * n);
    return [r0 * k, g0 * k, b0 * k];
  };
}
