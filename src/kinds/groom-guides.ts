// Groom inputs for the Blender `groom` task: guide curves traced on the scalp by the same flow,
// lift, hug and collision as today's strand cards (hairCards' centre lines: one guide per sparse
// card, so guides and cards agree on where the hair lies), the root surface (head and cap) as a
// GLB the children root on and collide with, and the `t3d-groom/1` JSON (guides + strand-op masks + card shape). Frames: ts23d is
// Z up, +X front; glTF (x, y, z) = ts23d (y, z, x), a rotation, so winding is kept.

import type { Mesh, Rng, Vec3 } from '../core/index.ts';
import { writeMeshGlb } from '../neural/index.ts';
import { type FlowSeed, hairCards, hairFlow } from '../passes/index.ts';
import { sdf } from '../primitives/index.ts';
import { type GroomField, type GroomGuide, type GroomOp, isStrandOp, opMask } from './groom-ops.ts';

export interface GuideLayer {
  /** Negative where hair grows (the hairline field). */
  readonly region: GroomField;
  /** Guides per m² (sparse: 2–6 per cm² of scalp is 20 000–60 000). */
  readonly density: number;
  readonly length: number | ((p: Vec3) => number);
  readonly lift?: number;
  readonly bend?: number;
  readonly droop?: number;
  readonly hug?: number;
}

export interface ScalpGuideOptions {
  /** The surface the guides root on (negative inside), as for scalpCards. */
  readonly field: GroomField;
  readonly bounds: readonly [Vec3, Vec3];
  readonly cell: number;
  readonly comb: FlowSeed;
  readonly collide?: GroomField;
  readonly layer: GuideLayer;
  /** Segments per guide (1..12). */
  readonly segments: number;
  readonly rng: Rng;
}

export interface ScalpGuides {
  readonly guides: GroomGuide[];
  /** The whole root surface (head and cap, ts23d frame): children root on it and clear it. */
  readonly surface: Mesh;
  /** Area of its hair region, m². */
  readonly area: number;
}

const CELL = { u0: 0, u1: 1, v0: 0, v1: 1, metres: 1 };

/** Guides from the scalp: centre lines of folded (3-column) sparse cards, root first. */
export function scalpGuides(o: ScalpGuideOptions): ScalpGuides {
  const root = sdf({
    field: o.field,
    bounds: o.bounds,
    resolution: o.cell,
    color: () => [1, 1, 1],
  });
  const L = o.layer;
  const cards = hairCards({
    surface: root,
    flow: hairFlow(root, o.comb),
    zones: [
      {
        name: 'guides',
        density: (p) => (L.region(p) < -0.002 ? L.density : 0),
        length: L.length,
        width: 0.004,
        lift: L.lift ?? 0.25,
        bend: L.bend ?? 0.8,
        droop: L.droop ?? 0.25,
        roll: 0,
        jitter: 0.1,
        cells: [CELL],
        fold: 0.5,
        hug: L.hug ?? 0.6,
      },
    ],
    rng: o.rng.fork('groom-guides'),
    segments: o.segments,
    field: o.field,
    ...(o.collide ? { collide: o.collide } : {}),
  });
  // Folded cards emit rows of (left, right, centre): the centre vertex is the settled line.
  const m = cards.mesh;
  const row = 3 * (o.segments + 1);
  const guides: GroomGuide[] = [];
  for (let c = 0; c * row < m.positions.length / 3; c++) {
    const points: Vec3[] = [];
    for (let k = 0; k <= o.segments; k++) {
      const v = c * row + k * 3 + 2;
      points.push([
        m.positions[v * 3] ?? 0,
        m.positions[v * 3 + 1] ?? 0,
        m.positions[v * 3 + 2] ?? 0,
      ]);
    }
    guides.push({ points, normal: normalAt(o.field, points[0] ?? [0, 0, 0]) });
  }
  return { guides, surface: root, area: regionArea(root, L.region) };
}

function normalAt(f: GroomField, p: Vec3): Vec3 {
  const h = 5e-4;
  const g: Vec3 = [
    f([p[0] + h, p[1], p[2]]) - f([p[0] - h, p[1], p[2]]),
    f([p[0], p[1] + h, p[2]]) - f([p[0], p[1] - h, p[2]]),
    f([p[0], p[1], p[2] + h]) - f([p[0], p[1], p[2] - h]),
  ];
  const l = Math.hypot(...g) || 1;
  return [g[0] / l, g[1] / l, g[2] / l];
}

