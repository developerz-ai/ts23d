// The critique metric vector: a dozen measured numbers per asset that the calibrated score is
// fitted on (critique-calibrate.ts). Mesh stats (shading continuity, curvature histogram, colour
// detail, colour samples per metre) come from LOD0; image stats (chroma, value key and range,
// high-frequency energy, rest share, silhouette roughness) from one fixed-size beauty render the
// caller makes (render sits beside qa). Same asset + same render → same numbers.

import type { CompiledAsset, Mesh } from '../core/index.ts';

/** The render every vector is measured on (golden set, CLI and gate alike). */
export const VECTOR_RENDER = { width: 640, height: 360, supersample: 1 } as const;

/** Metric names, fixed order: the calibration's feature columns. */
export const METRICS = [
  'tris',
  'smoothShading',
  'curvSmooth',
  'curvEntropy',
  'colourDetail',
  'texelDensity',
  'chroma',
  'valueRange',
  'valueKey',
  'hiFreq',
  'restShare',
  'silhouetteRoughness',
] as const;

export type Metric = (typeof METRICS)[number];
export type MetricVector = Readonly<Record<Metric, number>>;

export interface VectorImage {
  readonly width: number;
  readonly height: number;
  /** RGBA8 sRGB. */
  readonly rgba: Uint8Array;
  /** Asset coverage 0–255 per pixel. */
  readonly mask: Uint8Array;
}

const r4 = (v: number): number => Math.round(v * 1e4) / 1e4;

/** The metric vector of one compiled LOD0 and its VECTOR_RENDER beauty image. */
export function metricVector(lod0: CompiledAsset, image: VectorImage): MetricVector {
  const meshes = lod0.parts.flatMap((p) => (p.mesh?.indices.length ? [p.mesh] : []));
  const m = meshStats(meshes);
  const i = imageStats(image);
  const out: Record<Metric, number> = { ...m, ...i };
  for (const k of METRICS) out[k] = r4(Number.isFinite(out[k]) ? out[k] : 0);
  return out;
}

type MeshMetric = 'tris' | 'smoothShading' | 'curvSmooth' | 'curvEntropy';
type MeshStats = Record<MeshMetric | 'colourDetail' | 'texelDensity', number>;

/** Dihedral-angle bin edges, degrees (the curvature histogram). */
const BINS = [2, 5, 10, 20, 40, 70, 110, 181];

export function meshStats(meshes: readonly Mesh[]): MeshStats {
  let tris = 0;
  let welded = 0;
  let area = 0;
  let smooth = 0;
  let edgeLen = 0;
  let colour = 0;
  const hist = new Float64Array(BINS.length);
  for (const m of meshes) {
    const w = weld(m);
    tris += m.indices.length / 3;
    welded += w.count;
    const faces: Map<number, number[]> = new Map();
    const normalsAt: number[][] = Array.from({ length: w.count }, () => []);
    for (let v = 0; v < m.positions.length / 3; v++) normalsAt[w.id[v] ?? 0]?.push(v);
    for (const vs of normalsAt) if (consistent(m, vs)) smooth++;
    for (let t = 0; t < m.indices.length; t += 3) {
      const [a, b, c] = [m.indices[t] ?? 0, m.indices[t + 1] ?? 0, m.indices[t + 2] ?? 0];
      const n = faceNormal(m, a, b, c);
      area += n[3];
      for (const [p, q] of [
        [a, b],
        [b, c],
        [c, a],
      ] as const) {
        const [i, j] = [w.id[p] ?? 0, w.id[q] ?? 0];
        if (i === j) continue;
        const key = Math.min(i, j) * w.count + Math.max(i, j);
        const len = dist(m, p, q);
        const seen = faces.get(key);
        if (!seen) {
          faces.set(key, [n[0], n[1], n[2], len]);
          let d = 0;
          for (let k = 0; k < 3; k++)
            d += Math.abs((m.colors[p * 3 + k] ?? 1) - (m.colors[q * 3 + k] ?? 1));
          colour += (d / 3) * len;
          edgeLen += len;
        } else if (seen.length === 4) {
          const cos = n[0] * (seen[0] ?? 0) + n[1] * (seen[1] ?? 0) + n[2] * (seen[2] ?? 0);
          const deg = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
          const bin = BINS.findIndex((e) => deg < e);
          hist[bin] = (hist[bin] ?? 0) + len;
          seen.push(0);
        }
      }
    }
  }
  const total = hist.reduce((s, h) => s + h, 0) || 1;
  let entropy = 0;
  for (const h of hist) if (h > 0) entropy -= (h / total) * Math.log(h / total);
  return {
    tris: Math.log10(1 + tris),
    smoothShading: welded ? smooth / welded : 0,
    curvSmooth: ((hist[0] ?? 0) + (hist[1] ?? 0) + (hist[2] ?? 0)) / total,
    curvEntropy: entropy / Math.log(BINS.length),
    colourDetail: edgeLen ? colour / edgeLen : 0,
    texelDensity: area > 0 ? Math.log10(Math.sqrt(welded / area)) : 0,
  };
}

/** Welded vertex ids: one id per distinct position (1e-6 of the bounding diagonal). */
function weld(m: Mesh): { id: Uint32Array; count: number } {
  const n = m.positions.length / 3;
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const v of m.positions) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const eps = Math.max((hi - lo) * 1e-6, 1e-9);
  const ids = new Map<string, number>();
  const id = new Uint32Array(n);
  for (let v = 0; v < n; v++) {
    const key = [0, 1, 2].map((k) => Math.round((m.positions[v * 3 + k] ?? 0) / eps)).join(',');
    let i = ids.get(key);
    if (i === undefined) {
      i = ids.size;
      ids.set(key, i);
    }
    id[v] = i;
  }
  return { id, count: ids.size };
}

