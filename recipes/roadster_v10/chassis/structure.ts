// The structure under the skin: steel perimeter frame (main rails, front horns, crossmembers),
// floor pan with the transmission tunnel and footwells, the firewall and the rear bulkhead, inner
// wheel liners round every arch, engine-bay aprons with the shock towers, the radiator support,
// the flat under-tray, the front splitter and the rear diffuser. All static; LOD-gated detail.

import type { Lod, Mesh, Vec3 } from '@developerz.ai/ts23d';
import { lathe, merge, planar, prism } from '@developerz.ai/ts23d';
import { ARCH_F, ARCH_R, X_FA, X_FIREWALL, X_RA, Y_WF, Y_WR, Z_FA, Z_RA } from '../dims.ts';
import { C } from '../lib/colors.ts';
import { bar, bothSides, bx, rod, shift } from '../lib/geo.ts';
import { corner } from './points.ts';

export const FLOOR_Z = 0.135; // floor pan top
export const TUNNEL_W = 0.15; // half-width at the base
export const TUNNEL_TOP = 0.43;
/** Rear bulkhead face: just ahead of the rear wheel arch. */
export const BULKHEAD_X = -0.865;

/** One wheel liner (left side): a half-drum round the arch, inner wall, open at the bottom. */
function liner(lod: Lod, x: number, z: number, r: number, yIn: number, yOut: number): Mesh {
  const segs = [40, 16, 8][lod] ?? 8;
  const parts: Mesh[] = [];
  // Drum: profile in (radius, y) from the inner wall out to the skin, swept over the top 220°.
  const n = segs;
  const a0 = -0.35;
  const a1 = Math.PI + 0.35;
  const pts: Vec3[][] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const c = Math.cos(a);
    const s = Math.sin(a);
    pts.push([
      [x + r * c, yIn, z + r * s],
      [x + r * c, yOut, z + r * s],
    ]);
  }
  // Inner face (toward the wheel) as quads.
  const strips: Mesh[] = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i] ?? [];
    const q = pts[i + 1] ?? [];
    const a = p[0] ?? [0, 0, 0];
    const b = p[1] ?? a;
    const c2 = q[1] ?? a;
    const d = q[0] ?? a;
    strips.push(plate4(a, b, c2, d, C.liner));
  }
  parts.push(merge(strips));
  // Inner wall (the tub side toward the engine / cabin): the same arc, closed by its chord.
  const wall: Vec3[] = pts.map((p) => p[0] ?? [x, yIn, z]);
  parts.push(planar({ points: wall, color: C.liner, strip: 'plastic', doubleSided: true }));
  return merge(parts);
}

/** A double-sided quad plate a-b-c-d. */
export function plate4(a: Vec3, b: Vec3, c: Vec3, d: Vec3, color: Vec3): Mesh {
  // Thin box-free plate: two triangles each way so either side renders.
  const m = merge([tri2(a, b, c, d, color), tri2(a, d, c, b, color)]);
  return m;
}

