// Tail: 0.99 m (Kerley et al. 2005 male mean), thick and furred to the end, hanging from the
// croup in a J whose tip turns up just above the ground. Its own part, pivoted at the root (a slow
// idle sway), the root buried in the body's tail stump. Rings and the black tip are coat.ts.

import type { Mesh, SculptEdit, Vec3 } from '@developerz.ai/ts23d';
import { place } from '@developerz.ai/ts23d';
import { spline, v3 } from '../_lib/creature/curve.ts';
import { tubeMesh } from '../_lib/creature/lowpoly.ts';
import { sculptPart } from '../_lib/creature/sculpt-part.ts';
import { type SkinNode, skin } from '../_lib/creature/skin.ts';
import { tailPaint } from './coat.ts';
import { C } from './palette.ts';
import { SK } from './skeleton.ts';

/** Pivot where the tail hangs from the body. */
export const TAIL_PIVOT: Vec3 = SK.tailRoot;

/** Centre line from inside the stump to the tip. */
export function tailPath(per = 6): Vec3[] {
  const inside: Vec3 = [SK.tailRoot[0] + 0.06, 0, SK.tailRoot[2] + 0.035];
  return spline([inside, ...SK.tail], per);
}

/** Radius along the tail (fur included), arc fraction t of the real tail (0 = root, 1 = tip). */
export function tailRadius(t: number): number {
  const r = SK.tailR;
  const x = Math.min(1, Math.max(0, t)) * (r.length - 1);
  const k = Math.floor(x);
  const a = r[Math.min(k, r.length - 1)] ?? 0.04;
  const b = r[Math.min(k + 1, r.length - 1)] ?? a;
  return a + (b - a) * (x - k);
}

/** Arc length of the visible tail (root → tip), metres. */
export function tailLength(): number {
  const p = spline(SK.tail, 8);
  let s = 0;
  for (let i = 1; i < p.length; i++) s += v3.len(v3.sub(p[i] ?? [0, 0, 0], p[i - 1] ?? [0, 0, 0]));
  // The furred tip rounds off one radius beyond the last node.
  return s + (SK.tailR[SK.tailR.length - 1] ?? 0);
}

function nodes(per: number): SkinNode[] {
  const path = tailPath(per);
  const n = path.length - 1;
  // The first span is inside the stump: keep the root radius there.
  return path.map((at, i) => ({ at, r: tailRadius(Math.max(0, (i - per) / (n - per))) }));
}

export function tailEdits(lod: number): SculptEdit[] {
  const out: SculptEdit[] = [skin(nodes(lod === 0 ? 6 : 4), { blend: 0 })];
  return out;
}

export const TAIL_RES = [0.011, 0.025, 0.05] as const;

/** The tail about its pivot. */
export function tailMesh(lod: 0 | 1 | 2): Mesh {
  const back: Vec3 = [-TAIL_PIVOT[0], -TAIL_PIVOT[1], -TAIL_PIVOT[2]];
  if (lod === 2) {
    const ns = nodes(2);
    const colors = ns.map((nd) => tailPaint(2)(nd.at, C.orange));
    return place(tubeMesh(ns, { sides: 6, colors }), { at: back });
  }
  const m = sculptPart({
    edits: tailEdits(lod),
    res: TAIL_RES[lod],
    color: C.orange,
    paint: tailPaint(lod),
    tone: { reach: 0.03, ground: 0.25, strength: 0.7 },
  }).mesh;
  return place(m, { at: back });
}
