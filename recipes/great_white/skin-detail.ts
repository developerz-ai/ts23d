// LOD-gated surface detail laid on the shark's skin: healed scars (design: placement and count are
// ours; pale marks of this kind show in the reference photos), the ampullae of Lorenzini as dark pores
// on the snout, nostrils with a skin flap, and the dark line and corner furrow of the mouth.

import type { Mesh, Rng, Vec3 } from '@developerz.ai/ts23d';
import { dmath } from '@developerz.ai/ts23d';
import {
  add,
  cross,
  curve3,
  even,
  loft,
  mixRgb,
  norm,
  scale,
  sub,
  TAU,
} from '../_lib/body-plan-kit.ts';
import {
  arcX,
  axisZ,
  COLOUR,
  L,
  MOUTH,
  plainPoint,
  pocketMask,
  T_EYE,
  tOf,
  undersideZ,
  xOf,
} from './anatomy.ts';
import { SKIN } from './material.ts';

type Lod = 0 | 1 | 2;

export const SCAR_COUNT = 14;
export const PORE_COUNT = 130;

const outward = (t: number, p: Vec3): Vec3 => norm([0.0001, p[1], p[2] - axisZ(t)]);
const onSkin = (t: number, a: number, lift: number): Vec3 => {
  const p = plainPoint(t, a);
  return add(p, scale(outward(t, p), lift));
};

/** A thin raised strip following (t, a) across the skin, tapering to both ends. */
function strip(
  from: readonly [number, number],
  to: readonly [number, number],
  width: number,
  color: Vec3,
  rings: number,
): Mesh {
  const at = (u: number): [number, number] => [
    from[0] + (to[0] - from[0]) * u,
    from[1] + (to[1] - from[1]) * u,
  ];
  return loft({
    us: even(0, 1, rings),
    sides: 4,
    strip: SKIN,
    point: (u, a) => {
      const [t, s] = at(u);
      const [t2, s2] = at(Math.min(1, u + 0.02));
      const [t1, s1] = at(Math.max(0, u - 0.02));
      const p = onSkin(t, s, 0);
      const out = outward(t, p);
      const along = sub(onSkin(t2, s2, 0), onSkin(t1, s1, 0));
      const across = norm(cross(along, out));
      const w = width * (0.15 + 0.85 * dmath.sin(u * Math.PI));
      return add(
        add(p, scale(across, w * dmath.cos(a))),
        scale(out, 0.0006 + 0.0008 * dmath.sin(a)),
      );
    },
    color: () => color,
  });
}

/** Healed scars on the flanks and back: single scores and parallel rake marks. */
export function scars(rng: Rng): Mesh[] {
  const r = rng.fork('scars');
  const pale = mixRgb(COLOUR.back, COLOUR.belly, 0.24);
  const out: Mesh[] = [];
  for (let i = 0; i < SCAR_COUNT; i++) {
    const side = r.next() < 0.5 ? 1 : -1;
    const t = r.range(0.31, 0.74);
    const a = r.range(0.55, 1.75);
    const length = r.range(0.07, 0.3) / L;
    const slant = r.range(-0.9, 0.9) * (length * L) * 2.2;
    const rakes = r.next() < 0.2 ? 3 : 1;
    const width = r.range(0.0025, 0.0055);
    for (let k = 0; k < rakes; k++) {
      const shift = k * 0.1;
      const start = side > 0 ? a + shift : TAU - a - shift;
      const end = start + side * slant;
      out.push(strip([t, start], [t + length, end], width, pale, 7));
    }
  }
  return out;
}

const EYE_CLEAR = 0.06;