function tri2(a: Vec3, b: Vec3, c: Vec3, d: Vec3, color: Vec3): Mesh {
  const u: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v: Vec3 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const l = Math.hypot(...n) || 1;
  const nn: Vec3 = [n[0] / l, n[1] / l, n[2] / l];
  const positions = new Float32Array([...a, ...b, ...c, ...d]);
  const normals = new Float32Array([...nn, ...nn, ...nn, ...nn]);
  return {
    positions,
    normals,
    uvs: new Float32Array([0.01, 0.4, 0.2, 0.4, 0.2, 0.41, 0.01, 0.41]),
    colors: new Float32Array([...color, ...color, ...color, ...color]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  };
}

export interface StructureMeshes {
  readonly floor: Mesh;
  readonly liners: Mesh;
  readonly frame: Mesh;
  readonly bay: Mesh;
  readonly tray: Mesh;
}

export function structure(lod: Lod): StructureMeshes {
  const bayC = C.paint;
  const b0 = lod === 0 ? 0.004 : 0;
  // ---- floor pan, tunnel, firewall, bulkhead, sills inside (cockpit tub) ----
  const floor: Mesh[] = [
    bx([BULKHEAD_X, -0.72, FLOOR_Z - 0.012], [X_FIREWALL, 0.72, FLOOR_Z], C.frame, 'steel_painted'),
    // Tunnel: a tapered box over the gearbox / driveshaft.
    bx(
      [BULKHEAD_X, -TUNNEL_W, FLOOR_Z],
      [X_FIREWALL + 0.02, TUNNEL_W, TUNNEL_TOP],
      C.frame,
      'steel_painted',
      b0 * 4,
    ),
    // Firewall: from the floor to the cowl, toe board sloped into the footwells.
    bx([X_FIREWALL, -0.74, FLOOR_Z], [X_FIREWALL + 0.02, 0.74, 0.8], C.frame, 'steel_painted'),
    // Rear bulkhead behind the seats, up under the deck.
    bx([BULKHEAD_X - 0.02, -0.74, FLOOR_Z], [BULKHEAD_X, 0.74, 0.9], C.frame, 'steel_painted'),
  ];
  // Cockpit side walls (inside the sills, under the door line).
  for (const s of [1, -1])
    floor.push(
      bx([BULKHEAD_X, s * 0.72, FLOOR_Z], [X_FIREWALL, s * 0.74, 0.3], C.frame, 'steel_painted'),
    );
  // ---- liners ----
  const cf = corner('fl');
  const cr = corner('rl');
  const liners = bothSides(
    merge([
      liner(lod, X_FA, Z_FA, ARCH_F + 0.022, Y_WF - 0.245, 0.93),
      liner(lod, X_RA, Z_RA, ARCH_R + 0.012, Y_WR - 0.255, 0.95),
    ]),
  );
  // ---- frame: main rails under the sills, front horns into the bay, rear rails, crossmembers ----
  const fr: Mesh[] = [];
  const rail = (a: Vec3, b: Vec3, w = 0.07): void => {
    fr.push(bar(a, b, w, C.frame, 'steel_painted'));
  };
  for (const s of [1, -1]) {
    rail([BULKHEAD_X, s * 0.56, 0.19], [X_FIREWALL, s * 0.56, 0.19]);
    rail([X_FIREWALL, s * 0.56, 0.19], [X_FA - 0.35, s * 0.42, 0.24]);
    rail([X_FA - 0.35, s * 0.42, 0.24], [1.8, s * 0.42, 0.24]);
    rail([BULKHEAD_X, s * 0.56, 0.19], [X_RA + 0.4, s * 0.45, 0.26]);
    rail([X_RA + 0.4, s * 0.45, 0.26], [-2.0, s * 0.45, 0.3]);
    if (lod === 0) {
      // Upper arm brackets (tower to rail) and the pickup clevises.
      for (const c of [cf, cr]) {
        for (const p of [...c.upperIn, ...c.lowerIn]) {
          const q: Vec3 = [p[0], s * p[1], p[2]];
          fr.push(
            bx(
              [q[0] - 0.025, q[1] - 0.03, q[2] - 0.035],
              [q[0] + 0.025, q[1] + 0.03, q[2] + 0.035],
              C.frame,
              'steel_painted',
            ),
          );
        }
      }
    }
  }
  // Crossmembers: front (under the oil pan), mid (gearbox), rear (diff), radiator lower.
  rail([X_FA, -0.42, 0.135], [X_FA, 0.42, 0.135], 0.05);
  rail([X_FA + 0.2, -0.3, 0.14], [X_FA + 0.2, 0.3, 0.14], 0.06);
  rail([X_FA - 0.2, -0.3, 0.14], [X_FA - 0.2, 0.3, 0.14], 0.06);
  rail([X_RA, -0.45, 0.22], [X_RA, 0.45, 0.22], 0.09);
  rail([X_RA + 0.21, -0.28, 0.15], [X_RA + 0.21, 0.28, 0.15], 0.06);
  rail([X_RA - 0.21, -0.28, 0.15], [X_RA - 0.21, 0.28, 0.15], 0.06);
  rail([1.8, -0.42, 0.22], [1.8, 0.42, 0.22], 0.05);
  // ---- engine bay: aprons from the liners up to the fender line, shock towers, radiator support ----
  const bay: Mesh[] = [];
  for (const s of [1, -1]) {
    const c = corner(s > 0 ? 'fl' : 'fr');
    const top = c.damperTop;
    // Shock tower: a tapered can round the damper top, welded to the liner wall.
    bay.push(
      shift(
        lathe({
          profile: [
            [0.075, -0.12],
            [0.07, -0.02],
            [0.05, 0],
            [0.0, 0.0],
          ],
          segments: lod === 0 ? 24 : 10,
          axis: 'z',
          color: bayC,
          strip: 'plastic',
          caps: false,
        }),
        [top[0], top[1], top[2] + 0.005],
      ),
    );
    // Apron: the bay side wall between the liner and the firewall / radiator.
    bay.push(
      bx([X_FIREWALL, s * 0.5, 0.3], [X_FA - ARCH_F - 0.01, s * 0.52, 0.76], bayC, 'plastic'),
    );
    bay.push(bx([X_FA + ARCH_F + 0.01, s * 0.46, 0.25], [1.76, s * 0.48, 0.6], bayC, 'plastic'));
    bay.push(
      bx([X_FA - ARCH_F - 0.02, s * 0.52, 0.64], [X_FA + 0.25, s * 0.54, 0.7], bayC, 'plastic'),
    );
  }
  // Radiator support: a frame across the nose, under the fascia top.
  bay.push(bx([1.8, -0.44, 0.19], [1.84, 0.44, 0.23], bayC, 'plastic'));
  bay.push(bx([1.74, -0.42, 0.575], [1.78, 0.42, 0.6], bayC, 'plastic'));
  for (const s of [1, -1])
    bay.push(bx([1.76, s * 0.4, 0.19], [1.8, s * 0.44, 0.6], bayC, 'plastic'));
  if (lod === 0) {
    // Seam sealer beads and spot-weld flanges along the apron tops.
    for (const s of [1, -1])
      bay.push(
        rod(
          [X_FIREWALL, s * 0.51, 0.765],
          [X_FA - ARCH_F, s * 0.51, 0.765],
          0.012,
          bayC,
          'plastic',
          6,
        ),
      );
    // Hood bump stops on the support.
    for (const y of [-0.36, 0.36])
      bay.push(rod([1.76, y, 0.6], [1.76, y, 0.615], 0.024, C.black, 'rubber', 8));
  }
  // ---- under-tray, splitter, diffuser ----
  const tray: Mesh[] = [bx([-1.6, -0.6, 0.112], [1.6, 0.6, 0.122], C.liner, 'plastic')];
  // Diffuser: a ramp with strakes, rising to the tail.
  const strakes = lod === 0 ? 7 : lod === 1 ? 3 : 0;
  // Ramp from the flat floor behind the rear axle up into the tail; vertical fins under it.
  const r0: Vec3 = [-1.62, 0, 0.118];
  const r1: Vec3 = [-2.135, 0, 0.395];
  tray.push(
    plate4(
      [r0[0], -0.62, r0[2]],
      [r0[0], 0.62, r0[2]],
      [r1[0], 0.62, r1[2]],
      [r1[0], -0.62, r1[2]],
      C.carbon,
    ),
  );
  for (let k = 0; k < strakes; k++) {
    const y = -0.54 + (k / Math.max(1, strakes - 1)) * 1.08;
    const fin = prism({
      // A blade 6 cm deep under the ramp, faired into the flat floor at its front.
      profile: [
        [r0[0], r0[2]],
        [r1[0], r1[2]],
        [r1[0] + 0.01, r1[2] - 0.06],
        [r0[0] - 0.12, r0[2] - 0.004],
      ],
      depth: 0.008,
      plane: 'xz',
      color: C.carbon,
      strip: 'plastic',
    });
    tray.push(shift(fin, [0, y, 0]));
  }
  // Side plates closing the diffuser against the quarters.
  for (const s of [1, -1])
    tray.push(
      plate4(
        [r0[0], s * 0.62, r0[2]],
        [r1[0], s * 0.62, r1[2]],
        [r1[0] + 0.01, s * 0.62, r1[2] - 0.06],
        [r0[0] - 0.12, s * 0.62, r0[2] - 0.004],
        C.carbon,
      ),
    );
  return {
    floor: merge(floor),
    liners,
    frame: merge(fr),
    bay: merge(bay),
    tray: merge(tray),
  };
}
