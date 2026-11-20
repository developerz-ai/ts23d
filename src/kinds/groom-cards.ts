// Cards from the Blender groom task into ts23d: the returned GLB (glTF frame; one node per strand
// kind, `groom_hair` / `groom_wisp`; every card a connected strip with UV.u across and UV.v root
// → tip) is turned to the ts23d frame, each card mapped into a seeded cell of the shared
// `hair_clumps` strand strip (atlas U = root → tip, atlas V = across, as hairCards lays them),
// coloured root → tip like today's cards, and validated before use: under the triangle cap,
// every root on the scalp, nothing past the root inside the head (no lock through the face).
// Bytes from a tool are untrusted: every refusal is T3D_NEURAL_OUTPUT_INVALID with a fix.

import { dmath, type Mesh, MeshBuilder, type Rng, Ts23dError, type Vec3 } from '../core/index.ts';
import { CREATURE_MATERIALS, defineMaterial, strandCells, type UvRect } from '../material/index.ts';
import { readGlb, scenePrimitives } from '../neural/index.ts';
import { reframe } from './groom-guides.ts';
import type { GroomField } from './groom-ops.ts';

export interface GroomCardOptions {
  /** Hair colour (× tone along the card). */
  readonly color: Vec3;
  /** Tone at root and tip (default [0.7, 1.1]). */
  readonly tone?: readonly [number, number];
  /** Colour multiplier reached at the tip (default none). */
  readonly tint?: Vec3;
  /** The surface the roots grow from (negative inside): every root within `rootTolerance`. */
  readonly scalp: GroomField;
  /** The head and torso (negative inside): no card point past its first fifth may be inside. */
  readonly collide?: GroomField;
  /** Default 8 mm (roots are buried a few mm). */
  readonly rootTolerance?: number;
  readonly maxTriangles: number;
  /** Centre of the hair mass: card normals lean away from it so the mass shades as one. */
  readonly centre: Vec3;
  readonly rng: Rng;
}

export interface GroomCards {
  readonly mesh: Mesh;
  readonly cards: number;
  readonly triangles: number;
}

const bad = (cause: string, fix: string): never => {
  throw new Ts23dError('T3D_NEURAL_OUTPUT_INVALID', { cause: `groom: ${cause}`, fix });
};

/** Connected components of a triangle list (union-find over shared vertex indices). */
function components(idx: Uint32Array, n: number): Int32Array {
  const up = Int32Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while ((up[r] ?? r) !== r) r = up[r] ?? r;
    while ((up[i] ?? i) !== r) [up[i], i] = [r, up[i] ?? i];
    return r;
  };
  for (let t = 0; t < idx.length; t += 3) {
    const a = find(idx[t] ?? 0);
    for (let k = 1; k < 3; k++) {
      const b = find(idx[t + k] ?? 0);
      if (a !== b) up[Math.max(a, b)] = Math.min(a, b);
    }
  }
  return Int32Array.from({ length: n }, (_, i) => find(i));
}

/** Does triangle a-b-c (counter-clockwise) face the way its vertex normals point? */
function facing(m: Mesh, a: number, b: number, c: number): boolean {
  const P = (i: number, k: number): number => m.positions[i * 3 + k] ?? 0;
  const e1 = [0, 1, 2].map((k) => P(b, k) - P(a, k));
  const e2 = [0, 1, 2].map((k) => P(c, k) - P(a, k));
  const n = [
    (e1[1] ?? 0) * (e2[2] ?? 0) - (e1[2] ?? 0) * (e2[1] ?? 0),
    (e1[2] ?? 0) * (e2[0] ?? 0) - (e1[0] ?? 0) * (e2[2] ?? 0),
    (e1[0] ?? 0) * (e2[1] ?? 0) - (e1[1] ?? 0) * (e2[0] ?? 0),
  ];
  let d = 0;
  for (const i of [a, b, c])
    for (let k = 0; k < 3; k++) d += (n[k] ?? 0) * (m.normals[i * 3 + k] ?? 0);
  return d >= 0;
}

