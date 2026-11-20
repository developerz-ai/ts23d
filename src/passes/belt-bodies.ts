// Splits a track belt's mesh into the bodies that ride its loop: every connected piece no longer
// than the link pitch is one RIGID body (a link plate, a guide horn, a grouser), and each vertex of
// a longer piece (a continuous rubber band, a far-LOD slab) is its own body, so it bends with the
// loop. Also the spatial hash the twin search of belt-run.ts looks vertices up in.

/** What a belt binder reads of a mesh. */
import { dmath } from '../core/index.ts';

export interface BeltMesh {
  readonly positions: ArrayLike<number>;
  readonly normals: ArrayLike<number>;
  readonly indices: ArrayLike<number>;
}

export interface BeltBody {
  /** Its vertices. */
  readonly verts: readonly number[];
  /** Mean of its distinct vertex positions (the same point however the mesh was welded). */
  readonly centre: readonly [number, number, number];
  /** One vertex of a bending piece: only its position rides the loop. */
  readonly rigid: boolean;
}

/** Positions closer than this are one point (metres). */
const WELD = 1e-5;

/** Vertices by cubic cell; `near` visits the vertices of the 27 cells round a point. */
export class VertexGrid {
  private readonly cells = new Map<number, number[]>();

  /** `cell` (metres) is the furthest `near` can reach. */
  constructor(
    private readonly positions: ArrayLike<number>,
    private readonly cell: number,
  ) {
    for (let v = 0; v < positions.length / 3; v++) {
      const k = this.key(
        positions[v * 3] ?? 0,
        positions[v * 3 + 1] ?? 0,
        positions[v * 3 + 2] ?? 0,
      );
      const at = this.cells.get(k);
      if (at) at.push(v);
      else this.cells.set(k, [v]);
    }
  }

  private key(x: number, y: number, z: number): number {
    const c = this.cell;
    return (
      ((Math.floor(x / c) * 73856093) ^
        (Math.floor(y / c) * 19349663) ^
        (Math.floor(z / c) * 83492791)) >>>
      0
    );
  }

  /** Calls `visit(vertex, squared distance)` for every vertex within `reach` (≤ cell) of the point. */
  near(
    x: number,
    y: number,
    z: number,
    reach: number,
    visit: (v: number, d2: number) => void,
  ): void {
    const p = this.positions;
    const c = this.cell;
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (let k = -1; k <= 1; k++) {
          const cell = this.cells.get(this.key(x + i * c, y + j * c, z + k * c));
          if (!cell) continue;
          for (const v of cell) {
            const d2 =
              dmath.pow((p[v * 3] ?? 0) - x, 2) +
              dmath.pow((p[v * 3 + 1] ?? 0) - y, 2) +
              dmath.pow((p[v * 3 + 2] ?? 0) - z, 2);
            if (d2 <= reach * reach) visit(v, d2);
          }
        }
  }
}

/** The mesh's bodies; `normal` is the belt plane's, `pitch` the link pitch (metres, > 0). */
export function beltBodies(
  mesh: BeltMesh,
  normal: readonly [number, number, number],
  pitch: number,
): BeltBody[] {
  const p = mesh.positions;
  const count = Math.floor(p.length / 3);
  const parent = Int32Array.from({ length: count }, (_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while ((parent[r] ?? r) !== r) r = parent[r] ?? r;
    while ((parent[i] ?? i) !== r) {
      const next = parent[i] ?? r;
      parent[i] = r;
      i = next;
    }
    return r;
  };
  const join = (a: number, b: number): void => {
    parent[find(a)] = find(b);
  };
  // Vertices split by a hard edge or a UV seam sit on one point: one piece.
  const first = new Map<string, number>();
  const distinct: number[] = [];
  for (let v = 0; v < count; v++) {
    const key = `${Math.round((p[v * 3] ?? 0) / WELD)},${Math.round((p[v * 3 + 1] ?? 0) / WELD)},${Math.round((p[v * 3 + 2] ?? 0) / WELD)}`;
    const seen = first.get(key);
    if (seen === undefined) {
      first.set(key, v);
      distinct.push(v);
    } else join(v, seen);
  }
  const ix = mesh.indices;
  for (let i = 0; i + 2 < ix.length; i += 3) {
    join(ix[i] ?? 0, ix[i + 1] ?? 0);
    join(ix[i + 1] ?? 0, ix[i + 2] ?? 0);
  }
  const pieces = new Map<number, { verts: number[]; sum: [number, number, number]; n: number }>();
  for (let v = 0; v < count; v++) {
    const root = find(v);
    const piece = pieces.get(root) ?? { verts: [], sum: [0, 0, 0], n: 0 };
    pieces.set(root, piece);
    piece.verts.push(v);
  }
  for (const v of distinct) {
    const piece = pieces.get(find(v));
    if (!piece) continue;
    for (let k = 0; k < 3; k++) piece.sum[k as 0 | 1 | 2] += p[v * 3 + k] ?? 0;
    piece.n++;
  }
  const out: BeltBody[] = [];
  for (const { verts, sum, n } of pieces.values()) {
    const centre: [number, number, number] = [sum[0] / n, sum[1] / n, sum[2] / n];
    // Reach in the belt plane: how far the piece spreads along the loop, whatever its width.
    let reach = 0;
    for (const v of verts) {
      const r = [0, 1, 2].map((k) => (p[v * 3 + k] ?? 0) - (centre[k] ?? 0));
      const w = (r[0] ?? 0) * normal[0] + (r[1] ?? 0) * normal[1] + (r[2] ?? 0) * normal[2];
      reach = Math.max(reach, Math.sqrt(Math.max(0, dmath.pow(dmath.norm(r), 2) - w * w)));
    }
    if (reach <= pitch) out.push({ verts, centre, rigid: true });
    else
      for (const v of verts)
        out.push({
          verts: [v],
          centre: [p[v * 3] ?? 0, p[v * 3 + 1] ?? 0, p[v * 3 + 2] ?? 0],
          rigid: false,
        });
  }
  return out;
}
