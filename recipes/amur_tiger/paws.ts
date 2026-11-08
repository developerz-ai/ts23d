// Paws (left; the sculpt mirrors): digitigrade cat feet. A round fore paw ~16 cm wide (adult male
// heel pad ≥ 10.5–11 cm, Miquelle et al. 2006) with four toes in an arc, the dewclaw high on the
// inner side and the carpal pad behind the wrist; a narrower oval hind paw with four toes. Toes
// are split by fur grooves; the pads are painted on the flat sole (coat.ts); the retracted claws
// are their own part: only the tips show where they leave the toe fur.

import type { IntendedCrease, Mesh, SculptEdit, Vec3 } from '@developerz.ai/ts23d';
import { merge, place } from '@developerz.ai/ts23d';
import { v3 } from '../_lib/creature/curve.ts';
import { clawHorn, hornTube } from '../_lib/creature/horn.ts';
import { CLAW } from './palette.ts';
import { SK } from './skeleton.ts';

export interface Toe {
  /** Toe (digital pad + knuckle) centre. */
  readonly at: Vec3;
  /** Forward direction of the toe (unit, in the ground plane). */
  readonly dir: Vec3;
  /** Toe radius (half its width). */
  readonly r: number;
}

interface PawSpec {
  readonly centre: Vec3;
  /** Palm half-sizes (x, y, z). */
  readonly palm: Vec3;
  /** Toe yaw (rad, + = outward for the left paw), reach from the palm centre, radius. */
  readonly toes: readonly { yaw: number; reach: number; r: number }[];
}

const FORE: PawSpec = {
  centre: SK.fore.paw,
  palm: [0.062, 0.066, 0.048],
  toes: [
    { yaw: -0.62, reach: 0.064, r: 0.026 },
    { yaw: -0.2, reach: 0.078, r: 0.029 },
    { yaw: 0.2, reach: 0.078, r: 0.029 },
    { yaw: 0.62, reach: 0.064, r: 0.026 },
  ],
};

const HIND: PawSpec = {
  centre: SK.hind.paw,
  palm: [0.058, 0.056, 0.046],
  toes: [
    { yaw: -0.58, reach: 0.058, r: 0.023 },
    { yaw: -0.19, reach: 0.07, r: 0.026 },
    { yaw: 0.19, reach: 0.07, r: 0.026 },
    { yaw: 0.58, reach: 0.058, r: 0.023 },
  ],
};

function toesOf(p: PawSpec): Toe[] {
  return p.toes.map((t) => {
    const dir: Vec3 = [Math.cos(t.yaw), Math.sin(t.yaw), 0];
    return {
      at: [p.centre[0] + dir[0] * t.reach, p.centre[1] + dir[1] * t.reach, t.r * 1.05],
      dir,
      r: t.r,
    };
  });
}

export const foreToes = (): Toe[] => toesOf(FORE);
export const hindToes = (): Toe[] => toesOf(HIND);

function paw(p: PawSpec, lod: number): SculptEdit[] {
  const c = p.centre;
  const out: SculptEdit[] = [
    // Palm: the metacarpal pad and the bones over it, domed on top.
    { shape: 'ellipsoid', at: [c[0] - 0.008, c[1], 0.05], size: p.palm, blend: 0.03 },
  ];
  for (const t of toesOf(p))
    out.push({
      shape: 'ellipsoid',
      at: t.at,
      size: [t.r * 1.15, t.r, t.r * 1.05],
      rotate: [0, 0, (Math.atan2(t.dir[1], t.dir[0]) * 180) / Math.PI],
      blend: 0.018,
    });
  if (lod < 2) {
    // Fur grooves between the toes, from the top of the paw down to the sole's edge.
    const toes = toesOf(p);
    for (let i = 0; i + 1 < toes.length; i++) {
      const a = toes[i];
      const b = toes[i + 1];
      if (!a || !b) continue;
      const m = v3.lerp(a.at, b.at, 0.5);
      const out1 = v3.norm(v3.sub(m, [c[0] - 0.01, c[1], m[2]]));
      out.push({
        shape: 'capsule',
        at: [m[0] + out1[0] * 0.012, m[1] + out1[1] * 0.012, m[2] + 0.03],
        to: [m[0] + out1[0] * 0.022, m[1] + out1[1] * 0.022, 0.012],
        size: 0.0055,
        op: 'subtract',
        blend: 0.008,
      });
    }
  }
  return out;
}

/** Fore + hind paws, the dewclaw and the carpal pad (left). */
export function pawEdits(lod: number): SculptEdit[] {
  const w = SK.fore.wrist;
  const out: SculptEdit[] = [...paw(FORE, lod), ...paw(HIND, lod)];
  if (lod < 2)
    out.push(
      // Dewclaw: the thumb, high on the inner side of the fore paw.
      {
        shape: 'ellipsoid',
        at: [w[0] + 0.025, w[1] - 0.045, 0.1],
        size: [0.022, 0.016, 0.018],
        blend: 0.015,
      },
      // Carpal pad: a small bump behind the wrist.
      { shape: 'sphere', at: [w[0] - 0.045, w[1], 0.115], size: 0.02, blend: 0.02 },
    );
  return out;
}

/** Retracted claws: only the curved tips leave the toe fur, at the front of each toe. */
function clawMeshes(lod: 0 | 1): Mesh[] {
  const segs = lod === 0 ? 6 : 3;
  const sides = lod === 0 ? 8 : 5;
  const w = SK.fore.wrist;
  const claws = [...foreToes(), ...hindToes()].map((t) => {
    const dir: Vec3 = v3.norm([t.dir[0], t.dir[1], 0.35]);
    return hornTube(
      clawHorn({
        base: v3.add(t.at, [t.dir[0] * t.r * 0.55, t.dir[1] * t.r * 0.55, -t.r * 0.05]),
        dir,
        down: [0, 0, -1],
        length: t.r * 0.8,
        radius: t.r * 0.3,
        segments: segs,
        colors: CLAW,
        curl: 95,
        tip: 0.0012,
      }),
      sides,
    );
  });
  // Dewclaw: hooked, pointing down and back on the inner side.
  claws.push(
    hornTube(
      clawHorn({
        base: [w[0] + 0.03, w[1] - 0.052, 0.098],
        dir: v3.norm([0.4, -0.3, -0.6]),
        down: [-1, 0, 0],
        length: 0.026,
        radius: 0.0075,
        segments: segs,
        colors: CLAW,
        curl: 80,
        tip: 0.0012,
      }),
      sides,
    ),
  );
  return claws;
}

/** Every claw, left and right. */
export function clawMesh(lod: 0 | 1): Mesh {
  const left = merge(clawMeshes(lod));
  return merge([left, place(left, { scale: [1, -1, 1] })]);
}

/** The fur partings between the toes, declared as intended creases (QA connections). */
export function pawCreases(): IntendedCrease[] {
  const out: IntendedCrease[] = [];
  for (const [name, c, r] of [
    ['fore', FORE.centre, 0.09],
    ['hind', HIND.centre, 0.085],
  ] as const)
    for (const [s, k] of [
      ['l', 1],
      ['r', -1],
    ] as const)
      out.push({
        name: `toes_${name}_${s}`,
        part: 'body',
        at: [c[0] + 0.04, c[1] * k, 0.035],
        radius: r,
        why: 'fur partings between the toes',
      });
  return out;
}
