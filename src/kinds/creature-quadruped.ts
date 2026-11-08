// Quadruped (and winged = quadruped + wings) landmarks from a few proportions. The trunk length is
// solved so nose → tail root equals the declared head-body length. Side-view anatomy:
//   topline   withers highest over the shoulders, a slight dip behind them, the loin, the croup
//             sloping a little to the tail root (the trunk masses' tops, not a straight tube)
//   underline the deep chest (brisket at H − depth, the elbow level with it), rising to the tucked
//             waist (`build.tuck` = abdomen depth ÷ chest depth) in front of the thigh
//   legs      creature-quadruped-legs.ts; neck from the chest up-forward; tail from the croup
// Wings: a raised bat/dragon wing, planar, from the withers.

import type { Vec3 } from '../core/index.ts';
import { type Bones, feet, type HeadFrame, headToWorld, type Wing } from './creature-bones.ts';
import { v3 } from './creature-curve.ts';
import { polygonArea, sizes, tailChain } from './creature-layout.ts';
import { foreLeg, hindLeg, type LegFrame } from './creature-quadruped-legs.ts';
import { tube } from './creature-skin.ts';
import type { CreatureSpec } from './creature-spec.ts';

const deg = Math.PI / 180;

export function quadrupedBones(s: CreatureSpec): Bones {
  const z = sizes(s);
  const { H, L } = z;
  const D = (s.build?.depth ?? 0.45) * H;
  const W = (s.build?.width ?? 0.62) * D;
  const tuck = s.build?.tuck ?? 0.72;
  const zc = H - D / 2;
  const a = (s.pose?.neck ?? 40) * deg;
  // Neck base in front of the withers, low between the shoulders (C7 sits deep in the chest).
  const neckBase: Vec3 = [0.08 * H, 0, zc + 0.08 * D];
  const atlas0 = v3.add(neckBase, [Math.cos(a) * z.neckLen, 0, Math.sin(a) * z.neckLen]);
  const head0: HeadFrame = {
    atlas: atlas0,
    pitch: z.pitch,
    length: z.headLen,
    width: z.headWidth,
    height: z.headWidth * 0.85,
    beak: false,
  };
  const nose0 = headToWorld(head0, [z.headLen * 0.97, 0, -0.08 * z.headLen]);
  const tailZ = H - 0.13 * D;
  const run = Math.sqrt(Math.max(0, L * L - (nose0[2] - tailZ) ** 2));
  const T = Math.max(0.3 * L, run - nose0[0]);
  // Withers at +0.48 T, tail root at −0.52 T: the trunk is centred on x = 0.
  const xw = 0.48 * T;
  const off: Vec3 = [xw, 0, 0];
  const head: HeadFrame = { ...head0, atlas: v3.add(atlas0, off) };
  const xh = xw - 0.9 * T;
  const tailRoot: Vec3 = [xh - 0.1 * T, 0, tailZ];
  const r = z.limbR;
  const coat = s.coat ?? ((s.surface ?? 'fur') === 'fur' ? 0.02 : 0);
  const frame: LegFrame = { xw, xh, T, H, D, y: W * 0.34, r, fur: coat };
  const legs = [foreLeg(z.stance, frame), hindLeg(z.stance, frame)];
  // Topline heights: withers, the dip behind them, the croup.
  const dip = H - 0.04 * H;
  const croup = H - 0.03 * H;
  const dl = D * tuck;
  const dp = D * 0.78;
  const trunk = [
    // Ribcage: egg-shaped in side view, pitched so the sternum runs forward-down and the
    // front-top stays clear for the neck to rise out of.
    {
      at: [xw - 0.13 * T, 0, H - 0.035 * H - D / 2] as Vec3,
      r: [0.34 * T, W / 2, D / 2] as Vec3,
      rotate: [0, 6, 0] as Vec3,
    },
    // Loin: long enough to run forward under the withers, so its top meets the ribcage
    // tangentially (a short loin left a fold across the back behind the shoulders).
    { at: [xw - 0.5 * T, 0, dip - dl / 2] as Vec3, r: [0.4 * T, W * 0.46, dl / 2] as Vec3 },
    { at: [xh + 0.04 * T, 0, croup - dp / 2] as Vec3, r: [0.21 * T, W * 0.4, dp / 2] as Vec3 },
  ];
  const neckEnd = head.atlas;
  const neck = tube(
    [
      [xw - 0.05 * T, 0, zc + 0.05 * D],
      v3.add(neckBase, off),
      v3.lerp(v3.add(neckBase, off), neckEnd, 0.6),
      neckEnd,
    ],
    (t) => Math.min(D * 0.36, W * 0.42) * (1 - t) + z.headWidth * 0.48 * t,
  );
  const tailR = Math.max(0.25 * r, 0.42 * r * (s.build?.tailGirth ?? 1));
  const wings: Wing[] = s.skeleton === 'winged' ? [wingOf(s, xw, T, W, H, r)] : [];
  return {
    skeleton: s.skeleton,
    stance: z.stance,
    mass: s.mass,
    height: H,
    limbR: r,
    trunk,
    chain: [],
    spine: [tailRoot, [xh, 0, croup], [xw - 0.5 * T, 0, dip], [xw, 0, H]],
    neck,
    tail:
      z.tailLen > 0
        ? tailChain(
            tailRoot,
            z.tailLen,
            tailR,
            s.pose?.tail ?? (s.skeleton === 'winged' ? 'level' : 'hang'),
            (s.build?.tailGirth ?? 1) >= 1.8 ? 1 : 0,
          )
        : [],
    head,
    legs,
    wings,
    fins: [],
    ground: feet(legs),
    mirror: true,
    nose: headToWorld(head, [z.headLen * 0.97, 0, -0.08 * z.headLen]),
    tailRoot,
  };
}

/** A raised bat/dragon wing, planar: humerus up from the withers, forearm forward to the wrist,
 *  three fingers fanning back; the membrane spans fingers → flank. Built in the wing plane
 *  (u back along the body, w out along the span, lifted 50° above level) so it is truly flat. */
function wingOf(s: CreatureSpec, xw: number, T: number, W: number, H: number, lr: number): Wing {
  const half = (s.wingspan ?? 2.2 * s.length) / 2;
  const root: Vec3 = [xw - 0.05 * T, W * 0.3, H - 0.02 * H];
  const lift = 50 * deg;
  const e2: Vec3 = [0, Math.cos(lift), Math.sin(lift)];
  const at = (u: number, w: number): Vec3 => v3.add(root, v3.add([-u, 0, 0], v3.mul(e2, w)));
  const elbow = at(0.3 * T, 0.32 * half);
  const wrist = at(-0.08 * T, 0.6 * half);
  const tips = [at(0.25 * T, 1.0 * half), at(0.75 * T, 0.8 * half), at(1.0 * T, 0.42 * half)];
  const flank = at(0.85 * T, 0.04 * half);
  const r = Math.max(0.02 * half, 0.25 * lr);
  const arm = [
    { at: root, r },
    { at: elbow, r: r * 0.8 },
    { at: wrist, r: r * 0.6 },
  ];
  const membrane = [root, elbow, wrist, ...tips, flank];
  return { arm, tips, membrane, area: polygonArea(membrane), folded: false };
}