/** Ampullae of Lorenzini: small dark pits, densest toward the snout's tip. */
export function pores(rng: Rng): Mesh[] {
  const r = rng.fork('pores');
  const eye = plainPoint(T_EYE, 1.2);
  const out: Mesh[] = [];
  while (out.length < PORE_COUNT) {
    const t = 0.006 + 0.09 * dmath.pow(r.next(), 1.5);
    const a = r.range(0.2, 2.2) * (r.next() < 0.5 ? 1 : -1);
    const c = onSkin(t, a, 0);
    const clear = dmath.hypot(c[0] - eye[0], Math.abs(c[1]) - eye[1], c[2] - eye[2]);
    if (clear < EYE_CLEAR) continue;
    const n = outward(t, c);
    const e1 = norm(cross(n, [1, 0, 0]));
    const e2 = cross(n, e1);
    const size = r.range(0.0018, 0.0034);
    out.push(
      loft({
        us: [0.2, 1],
        sides: 5,
        strip: SKIN,
        point: (u, q) => {
          const w = size * u;
          return add(
            add(c, add(scale(e1, w * dmath.cos(q)), scale(e2, w * dmath.sin(q)))),
            scale(n, 0.0005 * (1.2 - u)),
          );
        },
        color: () => COLOUR.slit,
      }),
    );
  }
  return out;
}

/** A tube along world points, flattened against the skin. */
function line(pts: readonly Vec3[], radius: number, color: Vec3, rings: number): Mesh {
  const c = curve3(pts);
  return loft({
    us: even(0, 1, rings),
    sides: 5,
    strip: SKIN,
    point: (u, a) => {
      const p = c(u);
      const along = norm(sub(c(Math.min(1, u + 0.02)), c(Math.max(0, u - 0.02))));
      const across = norm(cross(along, [0, 0, 1]));
      const w = radius * (0.25 + 0.75 * Math.sqrt(dmath.sin(u * Math.PI)));
      return add(add(p, scale(across, w * dmath.cos(a))), [0, 0, w * 0.55 * dmath.sin(a)]);
    },
    color: () => color,
  });
}

/** The dark lip line round the mouth, running on into a furrow behind each corner. */
export function mouthLine(lod: Lod): Mesh[] {
  if (lod === 2) return [];
  const lip = (y: number): Vec3 => {
    const x = arcX(y) + 0.004;
    return [x, y, undersideZ(x, y) - 0.0015];
  };
  const n = lod === 0 ? 14 : 6;
  const arc = Array.from({ length: n + 1 }, (_, i) => lip(((2 * i) / n - 1) * MOUTH.half * 0.98));
  const furrow = (side: 1 | -1): Mesh => {
    const cornerX = arcX(MOUTH.half * 0.98);
    const on = (back: number, up: number): Vec3 => {
      const t = tOf(cornerX - back);
      const p = plainPoint(t, side * (2.28 - up));
      // The furrow lies on the finished skin, which the mouth pocket has cut upward here.
      const q = add(p, scale(outward(t, p), 0.0015));
      return [q[0], q[1], q[2] + MOUTH.pocket * pocketMask(q[0], q[1])];
    };
    // It starts behind the jaw hinge: ahead of it the skin is the pocket's wall, open in a bite.
    return line(
      [on(0.064, 0.03), on(0.09, 0.09), on(0.125, 0.16), on(0.155, 0.23)],
      0.0075,
      COLOUR.slit,
      8,
    );
  };
  return [line(arc, 0.0055, COLOUR.slit, lod === 0 ? 40 : 14), furrow(1), furrow(-1)];
}

/** A nostril: a dark slit under a fold of skin, on the underside of the snout. */
export function nostril(side: 1 | -1): Mesh[] {
  const x = xOf(0.034);
  const y = 0.088 * side;
  const on = (dx: number, dy: number, lift: number): Vec3 => [
    x + dx,
    y + dy * side,
    undersideZ(x + dx, y + dy * side) - lift,
  ];
  return [
    line(
      [on(0.032, 0.012, 0.001), on(0, 0, 0.0015), on(-0.034, 0.014, 0.001)],
      0.0085,
      COLOUR.slit,
      8,
    ),
    line(
      [on(0.03, -0.002, 0.003), on(0, -0.011, 0.0042), on(-0.03, 0.002, 0.003)],
      0.0048,
      mixRgb(COLOUR.belly, COLOUR.back, 0.3),
      8,
    ),
  ];
}
