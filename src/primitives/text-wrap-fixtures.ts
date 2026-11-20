// Test fixture for wrapped pixel lettering: one side of a USRA single-sheathed boxcar as
// recipes/boxcar builds it (boards at y = 1.33, steel posts 70 mm proud, door posts, diagonal hat
// braces 34 mm proud) and its stencils set with `text({ surface })` exactly as the recipe calls
// it. Shared by the primitive's triangle-budget test and the qa connectivity test. Not exported.

import { dmath, type Mesh, merge, type Vec3 } from '../core/index.ts';
import { beam } from './beam.ts';
import { box } from './box.ts';
import { text } from './text.ts';

const XB = 12.573 / 2;
const SHEATH_Y = 1.33;
const FRAME_Y = 1.4;
const EAVE_Z = 3.8;
const DOOR_W = 1.83;
const BRACE = 0.03;
const PANEL = (XB - DOOR_W / 2 - 0.08) / 4;
const POSTS = [0, 1, 2, 3, 4].map((i) => XB - i * PANEL);
const POST_W = 0.09;
const BRACE_Z0 = 1.22;
const BRACE_Z1 = EAVE_Z - 0.12;
const RED: Vec3 = [0.5, 0.15, 0.1];
const WHITE: Vec3 = [0.9, 0.9, 0.85];

const slab = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Mesh =>
  box({ size: [x1 - x0, y1 - y0, z1 - z0], at: [(x0 + x1) / 2, (y0 + y1) / 2, z0], color: RED });

/** |y| of the painted surface at (x, z): the recipe's `face` for the +Y side. */
function face(x: number, z: number, graze: number, lod: number): number {
  const ax = Math.abs(x);
  if (lod < 2 && POSTS.some((q) => Math.abs(ax - q) <= POST_W / 2)) return FRAME_Y;
  if (ax >= DOOR_W / 2 + 0.01 && ax <= DOOR_W / 2 + 0.1) return FRAME_Y;
  const t = (z - BRACE_Z0) / (BRACE_Z1 - BRACE_Z0);
  if (lod < 2 && t >= 0 && t <= 1)
    for (let i = 0; i < 4; i++) {
      const xa = (POSTS[i] ?? 0) - POST_W / 2;
      const xb = (POSTS[i + 1] ?? DOOR_W / 2) + POST_W / 2;
      const xc = xa + (xb - xa) * t;
      const hw = (0.0375 * dmath.hypot(xb - xa, BRACE_Z1 - BRACE_Z0)) / (BRACE_Z1 - BRACE_Z0);
      if (Math.abs(ax - xc) <= hw - graze) return SHEATH_Y + 0.004 + BRACE;
    }
  return SHEATH_Y;
}

/** The +Y side's boards, steel posts, door posts and diagonal braces. */
export function boxcarSideBody(): Mesh {
  const m: Mesh[] = [slab(-XB, XB, SHEATH_Y - 0.05, SHEATH_Y, 1.0, EAVE_Z)];
  const ym = SHEATH_Y + 0.004 + BRACE / 2;
  for (const d of [-1, 1]) {
    for (const px of POSTS)
      m.push(slab(d * px - POST_W / 2, d * px + POST_W / 2, SHEATH_Y, FRAME_Y, 1, EAVE_Z));
    const door = [d * (DOOR_W / 2 + 0.01), d * (DOOR_W / 2 + 0.1)];
    m.push(slab(Math.min(...door), Math.max(...door), SHEATH_Y, FRAME_Y, 1, EAVE_Z));
    for (let i = 0; i < 4; i++)
      m.push(
        beam({
          from: [d * ((POSTS[i] ?? 0) - POST_W / 2), ym, BRACE_Z0],
          to: [d * ((POSTS[i + 1] ?? DOOR_W / 2) + POST_W / 2), ym, BRACE_Z1],
          width: 0.075,
          height: BRACE,
          color: RED,
          up: [0, 1, 0],
        }),
      );
  }
  return merge(m);
}

/** The +Y side's stencils at `lod` (road name, marks, number; the small marks at LOD0). */
export function boxcarSideLettering(lod: 0 | 1 | 2, wrap: boolean): Mesh {
  const dirX = -1;
  const xl = -dirX * (XB + DOOR_W / 2) * 0.5;
  const out: Mesh[] = [];
  const put = (str: string, cx: number, base: number, h: number, maxWidth?: number): void => {
    out.push(
      text(str, {
        origin: [cx, SHEATH_Y, base],
        along: [dirX, 0, 0],
        up: [0, 0, 1],
        height: h,
        color: WHITE,
        align: 'centre',
        font: 'block',
        ...(maxWidth ? { maxWidth } : {}),
        ...(wrap ? { wrap } : {}),
        surface: (u, v) => face(cx + dirX * u, base + v, (h / 7) * 0.15, lod) - SHEATH_Y,
      }),
    );
  };
  put('CLINCHFIELD', xl, 3.0, 0.42, XB - DOOR_W / 2 - 0.5);
  if (lod < 2) {
    put('C.C.& O.', xl, 2.43, 0.24);
    put('8024', xl, 1.92, 0.36);
  }
  if (lod === 0) {
    put('C.C.& O.', -xl, 3.29, 0.12);
    put('8024', -xl, 3.09, 0.12);
  }
  return merge(out);
}
