// Mesh-level helpers of the hybrid blend, over a part's welded vertices (seams share a position,
// so they move together): Jacobi smoothing of a scalar (the normal push), and a shrinkwrap — each
// free vertex projected onto a target surface by a move field, relaxed toward its neighbours'
// mean (umbrella Laplacian: the code mesh's own rings and ripples go, the vertices spread instead
// of bunching in the target's hollows), and projected again; pinned vertices hold the border.

import type { Mesh, Vec3 } from '@developerz.ai/ts23d';

export interface Welded {
  /** Vertex → welded id. */
  readonly of: Int32Array;
  readonly n: number;
  /** CSR adjacency over welded ids (each undirected edge both ways, duplicates kept). */
  readonly start: Int32Array;
  readonly next: Int32Array;
}

export function weld(mesh: Mesh): Welded {
  const P = mesh.positions;
  const ids = new Map<string, number>();
  const of = Int32Array.from({ length: P.length / 3 }, (_, v) => {
    const k = `${P[v * 3]},${P[v * 3 + 1]},${P[v * 3 + 2]}`;
    const id = ids.get(k) ?? ids.size;
    ids.set(k, id);
    return id;
  });
  const n = ids.size;
  const I = mesh.indices;
  const deg = new Int32Array(n + 1);
  const edge = (t: number, e: number): [number, number] => [
    of[I[t + e] ?? 0] ?? 0,
    of[I[t + ((e + 1) % 3)] ?? 0] ?? 0,
  ];
  for (let t = 0; t < I.length; t += 3)
    for (let e = 0; e < 3; e++) {
      const [a, b] = edge(t, e);
      deg[a + 1] = (deg[a + 1] ?? 0) + 1;
      deg[b + 1] = (deg[b + 1] ?? 0) + 1;
    }
  for (let i = 0; i < n; i++) deg[i + 1] = (deg[i + 1] ?? 0) + (deg[i] ?? 0);
  const start = Int32Array.from(deg);
  const fill = Int32Array.from(deg);
  const next = new Int32Array(start[n] ?? 0);
  for (let t = 0; t < I.length; t += 3)
    for (let e = 0; e < 3; e++) {
      const [a, b] = edge(t, e);
      next[fill[a] ?? 0] = b;
      fill[a] = (fill[a] ?? 0) + 1;
      next[fill[b] ?? 0] = a;
      fill[b] = (fill[b] ?? 0) + 1;
    }
  return { of, n, start, next };
}

/** 1 per welded id on the mesh's largest connected shell, 0 elsewhere (teeth, loose bits). */
export function mainShell(w: Welded): Float64Array {
  const comp = new Int32Array(w.n).fill(-1);
  const size: number[] = [];
  for (let s = 0; s < w.n; s++) {
    if ((comp[s] ?? 0) >= 0) continue;
    const c = size.length;
    let count = 0;
    const stack = [s];
    comp[s] = c;
    while (stack.length) {
      const i = stack.pop() ?? 0;
      count++;
      for (let e = w.start[i] ?? 0; e < (w.start[i + 1] ?? 0); e++) {
        const j = w.next[e] ?? 0;
        if ((comp[j] ?? 0) < 0) {
          comp[j] = c;
          stack.push(j);
        }
      }
    }
    size.push(count);
  }
  const big = size.indexOf(Math.max(...size));
  return Float64Array.from(comp, (c) => (c === big ? 1 : 0));
}

/** Per-vertex scalars smoothed over welded neighbours (`rounds` Jacobi passes, self included). */
export function smoothOver(w: Welded, values: Float64Array, rounds: number): Float64Array {
  const sum = new Float64Array(w.n);
  const cnt = new Float64Array(w.n);
  w.of.forEach((id, v) => {
    sum[id] = (sum[id] ?? 0) + (values[v] ?? 0);
    cnt[id] = (cnt[id] ?? 0) + 1;
  });
  let x = sum.map((s, i) => s / (cnt[i] || 1));
  for (let r = 0; r < rounds; r++) {
    const y = new Float64Array(w.n);
    for (let i = 0; i < w.n; i++) {
      let acc = x[i] ?? 0;
      const [a, b] = [w.start[i] ?? 0, w.start[i + 1] ?? 0];
      for (let e = a; e < b; e++) acc += x[w.next[e] ?? 0] ?? 0;
      y[i] = acc / (b - a + 1);
    }
    x = y;
  }
  return Float64Array.from(w.of, (id) => x[id] ?? 0);
}

/** Welded positions (world: `at` added) onto a surface by `move`, `rounds` of project + relax,
 *  then a last projection and `settle` relax rounds. `free[id]` = 0 pins a vertex. Returns world positions per welded id. */
