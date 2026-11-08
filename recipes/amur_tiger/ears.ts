// Ears (head-local frame): short, rounded and cupped, set wide on the crown, opening forward and a
// little out. Each is its own part grown from the head (the root buried in the crown fur): a
// shallow cup with a thick rim, pale fur filling the inside, the back black with the white ocellus
// (eye-spot) tigers flash in threat displays (Wikipedia: Tiger, "Coat" / "Communication").

import {
  applyAffine,
  type Field,
  frame,
  type Mesh,
  type SculptEdit,
  type Vec3,
} from '@developerz.ai/ts23d';
import { mixRgb, smoothstep, v3 } from '../_lib/creature/curve.ts';
import { blob } from '../_lib/creature/lowpoly.ts';
import { sculptPart } from '../_lib/creature/sculpt-part.ts';
import { C } from './palette.ts';
import { HEAD } from './skeleton.ts';

/** The ear's frame (left): opening direction, width direction, up. */
export const EAR = (() => {
  const base = HEAD.ear;
  const up = v3.norm([-0.12, 0.36, 1]);
  const face0 = v3.norm([1, 0.7, 0.05]);
  // Orthonormalise: face ⟂ up, side = up × face.
  const face = v3.norm(v3.sub(face0, v3.mul(up, v3.dot(face0, up))));
  const side = v3.cross(up, face);
  return { base, up, face, side, height: 0.076, width: 0.037, thick: 0.012 };
})();

/** Ear-local coordinates (face, side, up) of a head-local point, origin at the ear's centre. */
export function earLocal(p: Vec3): Vec3 {
  const c = v3.add(EAR.base, v3.mul(EAR.up, EAR.height * 0.48));
  const d = v3.sub(p, c);
  return [v3.dot(d, EAR.face), v3.dot(d, EAR.side), v3.dot(d, EAR.up)];
}

/** Ellipsoid in the ear frame, offset along (face, side, up), as a field edit. */
function earBlob(off: Vec3, r: Vec3, op: 'add' | 'subtract', blend: number): SculptEdit {
  const field: Field = (p) => {
    const q = earLocal(p);
    const x = (q[0] - off[0]) / r[0];
    const y = (q[1] - off[1]) / r[1];
    const z = (q[2] - off[2]) / r[2];
    const k0 = Math.hypot(x, y, z);
    const k1 = Math.hypot(x / r[0], y / r[1], z / r[2]);
    return k1 > 0 ? (k0 * (k0 - 1)) / k1 : -Math.min(r[0], r[1], r[2]);
  };
  const c = v3.add(EAR.base, v3.mul(EAR.up, EAR.height * 0.48));
  const R = Math.max(...r) + Math.hypot(...off) + 0.01;
  return {
    field,
    bounds: [
      [c[0] - R, c[1] - R, c[2] - R],
      [c[0] + R, c[1] + R, c[2] + R],
    ],
    op,
    blend,
  };
}

export function earEdits(lod: number): SculptEdit[] {
  const h = EAR.height / 2;
  const out: SculptEdit[] = [
    // Pinna: a rounded plate, a little narrower toward the round tip.
    earBlob([0, 0, 0], [EAR.thick, EAR.width, h], 'add', 0),
    // Root: thickens into the crown and sinks below it.
    earBlob([-0.006, 0, -h * 1.15], [0.026, EAR.width * 1.05, 0.036], 'add', 0.022),
  ];
  if (lod < 2)
    // The cup: hollow the front, leaving a thick rim.
    out.push(
      earBlob(
        [EAR.thick * 0.95, 0, -h * 0.08],
        [EAR.thick * 0.8, EAR.width * 0.72, h * 0.8],
        'subtract',
        0.012,
      ),
    );
  // Pale fur tufts filling the cup's lower half (the ear furnishings).
  out.push(
    earBlob([EAR.thick * 0.35, 0, -h * 0.45], [0.008, EAR.width * 0.55, h * 0.4], 'add', 0.006),
  );
  return out;
}

/** Ear colour in ear-local coordinates: black back with the white ocellus; pale inside. */
export function earPaint(p: Vec3, _c: Vec3): Vec3 {
  const q = earLocal(p);
  const h = EAR.height / 2;
  const rr = Math.hypot(q[1] / EAR.width, q[2] / h);
  const back = smoothstep(0.002, -0.004, q[0]);
  // Ocellus: a white oval in the middle of the back, a little above centre.
  const oc = smoothstep(1.05, 0.85, Math.hypot(q[1] / 0.015, (q[2] - 0.002) / 0.017));
  const backCol = mixRgb(C.earBack, C.ocellus, oc);
  // Inside: pale fur, the deep cup pinkish, a dark rim at the edge.
  const rim = smoothstep(0.78, 0.95, rr);
  const deep = smoothstep(0.004, -0.004, q[0] - EAR.thick * 0.2) * smoothstep(0.7, 0.3, rr);
  const front = mixRgb(mixRgb(C.earInside, C.earSkin, deep * 0.6), C.earBack, rim);
  // The root shades into the crown's orange.
  const root = smoothstep(-h * 0.7, -h * 1.05, q[2]);
  const col = mixRgb(mixRgb(front, backCol, back), C.orange, root);
  return col;
}

export const EAR_RES = [0.0034, 0.009, 0.02] as const;

/** Left ear in the head-local frame. */
export function earMesh(lod: 0 | 1 | 2): Mesh {
  if (lod === 2) {
    // Far LOD: a flattened blob in the ear's frame (a coarse sculpt would tear the thin pinna).
    const c = v3.add(EAR.base, v3.mul(EAR.up, EAR.height * 0.3));
    const m = blob([0, 0, 0], [EAR.thick * 1.6, EAR.width, EAR.height * 0.68], {
      rings: 3,
      sides: 6,
      color: (n) => (n[0] < 0 ? C.earBack : C.earInside),
    });
    return applyAffine(m, frame(EAR.face, EAR.side, EAR.up, c));
  }
  return sculptPart({
    edits: earEdits(lod),
    res: EAR_RES[lod],
    color: C.earBack,
    paint: earPaint,
    tone: { reach: 0.008, strength: 0.4, cavity: 0.3 },
  }).mesh;
}
