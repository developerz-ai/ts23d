// The leather collar roll: a torus round the scan's neck, lying in the collar plane (z + 0.3 x =
// SEAM_Z, higher at the back). Its centre line follows the neck's own outline as measured on the
// imported mesh (`outline`, a radius per angle), so it sits on the skin all the way round: an
// ellipse through the neck's bounding box stood off the flat back of the neck. Scuffed leather:
// the top of the roll rubbed pale, the underside and the groove against the neck dark.
// Built directly (rings × sides quads, closed), segment counts per LOD.

import { type Mesh, MeshBuilder, type Vec3 } from '@developerz.ai/ts23d';

export interface CollarSpec {
  readonly centre: Vec3;
  /** Inner half-axes of the opening along X and Y (the neck's, plus clearance). */
  readonly rx: number;
  readonly ry: number;
  /** Tube radius. */
  readonly tube: number;
  readonly seamZ: number;
  readonly color: Vec3;
  /** The neck's radius from `centre` at angle `a` (in the XY plane); default: the ellipse. */
  readonly outline?: (a: number) => number;
  /** 0..1 wear tone at a point (scuffs); default none. */
  readonly scuff?: (p: Vec3) => number;
}

export function collarMesh(c: CollarSpec, rings: number, sides: number): Mesh {
  const b = new MeshBuilder();
  const id: number[] = [];
  for (let i = 0; i < rings; i++) {
    const a = (i / rings) * Math.PI * 2;
    // Centre line of the tube: the opening's ellipse pushed out by the tube radius.
    const ring = (t: number): [number, number] => {
      const r = c.outline ? c.outline(t) + c.tube : 0;
      return c.outline
        ? [r * Math.cos(t), r * Math.sin(t)]
        : [(c.rx + c.tube) * Math.cos(t), (c.ry + c.tube) * Math.sin(t)];
    };
    const [ex, ey] = ring(a);
    const x = c.centre[0] + ex;
    const y = c.centre[1] + ey;
    const z = c.seamZ - 0.3 * x;
    // Outward direction in the plane (the outline's normal) and the plane's up.
    const [ax, ay] = ring(a - 0.02);
    const [bx, by] = ring(a + 0.02);
    let ox = by - ay;
    let oy = -(bx - ax);
    const l = Math.hypot(ox, oy) || 1;
    ox /= l;
    oy /= l;
    const up: Vec3 = [0.287, 0, 0.958];
    const out: Vec3 = [ox * 0.958, oy, -0.287 * ox];
    for (let j = 0; j < sides; j++) {
      const t = (j / sides) * Math.PI * 2;
      const n: Vec3 = [
        out[0] * Math.cos(t) + up[0] * Math.sin(t),
        out[1] * Math.cos(t) + up[1] * Math.sin(t),
        out[2] * Math.cos(t) + up[2] * Math.sin(t),
      ];
      const p: Vec3 = [x + n[0] * c.tube, y + n[1] * c.tube, z + n[2] * c.tube];
      // Rubbed pale where hands and cloth reach it (top, outside), dark where they do not.
      const open = Math.max(0, Math.sin(t)) * 0.6 + Math.max(0, Math.cos(t)) * 0.4;
      const k = 0.62 + 0.5 * open + 0.3 * (c.scuff ? c.scuff(p) : 0);
      id.push(
        b.vertex({
          p,
          n,
          uv: [i / rings, j / sides],
          color: [
            Math.min(1, c.color[0] * k),
            Math.min(1, c.color[1] * k),
            Math.min(1, c.color[2] * k),
          ],
        }),
      );
    }
  }
  const at = (i: number, j: number): number => id[(i % rings) * sides + (j % sides)] ?? 0;
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < sides; j++) b.quad(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
  return b.build();
}