export function shrinkwrap(
  mesh: Mesh,
  w: Welded,
  at: Vec3,
  free: Float64Array,
  move: (p: Vec3, id: number) => Vec3,
  rounds: number,
  settle = 0,
): Float64Array {
  const P = mesh.positions;
  const x = new Float64Array(w.n * 3);
  w.of.forEach((id, v) => {
    for (let a = 0; a < 3; a++) x[id * 3 + a] = (P[v * 3 + a] ?? 0) + (at[a] ?? 0);
  });
  const project = (): void => {
    for (let i = 0; i < w.n; i++) {
      if (!((free[i] ?? 0) > 0)) continue;
      const d = move([x[i * 3] ?? 0, x[i * 3 + 1] ?? 0, x[i * 3 + 2] ?? 0], i);
      for (let a = 0; a < 3; a++) x[i * 3 + a] = (x[i * 3 + a] ?? 0) + (d[a] ?? 0);
    }
  };
  const relax = (): void => {
    const y = Float64Array.from(x);
    for (let i = 0; i < w.n; i++) {
      const [a, b] = [w.start[i] ?? 0, w.start[i + 1] ?? 0];
      if (!((free[i] ?? 0) > 0) || b === a) continue;
      for (let k = 0; k < 3; k++) {
        let m = 0;
        for (let e = a; e < b; e++) m += x[(w.next[e] ?? 0) * 3 + k] ?? 0;
        y[i * 3 + k] = (x[i * 3 + k] ?? 0) + 0.5 * (m / (b - a) - (x[i * 3 + k] ?? 0));
      }
    }
    x.set(y);
  };
  for (let r = 0; r < rounds; r++) {
    project();
    relax();
  }
  project();
  // Settle: a closest point flips between sheets of the target across a fold; a few relax
  // rounds after the last projection take the crease out (off the surface by < 1 mm).
  for (let r = 0; r < settle; r++) relax();
  return x;
}

/** Taubin λ|μ smoothing of a mesh's positions (`rounds` pairs; low-pass without shrinking): a
 *  model's facets and fur-clump folds are not shape, and a skin wrapped onto them creases. */
export function taubin(mesh: Mesh, rounds: number): Mesh {
  const w = weld(mesh);
  const P = mesh.positions;
  let x = new Float64Array(w.n * 3);
  w.of.forEach((id, v) => {
    for (let a = 0; a < 3; a++) x[id * 3 + a] = P[v * 3 + a] ?? 0;
  });
  const step = (f: number): void => {
    const y = Float64Array.from(x);
    for (let i = 0; i < w.n; i++) {
      const [a, b] = [w.start[i] ?? 0, w.start[i + 1] ?? 0];
      if (b === a) continue;
      for (let k = 0; k < 3; k++) {
        let m = 0;
        for (let e = a; e < b; e++) m += x[(w.next[e] ?? 0) * 3 + k] ?? 0;
        y[i * 3 + k] = (x[i * 3 + k] ?? 0) + f * (m / (b - a) - (x[i * 3 + k] ?? 0));
      }
    }
    x = y;
  };
  for (let r = 0; r < rounds; r++) {
    step(0.5);
    step(-0.53);
  }
  const positions = new Float32Array(P.length);
  w.of.forEach((id, v) => {
    for (let a = 0; a < 3; a++) positions[v * 3 + a] = x[id * 3 + a] ?? 0;
  });
  return { ...mesh, positions };
}

/** Faces the move turned by more than ~60° from their original facing (a pinch, a fold-over)
 *  and vertices it creased (their faces now spread more than `crease` degrees about their mean
 *  normal, ≥ 4° more than before) are relaxed with their neighbours, up to `rounds` times,
 *  until none is left; a vertex moves by its `free` share (0 = pinned). `x`: welded world positions after the
 *  move (edited in place); `at`: the part offset. */
