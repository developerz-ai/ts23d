// The stand-in "scan": what a head scan or a CC0 MakeHuman/MPFB export looks like when it reaches
// ts23d — a dense skin surface (the CC0 hm08 head, ./scan-head.ts) with vertex colour, its OWN
// lat-long UV layout and a pore-detail PNG, ±0.2 mm scanner noise, and the defects real scans
// have (a hole, flipped and duplicated faces, floating specks). Written to GLB in glTF's frame
// (Y up, +Z front) by our plain-mesh writer, so `importGlb` has a real file to read. CC0.
// Deterministic; built once per process. Swap in a real file: see ./README.md.

import { type Mesh, type Vec3, writeMeshGlb } from '@developerz.ai/ts23d';
import { storedPng } from './png-stored.ts';
import { poreTexture } from './scan-albedo.ts';
import { headCentre, sitterSkin } from './scan-head.ts';

/** Deterministic hash noise in −1..1. */
export function hash(i: number, j: number, k = 0): number {
  let h = (i * 374761393 + j * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

/** Referenced vertices only, lat-long UVs about the head centre (seam at the back, split). */
function layout(m: Mesh): Mesh {
  const c = headCentre();
  const uvOf = (i: number): [number, number] => {
    const d = [0, 1, 2].map((k) => (m.positions[i * 3 + k] ?? 0) - (c[k] ?? 0));
    const l = Math.hypot(d[0] ?? 0, d[1] ?? 0, d[2] ?? 0) || 1;
    return [
      Math.atan2(d[1] ?? 0, d[0] ?? 0) / (2 * Math.PI) + 0.5,
      Math.acos(Math.max(-1, Math.min(1, (d[2] ?? 0) / l))) / Math.PI,
    ];
  };
  const P: number[] = [];
  const N: number[] = [];
  const U: number[] = [];
  const C: number[] = [];
  const idx: number[] = [];
  const ids = new Map<string, number>();
  const at = (i: number, wrap: boolean): number => {
    const key = `${i}${wrap ? 'w' : ''}`;
    const hit = ids.get(key);
    if (hit !== undefined) return hit;
    const [u, v] = uvOf(i);
    const g = 0.0002 * hash(i, 7);
    for (let k = 0; k < 3; k++) {
      P.push((m.positions[i * 3 + k] ?? 0) + (m.normals[i * 3 + k] ?? 0) * g);
      N.push(m.normals[i * 3 + k] ?? 0);
      C.push(m.colors[i * 3 + k] ?? 1);
    }
    U.push(wrap && u < 0.5 ? u + 1 : u, v);
    ids.set(key, ids.size);
    return ids.size - 1;
  };
  for (let t = 0; t < m.indices.length; t += 3) {
    const tri = [m.indices[t] ?? 0, m.indices[t + 1] ?? 0, m.indices[t + 2] ?? 0];
    const us = tri.map((i) => uvOf(i)[0]);
    const wrap = Math.max(...us) - Math.min(...us) > 0.5;
    for (const i of tri) idx.push(at(i, wrap));
  }
  return {
    positions: Float32Array.from(P),
    normals: Float32Array.from(N),
    uvs: Float32Array.from(U),
    colors: Float32Array.from(C),
    indices: Uint32Array.from(idx),
  };
}

/** Scan defects: a hole on the crown, some faces flipped or doubled, three specks of debris. */
function defects(m: Mesh): Mesh {
  const tris = m.indices.length / 3;
  const z = (t: number): number =>
    [0, 1, 2].reduce((s, k) => s + (m.positions[(m.indices[t * 3 + k] ?? 0) * 3 + 2] ?? 0), 0) / 3;
  let top = 0;
  for (let t = 1; t < tris; t++) if (z(t) > z(top)) top = t;
  const pair = top % 2 === 0 ? top + 1 : top - 1; // quadToMesh writes quads as triangle pairs
  const out: number[] = [];
  for (let t = 0; t < tris; t++) {
    if (t === top || t === pair) continue;
    const [a, b, c] = [m.indices[t * 3] ?? 0, m.indices[t * 3 + 1] ?? 0, m.indices[t * 3 + 2] ?? 0];
    out.push(...(t % 4001 === 17 ? [a, c, b] : [a, b, c]));
    if (t % 5003 === 29) out.push(a, b, c);
  }
  const P = [...m.positions];
  const base = P.length / 3;
  const extra = { N: [...m.normals], U: [...m.uvs], C: [...m.colors] };
  for (let s = 0; s < 3; s++) {
    const c: Vec3 = [0.12, 0.05 * (s - 1), 0.27 + 0.01 * s];
    for (let k = 0; k < 4; k++) {
      P.push(
        c[0] + (k === 1 ? 0.003 : 0),
        c[1] + (k === 2 ? 0.003 : 0),
        c[2] + (k === 3 ? 0.003 : 0),
      );
      extra.N.push(1, 0, 0);
      extra.U.push(0.99, 0.99);
      extra.C.push(0.5, 0.5, 0.5);
    }
    const o = base + s * 4;
    out.push(o, o + 2, o + 1, o, o + 1, o + 3, o, o + 3, o + 2, o + 1, o + 2, o + 3);
  }
  return {
    positions: Float32Array.from(P),
    normals: Float32Array.from(extra.N),
    uvs: Float32Array.from(extra.U),
    colors: Float32Array.from(extra.C),
    indices: Uint32Array.from(out),
  };
}

/** ts23d frame → glTF frame: (x, y, z) → (y, z, x). */
function toGltf(m: Mesh): Mesh {
  const turn = (a: Float32Array): Float32Array => {
    const out = new Float32Array(a.length);
    for (let i = 0; i < a.length; i += 3) {
      out[i] = a[i + 1] ?? 0;
      out[i + 1] = a[i + 2] ?? 0;
      out[i + 2] = a[i] ?? 0;
    }
    return out;
  };
  return { ...m, positions: turn(m.positions), normals: turn(m.normals) };
}

let built: Uint8Array | null = null;

/** The stand-in scan as GLB bytes (memoised: the three LOD compiles read one file). */
export function scanGlb(): Uint8Array {
  if (built) return built;
  const tex = poreTexture(512, 256);
  built = writeMeshGlb(
    [
      {
        name: 'scan_head',
        mesh: toGltf(defects(layout(sitterSkin()))),
        png: storedPng(tex.width, tex.height, tex.data),
      },
    ],
    {
      source:
        'ts23d recipes/import_demo/scan.ts: stand-in head scan from the MakeHuman hm08 base mesh (CC0-1.0)',
    },
  );
  return built;
}