/** Every normal at one welded position agrees (cos ≥ 0.97): smooth shading there. */
function consistent(m: Mesh, vs: readonly number[]): boolean {
  const f = vs[0];
  if (f === undefined) return true;
  for (const v of vs) {
    let d = 0;
    for (let k = 0; k < 3; k++) d += (m.normals[f * 3 + k] ?? 0) * (m.normals[v * 3 + k] ?? 0);
    if (d < 0.97) return false;
  }
  return true;
}

/** Unit face normal and area. */
function faceNormal(m: Mesh, a: number, b: number, c: number): [number, number, number, number] {
  const P = m.positions;
  const u = [0, 1, 2].map((k) => (P[b * 3 + k] ?? 0) - (P[a * 3 + k] ?? 0));
  const v = [0, 1, 2].map((k) => (P[c * 3 + k] ?? 0) - (P[a * 3 + k] ?? 0));
  const [u0 = 0, u1 = 0, u2 = 0] = u;
  const [v0 = 0, v1 = 0, v2 = 0] = v;
  const n = [u1 * v2 - u2 * v1, u2 * v0 - u0 * v2, u0 * v1 - u1 * v0];
  const l = Math.hypot(n[0] ?? 0, n[1] ?? 0, n[2] ?? 0) || 1;
  return [(n[0] ?? 0) / l, (n[1] ?? 0) / l, (n[2] ?? 0) / l, l / 2];
}

const dist = (m: Mesh, p: number, q: number): number =>
  Math.hypot(
    (m.positions[p * 3] ?? 0) - (m.positions[q * 3] ?? 0),
    (m.positions[p * 3 + 1] ?? 0) - (m.positions[q * 3 + 1] ?? 0),
    (m.positions[p * 3 + 2] ?? 0) - (m.positions[q * 3 + 2] ?? 0),
  );

type ImageMetric = 'chroma' | 'valueRange' | 'valueKey' | 'hiFreq' | 'restShare';
type ImageStats = Record<ImageMetric | 'silhouetteRoughness', number>;

/** Pixel statistics inside the asset's coverage mask. */
export function imageStats(img: VectorImage): ImageStats {
  const { width: W, height: H, rgba, mask } = img;
  const lum = new Float32Array(W * H);
  const lums: number[] = [];
  let chroma = 0;
  for (let p = 0; p < W * H; p++) {
    const [r = 0, g = 0, b = 0] = [rgba[p * 4], rgba[p * 4 + 1], rgba[p * 4 + 2]];
    lum[p] = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if ((mask[p] ?? 0) < 128) continue;
    lums.push(lum[p] ?? 0);
    chroma += (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
  }
  const covered = lums.length;
  if (covered === 0)
    return {
      chroma: 0,
      valueRange: 0,
      valueKey: 0,
      hiFreq: 0,
      restShare: 0,
      silhouetteRoughness: 0,
    };
  lums.sort((a, b) => a - b);
  const q = (f: number): number => lums[Math.min(covered - 1, Math.floor(f * covered))] ?? 0;
  const inside = (x: number, y: number, r: number): boolean => {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) if ((mask[(y + dy) * W + x + dx] ?? 0) < 250) return false;
    return true;
  };
  let lap = 0;
  let calm = 0;
  let interior = 0;
  for (let y = 2; y < H - 2; y++)
    for (let x = 2; x < W - 2; x++) {
      if (!inside(x, y, 2)) continue;
      const at = (dx: number, dy: number): number => lum[(y + dy) * W + x + dx] ?? 0;
      interior++;
      lap += Math.abs(4 * at(0, 0) - at(-1, 0) - at(1, 0) - at(0, -1) - at(0, 1));
      let s = 0;
      let s2 = 0;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          s += at(dx, dy);
          s2 += at(dx, dy) ** 2;
        }
      if (Math.sqrt(Math.max(0, s2 / 25 - (s / 25) ** 2)) < 0.02) calm++;
    }
  return {
    chroma: chroma / covered,
    valueRange: q(0.95) - q(0.05),
    valueKey: lums.reduce((s, v) => s + v, 0) / covered,
    hiFreq: interior ? lap / interior : 0,
    restShare: interior ? calm / interior : 0,
    silhouetteRoughness: roughness(mask, W, H),
  };
}

/** Outline length over the outline of its 5×5-smoothed self, minus 1: jagged / faceted edges. */
function roughness(mask: Uint8Array, W: number, H: number): number {
  const solid = (m: (i: number) => boolean): number => {
    let edge = 0;
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (m(i) && (!m(i - 1) || !m(i + 1) || !m(i - W) || !m(i + W))) edge++;
      }
    return edge;
  };
  const raw = solid((i) => (mask[i] ?? 0) >= 128);
  const sm = new Uint8Array(W * H);
  for (let y = 2; y < H - 2; y++)
    for (let x = 2; x < W - 2; x++) {
      let n = 0;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) if ((mask[(y + dy) * W + x + dx] ?? 0) >= 128) n++;
      sm[y * W + x] = n >= 13 ? 1 : 0;
    }
  const smooth = solid((i) => sm[i] === 1);
  return smooth ? raw / smooth - 1 : 0;
}
