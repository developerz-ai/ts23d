// Pitched roofs as one mesh: true-scale roofing courses down every slope, a slab with real
// thickness (soffit + fascia/bargeboards around the eaves), ridge and hip caps, gable infill walls
// where the roof leaves a wall open, chimneys that stand on the attic floor and clear the slope.
// LOD0/1 keep thickness, fascia and caps; LOD2 is the bare slopes + gables (a few dozen triangles).

import {
  type BuildContext,
  type Lod,
  type Mesh,
  MeshBuilder,
  merge,
  type Vec2,
  type Vec3,
} from '../core/index.ts';
import type { StripId } from '../material/index.ts';
import { beam } from '../primitives/index.ts';
import { emitFace } from './faces.ts';
import { chimney, type RoofChimney } from './roof-chimney.ts';
import {
  envelope,
  facets,
  type Plane,
  type RoofOptions,
  type RoofShape,
  ridgeHeight,
  roofHeightAt,
  roofShape,
  toWorld,
  zAt,
} from './roof-shape.ts';

export interface RoofMeshOptions extends RoofOptions {
  /** Fascia, bargeboards, soffit and ridge caps. Default: the roof colour, darkened. */
  readonly trim?: Vec3;
  /** Gable / shed end infill walls. Default pale render. */
  readonly wall?: { readonly color: Vec3; readonly strip?: StripId };
  /** Ridge and hip caps (LOD0/1). Default true. */
  readonly caps?: boolean;
  readonly chimneys?: readonly RoofChimney[];
}

export interface RoofInfo {
  /** World z of the ridge / apex top. */
  readonly ridge: number;
  /** World z of the lowest eave edge (underside). */
  readonly eave: number;
  /** World z of the top surface at world (x, y). */
  readonly heightAt: (x: number, y: number) => number;
}

const W = (s: RoofShape, q: Vec2, z: number, at: Vec3): Vec3 => toWorld(s, q, z, at);
const dirW = (s: RoofShape, a: number, b: number, z: number): Vec3 => [
  s.ex[0] * a + s.ey[0] * b,
  s.ex[1] * a + s.ey[1] * b,
  z,
];

const onOutline = (outline: readonly Vec2[], q: Vec2): boolean =>
  outline.some((a, i) => {
    const b = outline[(i + 1) % outline.length] ?? a;
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const l2 = ex * ex + ey * ey || 1;
    const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * ex + (q[1] - a[1]) * ey) / l2));
    return Math.hypot(a[0] + ex * t - q[0], a[1] + ey * t - q[1]) < 1e-6;
  });

/** Slopes of one envelope: top (normal up) or underside (normal down). */
function slopes(
  b: MeshBuilder,
  s: RoofShape,
  planes: readonly Plane[],
  o: RoofMeshOptions,
  face: { down: boolean; color: Vec3; strip: StripId; banded: boolean },
): [Plane, Vec2[]][] {
  const cells = facets(planes, s.outline);
  for (const [p, cell] of cells) {
    const pts = cell.map((q) => W(s, q, zAt(p, q), o.at));
    const low = pts.reduce((m, q) => (q[2] < m[2] ? q : m), pts[0] ?? o.at);
    const k = face.down ? -1 : 1;
    emitFace(b, {
      points: pts,
      normal: dirW(s, -p.ga * k, -p.gb * k, k),
      up: [0, 0, 1],
      vOrigin: low,
      color: face.color,
      strip: face.strip,
      banded: face.banded,
    });
  }
  return cells;
}

/** Vertical fascia / bargeboard band round the outline, between the two envelopes. */
function fascia(b: MeshBuilder, s: RoofShape, o: RoofMeshOptions, trim: Vec3, verts: Vec2[]): void {
  const n = s.outline.length;
  for (let i = 0; i < n; i++) {
    const a = s.outline[i] ?? [0, 0];
    const c = s.outline[(i + 1) % n] ?? a;
    const ex = c[0] - a[0];
    const ey = c[1] - a[1];
    const len2 = ex * ex + ey * ey;
    if (len2 < 1e-12) continue;
    const ts = [0, 1];
    for (const q of verts) {
      const t = ((q[0] - a[0]) * ex + (q[1] - a[1]) * ey) / len2;
      const off = Math.abs((q[0] - a[0]) * ey - (q[1] - a[1]) * ex) / Math.sqrt(len2);
      if (t > 1e-6 && t < 1 - 1e-6 && off < 1e-6) ts.push(t);
    }
    ts.sort((x, y) => x - y);
    const out = dirW(s, ey, -ex, 0);
    for (let k = 0; k + 1 < ts.length; k++) {
      const q0: Vec2 = [a[0] + ex * (ts[k] ?? 0), a[1] + ey * (ts[k] ?? 0)];
      const q1: Vec2 = [a[0] + ex * (ts[k + 1] ?? 1), a[1] + ey * (ts[k + 1] ?? 1)];
      if (Math.hypot(q1[0] - q0[0], q1[1] - q0[1]) < 1e-6) continue;
      emitFace(b, {
        points: [
          W(s, q0, envelope(s.under, q0), o.at),
          W(s, q1, envelope(s.under, q1), o.at),
          W(s, q1, envelope(s.top, q1), o.at),
          W(s, q0, envelope(s.top, q0), o.at),
        ],
        normal: out,
        up: [0, 0, 1],
        vOrigin: o.at,
        color: trim,
        strip: 'plain',
      });
    }
  }
}

