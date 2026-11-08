// Thin keratin parts as tube meshes (ported from recipes/_lib/creature/lowpoly.ts + horn.ts):
// claws, talons and teeth are bent tapering chains meshed as capped swept tubes with a colour
// gradient root → tip — finer than any sculpt cell could hold. The root sits inside the flesh it
// grows from (toe, gum), so QA `connections` sees it rooted.

import { type Mesh, MeshBuilder, type Vec3 } from '../core/index.ts';
import { stripRect } from '../material/index.ts';
import { transportFrames } from '../primitives/index.ts';
import { arc, mixRgb, smoothstep, v3 } from './creature-curve.ts';
import type { SkinNode } from './creature-skin.ts';

/** A skin chain as a capped tube: `sides` vertices per ring, a colour per node, plain strip. */
export function tubeMesh(nodes: readonly SkinNode[], sides: number, colors: readonly Vec3[]): Mesh {
  const kept: { n: SkinNode; c: Vec3 }[] = [];
  nodes.forEach((n, i) => {
    const last = kept[kept.length - 1];
    if (!last || v3.len(v3.sub(n.at, last.n.at)) > 1e-4)
      kept.push({ n, c: colors[i] ?? colors[0] ?? [1, 1, 1] });
  });
  const fr = transportFrames(kept.map((k) => k.n.at));
  const rect = stripRect('plain');
  const uv: [number, number] = [rect.u0 + 0.001, rect.v0 + 0.002];
  const b = new MeshBuilder();
  const ringDir = (f: { n: Vec3; b: Vec3 }, j: number): Vec3 => {
    const a = (j / sides) * Math.PI * 2;
    return v3.add(v3.mul(f.n, Math.cos(a)), v3.mul(f.b, Math.sin(a)));
  };
  const rings: number[][] = [];
  kept.forEach((k, i) => {
    const f = fr[i];
    if (!f) return;
    const row: number[] = [];
    for (let j = 0; j <= sides; j++) {
      const d = ringDir(f, j);
      row.push(b.vertex({ p: v3.add(k.n.at, v3.mul(d, k.n.r)), n: d, uv, color: k.c }));
    }
    rings.push(row);
  });
  for (let i = 0; i + 1 < rings.length; i++)
    for (let j = 0; j < sides; j++)
      b.quad(
        rings[i]?.[j] ?? 0,
        rings[i]?.[j + 1] ?? 0,
        rings[i + 1]?.[j + 1] ?? 0,
        rings[i + 1]?.[j] ?? 0,
      );
  const cap = (i: number, out: 1 | -1): void => {
    const k = kept[i];
    const f = fr[i];
    if (!k || !f) return;
    const n = v3.mul(f.t, out);
    const centre = b.vertex({ p: k.n.at, n, uv, color: k.c });
    const ids: number[] = [];
    for (let j = 0; j < sides; j++)
      ids.push(b.vertex({ p: v3.add(k.n.at, v3.mul(ringDir(f, j), k.n.r)), n, uv, color: k.c }));
    for (let j = 0; j < sides; j++) {
      const p = ids[j] ?? 0;
      const q = ids[(j + 1) % sides] ?? 0;
      if (out === 1) b.tri(centre, p, q);
      else b.tri(centre, q, p);
    }
  };
  cap(0, -1);
  cap(kept.length - 1, 1);
  return b.build();
}

export interface KeratinOptions {
  /** Root centre (buried in the flesh) and initial heading. */
  readonly base: Vec3;
  readonly dir: Vec3;
  /** Side the tip curls toward. */
  readonly down: Vec3;
  readonly length: number;
  readonly radius: number;
  /** Total curl, degrees. */
  readonly curl: number;
  readonly segments: number;
  readonly sides: number;
  /** Colours root → middle → tip. */
  readonly colors: readonly [Vec3, Vec3, Vec3];
}

/** A claw, talon or tooth: tapering (thick root, sharp tip), curled toward `down`. */
export function keratin(o: KeratinOptions): Mesh {
  const axis = v3.cross(v3.norm(o.dir), v3.norm(o.down));
  const path = arc(o.base, o.dir, o.length, axis, o.curl, o.segments);
  const n = path.length - 1;
  const tip = o.radius * 0.12;
  const nodes = path.map((at, i) => ({
    at,
    r: tip + (o.radius - tip) * (1 - i / n) ** 0.7,
  }));
  const colors = nodes.map((_, i) => {
    const t = i / n;
    return t < 0.45
      ? mixRgb(o.colors[0], o.colors[1], smoothstep(0, 0.45, t))
      : mixRgb(o.colors[1], o.colors[2], smoothstep(0.55, 1, t));
  });
  return tubeMesh(nodes, o.sides, colors);
}
