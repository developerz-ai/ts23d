// Finish passes for the Tiger: map flat authoring colours onto material-library strips, split
// long triangles so vertex-colour camouflage has room, spray soft-edged three-tone camo, and
// weather (dust on top plates, ragged mud from the ground, soot plumes, heat stain). Pure vertex
// colour / UV work on finished meshes: shape stays in tiger_1.ts.

import {
  DEFAULT_SHEET,
  type Mesh,
  MeshBuilder,
  type Rng,
  type StripId,
  stripAtV,
  stripRect,
  type Vec2,
  type Vec3,
  valueNoise,
} from '@developerz.ai/ts23d';

/**
 * Rest a track belt on z = 0: links rounding the end wheels can dip a corner below the ground
 * (clamped) and thin links can hover a few mm above it (lowered), so contact is exact at every LOD.
 */
export function onGround(m: Mesh): Mesh {
  const positions = new Float32Array(m.positions);
  let low = Infinity;
  for (let i = 2; i < positions.length; i += 3) {
    positions[i] = Math.max(0, positions[i] ?? 0);
    low = Math.min(low, positions[i] ?? 0);
  }
  if (low > 0 && low < 0.02)
    for (let i = 2; i < positions.length; i += 3) positions[i] = (positions[i] ?? 0) - low;
  return { ...m, positions };
}

/** One authoring colour → a strip and the vertex colour that strip wants (paint or NATURAL). */
export interface StripRule {
  readonly from: Vec3;
  readonly strip: StripId;
  readonly color?: Vec3;
}

const same = (m: Mesh, i: number, c: Vec3): boolean =>
  [0, 1, 2].every((k) => Math.abs((m.colors[i * 3 + k] ?? 0) - (c[k] ?? 0)) < 1e-4);

/**
 * Move every vertex whose colour matches a rule onto that rule's strip row (V shifted row to row,
 * U rescaled to the new strip's span), so primitives authored with flat colours pick up real
 * materials without threading `strip` through every call.
 */
export function restrip(m: Mesh, rules: readonly StripRule[]): Mesh {
  const uvs = new Float32Array(m.uvs);
  const colors = new Float32Array(m.colors);
  const plain = stripRect('plain');
  const rowH = plain.v1 - plain.v0;
  for (let i = 0; i < m.positions.length / 3; i++) {
    const rule = rules.find((r) => same(m, i, r.from));
    if (!rule) continue;
    const v = uvs[i * 2 + 1] ?? 0;
    const row = Math.floor(v / rowH);
    const frac = v - row * rowH;
    const to = stripRect(rule.strip);
    // Source strips here are classic/plain (4 m span); U is in sheet fractions of that span.
    uvs[i * 2] = to.u0 + ((uvs[i * 2] ?? 0) * 4) / to.metres;
    uvs[i * 2 + 1] = to.v0 + frac;
    if (rule.color) colors.set(rule.color, i * 3);
  }
  return { ...m, uvs, colors };
}

/**
 * Re-map UVs at true scale by box projection per triangle (the face normal's dominant axis). V
 * starts at the triangle's own lowest point and is squeezed only when the triangle is taller than
 * one band, so V never wraps or folds inside a triangle (which draws contour-line chevrons). Needs
 * unwelded triangles (as `tessellate` emits). Keeps each vertex's strip.
 */
