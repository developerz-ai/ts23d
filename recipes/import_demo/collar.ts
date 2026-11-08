// The leather collar roll: an elliptical torus round the scan's neck, lying in the collar plane
// (z + 0.3 x = SEAM_Z, higher at the back), sized from the neck as measured on the imported mesh.
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
}

export function collarMesh(c: CollarSpec, rings: number, sides: number): Mesh {
  const b = new MeshBuilder();
  const id: number[] = [];
  for (let i = 0; i < rings; i++) {
    const a = (i / rings) * Math.PI * 2;
    // Centre line of the tube: the opening's ellipse pushed out by the tube radius.
    const ex = (c.rx + c.tube) * Math.cos(a);
    const ey = (c.ry + c.tube) * Math.sin(a);
    const x = c.centre[0] + ex;
    const y = c.centre[1] + ey;
    const z = c.seamZ - 0.3 * x;
    // Outward direction in the plane (ellipse normal) and the plane's up.
    let ox = Math.cos(a) / (c.rx + c.tube);
    let oy = Math.sin(a) / (c.ry + c.tube);
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
      id.push(
        b.vertex({
          p: [x + n[0] * c.tube, y + n[1] * c.tube, z + n[2] * c.tube],
          n,
          uv: [i / rings, j / sides],
          color: c.color,
        }),
      );
    }
  }
  const at = (i: number, j: number): number => id[(i % rings) * sides + (j % sides)] ?? 0;
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < sides; j++) b.quad(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
  return b.build();
}