export function unfold(
  mesh: Mesh,
  w: Welded,
  at: Vec3,
  x: Float64Array,
  free: Float64Array,
  rounds: number,
  crease = 10,
): void {
  const P = mesh.positions;
  const I = mesh.indices;
  const nt = I.length / 3;
  const normals = (get: (v: number, a: number) => number): Float64Array => {
    const out = new Float64Array(nt * 3);
    for (let f = 0; f < nt; f++) {
      const [a, b, c] = [I[f * 3] ?? 0, I[f * 3 + 1] ?? 0, I[f * 3 + 2] ?? 0];
      const e1 = [0, 1, 2].map((k) => get(b, k) - get(a, k));
      const e2 = [0, 1, 2].map((k) => get(c, k) - get(a, k));
      const n = [
        (e1[1] ?? 0) * (e2[2] ?? 0) - (e1[2] ?? 0) * (e2[1] ?? 0),
        (e1[2] ?? 0) * (e2[0] ?? 0) - (e1[0] ?? 0) * (e2[2] ?? 0),
        (e1[0] ?? 0) * (e2[1] ?? 0) - (e1[1] ?? 0) * (e2[0] ?? 0),
      ];
      const l = Math.hypot(n[0] ?? 0, n[1] ?? 0, n[2] ?? 0) || 1;
      for (let k = 0; k < 3; k++) out[f * 3 + k] = (n[k] ?? 0) / l;
    }
    return out;
  };
  // Faces per welded vertex (CSR).
  const deg = new Int32Array(w.n + 1);
  for (let t = 0; t < I.length; t++) {
    const id = (w.of[I[t] ?? 0] ?? 0) + 1;
    deg[id] = (deg[id] ?? 0) + 1;
  }
  for (let i = 0; i < w.n; i++) deg[i + 1] = (deg[i + 1] ?? 0) + (deg[i] ?? 0);
  const fill = Int32Array.from(deg);
  const faces = new Int32Array(I.length);
  for (let t = 0; t < I.length; t++) {
    const id = w.of[I[t] ?? 0] ?? 0;
    faces[fill[id] ?? 0] = Math.floor(t / 3);
    fill[id] = (fill[id] ?? 0) + 1;
  }
  /** Largest angle (degrees) between a vertex's face normals and their mean. */
  const spread = (N: Float64Array): Float64Array =>
    Float64Array.from({ length: w.n }, (_, i) => {
      const m = [0, 0, 0];
      for (let e = deg[i] ?? 0; e < (deg[i + 1] ?? 0); e++)
        for (let k = 0; k < 3; k++) m[k] = (m[k] ?? 0) + (N[(faces[e] ?? 0) * 3 + k] ?? 0);
      const l = Math.hypot(m[0] ?? 0, m[1] ?? 0, m[2] ?? 0) || 1;
      let worst = 1;
      for (let e = deg[i] ?? 0; e < (deg[i + 1] ?? 0); e++) {
        const f = (faces[e] ?? 0) * 3;
        const d =
          ((N[f] ?? 0) * (m[0] ?? 0) +
            (N[f + 1] ?? 0) * (m[1] ?? 0) +
            (N[f + 2] ?? 0) * (m[2] ?? 0)) /
          l;
        worst = Math.min(worst, d);
      }
      return (Math.acos(Math.max(-1, Math.min(1, worst))) * 180) / Math.PI;
    });
  const N0 = normals((v, k) => (P[v * 3 + k] ?? 0) + (at[k] ?? 0));
  const s0 = spread(N0);
  for (let r = 0; r < rounds; r++) {
    const N1 = normals((v, k) => x[(w.of[v] ?? 0) * 3 + k] ?? 0);
    const s1 = spread(N1);
    const bad = new Uint8Array(w.n);
    let any = false;
    for (let f = 0; f < nt; f++) {
      const d =
        (N0[f * 3] ?? 0) * (N1[f * 3] ?? 0) +
        (N0[f * 3 + 1] ?? 0) * (N1[f * 3 + 1] ?? 0) +
        (N0[f * 3 + 2] ?? 0) * (N1[f * 3 + 2] ?? 0);
      if (d > 0.5) continue;
      any = true;
      for (let e = 0; e < 3; e++) bad[w.of[I[f * 3 + e] ?? 0] ?? 0] = 1;
    }
    for (let i = 0; i < w.n; i++)
      if ((s1[i] ?? 0) > crease && (s1[i] ?? 0) > (s0[i] ?? 0) + 4) {
        bad[i] = 1;
        any = true;
      }
    if (!any) return;
    // Grow the mark one ring, then relax the marked vertices toward their neighbours' mean.
    const grow = Uint8Array.from(bad);
    for (let i = 0; i < w.n; i++)
      if (bad[i])
        for (let e = w.start[i] ?? 0; e < (w.start[i + 1] ?? 0); e++) grow[w.next[e] ?? 0] = 1;
    const y = Float64Array.from(x);
    for (let i = 0; i < w.n; i++) {
      const [a, b] = [w.start[i] ?? 0, w.start[i + 1] ?? 0];
      if (!grow[i] || !((free[i] ?? 0) > 0) || b === a) continue;
      for (let k = 0; k < 3; k++) {
        let m = 0;
        for (let e = a; e < b; e++) m += x[(w.next[e] ?? 0) * 3 + k] ?? 0;
        y[i * 3 + k] =
          (x[i * 3 + k] ?? 0) +
          0.5 * Math.min(1, free[i] ?? 0) * (m / (b - a) - (x[i * 3 + k] ?? 0));
      }
    }
    x.set(y);
  }
}