export function reproject(m: Mesh): Mesh {
  const uvs = new Float32Array(m.uvs);
  const half = 0.5 / 4096;
  const P = m.positions;
  const at = (i: number, k: number): number => P[i * 3 + k] ?? 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const ids = [m.indices[t] ?? 0, m.indices[t + 1] ?? 0, m.indices[t + 2] ?? 0];
    const [a = 0, b = 0, c = 0] = ids;
    const e1 = [0, 1, 2].map((k) => at(b, k) - at(a, k));
    const e2 = [0, 1, 2].map((k) => at(c, k) - at(a, k));
    const n = [
      Math.abs((e1[1] ?? 0) * (e2[2] ?? 0) - (e1[2] ?? 0) * (e2[1] ?? 0)),
      Math.abs((e1[2] ?? 0) * (e2[0] ?? 0) - (e1[0] ?? 0) * (e2[2] ?? 0)),
      Math.abs((e1[0] ?? 0) * (e2[1] ?? 0) - (e1[1] ?? 0) * (e2[0] ?? 0)),
    ];
    const [nx = 0, ny = 0, nz = 0] = n;
    const [ku, kv] = nz >= Math.max(nx, ny) ? [0, 1] : nx >= ny ? [1, 2] : [0, 2];
    const id = stripAtV(m.uvs[a * 2 + 1] ?? 0);
    if (id === 'custom' || id === 'cell') continue;
    const r = stripRect(id);
    const vm = DEFAULT_SHEET.strips[id]?.scaleMetres ?? 1;
    const vs = ids.map((i) => at(i, kv));
    const lo = Math.min(...vs);
    const base = Math.floor(lo / vm) * vm;
    const span = Math.max(...vs) - base;
    const k = span > vm ? vm / span : 1;
    for (const i of ids) {
      const f = ((at(i, kv) - base) / vm) * k;
      uvs[i * 2] = r.u0 + (at(i, ku) / r.metres) * (r.u1 - r.u0);
      uvs[i * 2 + 1] = r.v0 + half + Math.min(1, f) * (r.v1 - r.v0 - 2 * half);
    }
  }
  return { ...m, uvs };
}

/** Split long edges until every triangle is under `max` metres, so vertex-colour camo has room. */
export function tessellate(m: Mesh, max: number): Mesh {
  const b = new MeshBuilder();
  type V = { p: Vec3; n: Vec3; uv: Vec2; color: Vec3 };
  const read = (i: number): V => ({
    p: [m.positions[i * 3] ?? 0, m.positions[i * 3 + 1] ?? 0, m.positions[i * 3 + 2] ?? 0],
    n: [m.normals[i * 3] ?? 0, m.normals[i * 3 + 1] ?? 0, m.normals[i * 3 + 2] ?? 1],
    uv: [m.uvs[i * 2] ?? 0, m.uvs[i * 2 + 1] ?? 0],
    color: [m.colors[i * 3] ?? 0, m.colors[i * 3 + 1] ?? 0, m.colors[i * 3 + 2] ?? 0],
  });
  const mid = (x: V, y: V): V => ({
    p: [(x.p[0] + y.p[0]) / 2, (x.p[1] + y.p[1]) / 2, (x.p[2] + y.p[2]) / 2],
    n: x.n,
    uv: [(x.uv[0] + y.uv[0]) / 2, (x.uv[1] + y.uv[1]) / 2],
    color: x.color,
  });
  const d = (x: V, y: V): number => Math.hypot(x.p[0] - y.p[0], x.p[1] - y.p[1], x.p[2] - y.p[2]);
  const split = (x: V, y: V, z: V): void => {
    const [e0, e1, e2] = [d(x, y), d(y, z), d(z, x)];
    const top = Math.max(e0, e1, e2);
    if (top <= max) {
      b.tri(b.vertex(x), b.vertex(y), b.vertex(z));
      return;
    }
    if (top === e0) {
      const q = mid(x, y);
      split(x, q, z);
      split(q, y, z);
    } else if (top === e1) {
      const q = mid(y, z);
      split(x, y, q);
      split(x, q, z);
    } else {
      const q = mid(z, x);
      split(x, y, q);
      split(q, y, z);
    }
  };
  for (let t = 0; t < m.indices.length; t += 3)
    split(read(m.indices[t] ?? 0), read(m.indices[t + 1] ?? 0), read(m.indices[t + 2] ?? 0));
  return b.build();
}