/** Infill under the roof on each wall line where the underside rises above the plate. */
function gableWalls(b: MeshBuilder, s: RoofShape, o: RoofMeshOptions, banded: boolean): void {
  const wall = o.wall ?? { color: [0.8, 0.76, 0.68] as Vec3 };
  const lines: [Vec2, Vec2, Vec3][] = [
    [[s.L, -s.D], [s.L, s.D], dirW(s, 1, 0, 0)],
    [[-s.L, s.D], [-s.L, -s.D], dirW(s, -1, 0, 0)],
    [[s.L, s.D], [-s.L, s.D], dirW(s, 0, 1, 0)],
    [[-s.L, -s.D], [s.L, -s.D], dirW(s, 0, -1, 0)],
  ];
  for (const [q0, q1, out] of lines) {
    const at = (t: number): Vec2 => [q0[0] + (q1[0] - q0[0]) * t, q0[1] + (q1[1] - q0[1]) * t];
    const ts = new Set([0, 1]);
    s.under.forEach((p, i) => {
      s.under.forEach((q, j) => {
        if (j <= i) return;
        const d0 = zAt(p, q0) - zAt(q, q0);
        const d1 = zAt(p, q1) - zAt(q, q1);
        if (Math.abs(d0 - d1) < 1e-12) return;
        const t = d0 / (d0 - d1);
        if (t > 1e-6 && t < 1 - 1e-6 && Math.abs(envelope(s.under, at(t)) - zAt(p, at(t))) < 1e-7)
          ts.add(t);
      });
    });
    const prof = [...ts]
      .sort((x, y) => x - y)
      .map((t) => [at(t), envelope(s.under, at(t))] as const);
    if (Math.max(...prof.map(([, z]) => z)) < 0.01) continue;
    const pts: Vec3[] = [W(s, q0, 0, o.at)];
    for (const [q, z] of prof) pts.push(W(s, q, Math.max(0, z), o.at));
    pts.push(W(s, q1, 0, o.at));
    emitFace(b, {
      points: pts,
      normal: out,
      up: [0, 0, 1],
      vOrigin: o.at,
      color: wall.color,
      strip: wall.strip ?? 'plain',
      banded,
    });
  }
}

/** Ridge / hip / knee caps: a round roll on every crease between two top facets. */
function caps(s: RoofShape, o: RoofMeshOptions, cells: [Plane, Vec2[]][], trim: Vec3, lod: Lod) {
  const seen = new Set<string>();
  const out: Mesh[] = [];
  const r = Math.max(0.06, s.thickness * 0.5);
  for (const [p, cell] of cells) {
    cell.forEach((q0, i) => {
      const q1 = cell[(i + 1) % cell.length] ?? q0;
      const mid: Vec2 = [(q0[0] + q1[0]) / 2, (q0[1] + q1[1]) / 2];
      if (onOutline(s.outline, mid) || Math.hypot(q1[0] - q0[0], q1[1] - q0[1]) < 1e-3) return;
      const key = [q0, q1]
        .map((q) => `${q[0].toFixed(4)},${q[1].toFixed(4)}`)
        .sort()
        .join('|');
      if (seen.has(key)) return;
      seen.add(key);
      const lift = r * 0.3;
      out.push(
        beam({
          from: W(s, q0, zAt(p, q0) + lift, o.at),
          to: W(s, q1, zAt(p, q1) + lift, o.at),
          width: r * 2,
          segments: lod === 0 ? 8 : 5,
          color: trim,
          strip: 'plain',
        }),
      );
    });
  }
  return out;
}

/** The roof as one mesh at a detail level. Pure: compose with place/merge or pass to ctx.part. */
export function roofMesh(o: RoofMeshOptions, lod: Lod = 0): Mesh {
  const s = roofShape(o);
  const trim = o.trim ?? [o.color[0] * 0.55, o.color[1] * 0.55, o.color[2] * 0.55];
  const strip = o.strip ?? 'slate';
  const b = new MeshBuilder();
  const extra: Mesh[] = [];
  if (lod === 2) {
    // Bare slopes on the underside envelope: it rests on the walls with no slab.
    slopes(b, s, s.under, o, { down: false, color: o.color, strip, banded: false });
  } else {
    const top = slopes(b, s, s.top, o, { down: false, color: o.color, strip, banded: true });
    const under = slopes(b, s, s.under, o, {
      down: true,
      color: trim,
      strip: 'wood',
      banded: lod === 0,
    });
    const verts = [...top, ...under].flatMap(([, cell]) => cell);
    fascia(b, s, o, trim, verts);
    if (o.caps !== false) extra.push(...caps(s, o, top, trim, lod));
  }
  gableWalls(b, s, o, lod < 2);
  for (const c of o.chimneys ?? []) {
    extra.push(chimney(c, (x, y) => roofHeightAt(o, x, y), o.at, lod));
  }
  return merge([b.build(), ...extra]);
}

/** Add the roof as part `name` (default 'roof') at the context's LOD; returns its heights. */
export function roof(ctx: BuildContext, o: RoofMeshOptions & { readonly name?: string }): RoofInfo {
  ctx.part(o.name ?? 'roof', roofMesh(o, ctx.lod));
  return roofInfo(o);
}

export function roofInfo(o: RoofOptions): RoofInfo {
  const s = roofShape(o);
  const eave = Math.min(...s.outline.map((q) => envelope(s.under, q)));
  return {
    ridge: ridgeHeight(o),
    eave: o.at[2] + eave,
    heightAt: (x, y) => roofHeightAt(o, x, y),
  };
}