/** Area of the triangles of `m` whose centroid lies in `region` (≤ 0), m². */
function regionArea(m: Mesh, region: GroomField): number {
  let area = 0;
  const P = (i: number): Vec3 => [
    m.positions[i * 3] ?? 0,
    m.positions[i * 3 + 1] ?? 0,
    m.positions[i * 3 + 2] ?? 0,
  ];
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, c, d] = [0, 1, 2].map((k) => P(m.indices[t + k] ?? 0)) as [Vec3, Vec3, Vec3];
    const mid: Vec3 = [
      (a[0] + c[0] + d[0]) / 3,
      (a[1] + c[1] + d[1]) / 3,
      (a[2] + c[2] + d[2]) / 3,
    ];
    if (region(mid) > 0) continue;
    const e1: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const e2: Vec3 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    area +=
      Math.hypot(
        e1[1] * e2[2] - e1[2] * e2[1],
        e1[2] * e2[0] - e1[0] * e2[2],
        e1[0] * e2[1] - e1[1] * e2[0],
      ) / 2;
  }
  return area;
}

/** ts23d ↔ glTF frame for a flat xyz array (cyclic permutation: a rotation). */
export function reframe(a: Float32Array, toGltf: boolean): Float32Array {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i += 3) {
    const [x, y, z] = [a[i] ?? 0, a[i + 1] ?? 0, a[i + 2] ?? 0];
    out.set(toGltf ? [y, z, x] : [z, x, y], i);
  }
  return out;
}

/** The solid the strands must clear (`collide`, negative inside) meshed over `bounds`. */
export const collisionMesh = (
  collide: GroomField,
  bounds: readonly [Vec3, Vec3],
  cell: number,
): Mesh => sdf({ field: collide, bounds, resolution: cell, color: () => [1, 1, 1] });

/** A ts23d mesh as the GLB the groom task imports (glTF frame). */
export const scalpGlb = (m: Mesh): Uint8Array =>
  writeMeshGlb([
    {
      name: 'scalp',
      mesh: { ...m, positions: reframe(m.positions, true), normals: reframe(m.normals, true) },
    },
  ]);

export interface GroomCardShape {
  /** Card width at root and tip, metres (the tool widens a lock to its strands' spread). */
  readonly width: readonly [number, number];
  /** V section depth as a share of the half-width (0 = flat). */
  readonly fold: number;
  /** Flyaways: this many single child strands as thin flat cards (`groom_wisp`), this wide. */
  readonly wisps?: number;
  readonly wispWidth?: number;
}

const r6 = (v: number): number => Math.round(v * 1e6) / 1e6;
const v6 = (p: Vec3): number[] => p.map(r6);

/** `t3d-groom/1` JSON (ts23d frame, rounded to 1 µm): guides, strand ops with per-guide masks. */
export function groomJson(
  guides: readonly GroomGuide[],
  ops: readonly GroomOp[],
  card: GroomCardShape,
  zones: Readonly<Record<string, GroomField>> = {},
): Uint8Array {
  const strand = ops.filter(isStrandOp).map((op) => {
    const { region: _r, ...rest } = op;
    return { ...rest, mask: opMask(op, guides, zones).map(r6) };
  });
  // Trims the children: interpolated strands can outgrow a cut guide.
  const cut = ops.flatMap((op) =>
    op.op === 'cut' && op.length !== undefined
      ? [{ op: 'cut', length: op.length, mask: opMask(op, guides, zones).map(r6) }]
      : [],
  );
  const doc = {
    contract: 't3d-groom/1',
    frame: 'ts23d',
    card: {
      width: card.width.map(r6),
      fold: r6(card.fold),
      wisps: card.wisps ?? 0,
      wispWidth: r6(card.wispWidth ?? 0.004),
    },
    guides: guides.map((g) => ({ normal: v6(g.normal), points: g.points.map(v6) })),
    ops: [...strand, ...cut],
  };
  return new TextEncoder().encode(JSON.stringify(doc));
}