export interface Blob {
  readonly c: Vec3;
  readonly r: Vec3;
  readonly color: Vec3;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Sprayed camouflage over the base paint only: ellipsoid blobs whose edge is a soft overspray
 * band, wobbled by noise so it does not read as a geometric ellipse.
 */
export function camo(
  m: Mesh,
  base: Vec3,
  blobs: readonly Blob[],
  wobble: (p: Vec3) => number,
  at: Vec3 = [0, 0, 0],
): Mesh {
  const colors = new Float32Array(m.colors);
  for (let i = 0; i < m.positions.length / 3; i++) {
    if (!same(m, i, base)) continue;
    const p: Vec3 = [
      (m.positions[i * 3] ?? 0) + at[0],
      (m.positions[i * 3 + 1] ?? 0) + at[1],
      (m.positions[i * 3 + 2] ?? 0) + at[2],
    ];
    const n = wobble(p) * 0.22;
    for (const b of blobs) {
      const d =
        Math.hypot((p[0] - b.c[0]) / b.r[0], (p[1] - b.c[1]) / b.r[1], (p[2] - b.c[2]) / b.r[2]) +
        n;
      if (d >= 1.05) continue;
      const w = 1 - smooth(0.55, 1.05, d);
      for (let k = 0; k < 3; k++)
        colors[i * 3 + k] = (colors[i * 3 + k] ?? 0) * (1 - w) + (b.color[k] ?? 0) * w;
    }
  }
  return { ...m, colors };
}

export interface Soot {
  readonly at: Vec3;
  /** Plume radius (m); the plume rises (+Z) and trails back (−X) from `at`. */
  readonly radius: number;
  readonly strength: number;
}

export interface WeatheringOptions {
  /** World offset of a part authored around its pivot. */
  readonly at?: Vec3;
  /** Dust on upward faces (0..1). */
  readonly dust?: number;
  /** Mud rises to this height (m), with a ragged edge. */
  readonly mud?: number;
  readonly mudStrength?: number;
  readonly soot?: readonly Soot[];
}

const DUST: Vec3 = [0.5, 0.44, 0.33];
const MUD: Vec3 = [0.028, 0.02, 0.012];
const SOOT: Vec3 = [0.05, 0.045, 0.04];

/** A weathering pass with its own seeded noise (scale ≈ 0.4 m blotches). */
export function weatherer(rng: Rng): (m: Mesh, o: WeatheringOptions) => Mesh {
  const noise = valueNoise(rng, { scale: 0.35, octaves: 3 });
  return (m, o) => {
    const at = o.at ?? [0, 0, 0];
    const colors = new Float32Array(m.colors);
    for (let i = 0; i < m.positions.length / 3; i++) {
      const p: Vec3 = [
        (m.positions[i * 3] ?? 0) + at[0],
        (m.positions[i * 3 + 1] ?? 0) + at[1],
        (m.positions[i * 3 + 2] ?? 0) + at[2],
      ];
      const nz = m.normals[i * 3 + 2] ?? 0;
      const nv = noise(p);
      let c: Vec3 = [colors[i * 3] ?? 0, colors[i * 3 + 1] ?? 0, colors[i * 3 + 2] ?? 0];
      const mix = (to: Vec3, w: number): void => {
        const k = Math.min(1, Math.max(0, w));
        c = [c[0] + (to[0] - c[0]) * k, c[1] + (to[1] - c[1]) * k, c[2] + (to[2] - c[2]) * k];
      };
      if (o.dust && nz > 0.4) mix(DUST, o.dust * smooth(0.4, 0.9, nz) * (0.55 + 0.45 * nv));
      if (o.mud) {
        const edge = o.mud * (1 + 0.35 * nv) - p[2];
        // Rear splash runs higher (tracks throw mud backwards).
        const rear = p[0] < 0 ? 1 + Math.min(0.4, -p[0] * 0.08) : 1;
        mix(MUD, (o.mudStrength ?? 0.7) * smooth(0, 0.35 * rear, edge * rear));
      }
      for (const s of o.soot ?? []) {
        const dx = (p[0] - s.at[0]) * (p[0] < s.at[0] ? 0.6 : 1.4);
        const dz = (p[2] - s.at[2]) * (p[2] > s.at[2] ? 0.7 : 1.6);
        const d = Math.hypot(dx, p[1] - s.at[1], dz) / s.radius;
        if (d < 1) mix(SOOT, s.strength * (1 - smooth(0.2, 1, d + 0.2 * nv)));
      }
      colors.set(c, i * 3);
    }
    return { ...m, colors };
  };
}