const unit = (v: Vec3): Vec3 => {
  const l = dmath.norm(v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** The groom GLB as one `hair_clumps` cutout mesh (ts23d frame); throws on a bad output. */
export function groomCards(glb: Uint8Array, o: GroomCardOptions): GroomCards {
  defineMaterial(CREATURE_MATERIALS.hair_clumps);
  const prims = scenePrimitives(readGlb(glb));
  const tris = prims.reduce((s, p) => s + p.mesh.indices.length / 3, 0);
  if (tris === 0) bad('the GLB has no cards', 'check the groom guides reach the scalp');
  if (tris > o.maxTriangles)
    bad(`${tris} triangles, cap ${o.maxTriangles}`, 'ask for fewer cards or points per card');
  const tone = o.tone ?? [0.7, 1.1];
  const tint = o.tint ?? [1, 1, 1];
  const tol = o.rootTolerance ?? 0.008;
  const b = new MeshBuilder();
  let cards = 0;
  for (const prim of prims) {
    const kind = /wisp/.test(prim.name) ? 'wisp' : 'hair';
    const cells = strandCells('hair_clumps', kind);
    const m = prim.mesh;
    const pos = reframe(m.positions, false);
    const nrm = reframe(m.normals, false);
    const n = pos.length / 3;
    const comp = components(m.indices, n);
    const P = (i: number): Vec3 => [pos[i * 3] ?? 0, pos[i * 3 + 1] ?? 0, pos[i * 3 + 2] ?? 0];
    const V = (i: number): number => m.uvs[i * 2 + 1] ?? 0;
    // Per card: its atlas cell, value jitter, root centre (vertices at v ≈ 0) and a checked line.
    const groups = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const c = comp[i] ?? 0;
      const g = groups.get(c);
      if (g) g.push(i);
      else groups.set(c, [i]);
    }
    const card = new Map<number, { cell: UvRect; vary: number }>();
    for (const [c, verts] of [...groups].sort((x, y) => x[0] - y[0])) {
      const root = verts.filter((i) => V(i) < 0.02);
      if (root.length === 0)
        bad(`card ${cards} has no root row (UV.v = 0)`, 'export UV.v root → tip');
      const r: Vec3 = root.reduce<Vec3>(
        (s, i) => {
          const p = P(i);
          return [s[0] + p[0] / root.length, s[1] + p[1] / root.length, s[2] + p[2] / root.length];
        },
        [0, 0, 0],
      );
      const d = o.scalp(r);
      if (Math.abs(d) > tol)
        bad(
          `card ${cards} roots ${(d * 1000).toFixed(1)} mm off the scalp at [${r.map((x) => x.toFixed(3))}]`,
          'grow children on the scalp mesh sent with the job (attach roots to it)',
        );
      if (o.collide)
        for (const i of verts)
          if (V(i) > 0.2 && o.collide(P(i)) < -0.002)
            bad(
              `card ${cards} passes ${(-(o.collide(P(i)) * 1000)).toFixed(1)} mm inside the head at [${P(i).map((x) => x.toFixed(3))}]`,
              'collide the strands with the head (shrinkwrap / push-out) before making cards',
            );
      const cell = cells[Math.floor(o.rng.next() * cells.length)] ?? cells[0];
      if (cell) card.set(c, { cell, vary: 1 + 0.12 * (o.rng.next() * 2 - 1) });
      cards++;
    }
    const remap = new Int32Array(n).fill(-1);
    for (let i = 0; i < n; i++) {
      const c = card.get(comp[i] ?? 0);
      if (!c) continue;
      const s = Math.min(1, Math.max(0, V(i)));
      const u = Math.min(1, Math.max(0, m.uvs[i * 2] ?? 0));
      const p = P(i);
      // Shade mostly as one mass (away from its centre), never past the card's own side.
      const own = unit([nrm[i * 3] ?? 0, nrm[i * 3 + 1] ?? 0, nrm[i * 3 + 2] ?? 1]);
      const out = unit([p[0] - o.centre[0], p[1] - o.centre[1], p[2] - o.centre[2]]);
      const side = own[0] * out[0] + own[1] * out[1] + own[2] * out[2] < 0 ? -1 : 1;
      const nn = unit([
        out[0] * 0.6 + own[0] * side * 0.4,
        out[1] * 0.6 + own[1] * side * 0.4,
        out[2] * 0.6 + own[2] * side * 0.4,
      ]);
      const g = (tone[0] + (tone[1] - tone[0]) * s) * c.vary;
      const hue = (k: 0 | 1 | 2): number => o.color[k] * g * (1 + (tint[k] - 1) * s);
      const col: Vec3 = [hue(0), hue(1), hue(2)];
      remap[i] = b.vertex({
        p,
        n: nn,
        uv: [c.cell.u0 + s * (c.cell.u1 - c.cell.u0), c.cell.v0 + u * (c.cell.v1 - c.cell.v0)],
        color: col,
      });
    }
    // The tool's winding is arbitrary per card; the shading normals lean outward, so wind each
    // triangle to face the way its vertex normals do (else QA normals-winding refuses it).
    const out = b.build();
    for (let t = 0; t < m.indices.length; t += 3) {
      const [a, c, d] = [0, 1, 2].map((k) => remap[m.indices[t + k] ?? 0] ?? 0) as [
        number,
        number,
        number,
      ];
      b.tri(...(facing(out, a, c, d) ? ([a, c, d] as const) : ([a, d, c] as const)));
    }
  }
  return { mesh: b.build(), cards, triangles: tris };
}
