// Cinderhorn — an original stylised fantasy drake, the gallery flagship: a program, not a preset.
// This entry wires the body-part modules into the engine contract (parts, pivots, baked motion),
// declares the budgets, the design-spec dimensions and the LOD policy. Every module sculpts its
// piece in stages (block-out → planes → features → secondary → tone); see README.md.
//   body.ts  torso + neck.ts + legs.ts + tail stump, claws, back spines, scales.ts relief/paint
//   head.ts  skull, horns.ts, teeth.ts · jaw.ts (bite pivot) · eyes.ts (aim pivots)
//   wings.ts bones + membrane panels (flap pivots) · tail.ts (swish pivot)

import {
  defineAsset,
  hex,
  type Mesh,
  normalize as norm3,
  sub as sub3,
  type Vec3,
} from '@developerz.ai/ts23d';
import { bodyMesh, flankLine } from './body.ts';
import { dragonCreases } from './creases.ts';
import { eyeMesh, GAZE_YAW } from './eyes.ts';
import { headMeshes, SOCKET_AXIS } from './head.ts';
import { mainHornSocket } from './horns.ts';
import { jawMesh } from './jaw.ts';
import { HUMERUS, JOINT } from './shoulder.ts';
import { SK, TAIL_PIVOT } from './skeleton.ts';
import { tailMesh } from './tail.ts';
import { mirrorWing, wingMeshes } from './wings.ts';

const flip = (p: Vec3): Vec3 => [p[0], -p[1], p[2]];

export const dragon = defineAsset({
  name: 'dragon',
  kind: 'creature',
  description:
    'Cinderhorn, an original stylised fantasy drake: crimson scales, cream belly plates, ringed swept-back horns, raised bat wings, spade tail; sculpted from code in ten modules',
  tags: ['character', 'creature', 'fantasy', 'dragon', 'sculpt', 'hero'],
  license: 'CC0-1.0',
  sources: [
    'recipes/dragon/README.md (design dossier: scale, shape language, palette, animal references)',
  ],
  real: {
    length: 8.7,
    width: 7.9,
    height: 4.7,
    tolerance: 0.05,
    measures: [
      {
        label: 'eye spacing (centre to centre)',
        value: 2 * SK.head.eye[1],
        axis: 'y',
        between: ['eye_l', 'eye_r'],
        source: 'README.md design spec',
      },
    ],
  },
  // Measured: LOD0 sculpt cells 4 cm body / 1.4 cm head; LOD1 8.5 / 4 cm with tube bones;
  // LOD2 25 / 14 cm with tube limbs, wings and tail.
  budget: { triangles: [200000, 45000, 4500] },
  // Sculpted anatomy the connections seam check must not flag (creases.ts says why, per region).
  creases: dragonCreases(),
  glow: [{ parts: ['eye_l', 'eye_r'], color: hex('#ffb020'), strength: 1.2 }],
  build(ctx) {
    const lod = ctx.lod;
    const { body, sockets } = bodyMesh(lod);
    ctx.part('body', body);
    ctx.part('shoulder_l', sockets[0]);
    ctx.part('shoulder_r', sockets[1]);
    const head = headMeshes(lod);
    ctx.part('head', head.head);
    // Main horns grow from bosses split off the skull; eyes sit in orbits split off the skull.
    for (const [s, side, i] of [
      ['l', 1, 0],
      ['r', -1, 1],
    ] as const) {
      // The boss is a patch split off the skull sculpt (welded over the cut), not an appendage:
      // judged as grown, its 3 cm overlap plug read as 86 % buried (QA connections warning).
      ctx.part(`horn_boss_${s}`, head.bosses[i], { connect: { as: 'welded', to: 'head' } });
      ctx.part(`horn_${s}`, head.horns[i]);
      ctx.joint(`horn_${s}_root`, {
        from: `horn_${s}`,
        to: `horn_boss_${s}`,
        ...mainHornSocket(side),
        kind: 'socket',
        tolerance: 0.5,
      });
      ctx.part(`eye_socket_${s}`, head.sockets[i]);
    }
    ctx.part('jaw', jawMesh(lod).mesh, {
      at: SK.head.hinge,
      motion: { kind: 'sway', axis: [0, 1, 0], degrees: 10, hz: 0.4, oneWay: true },
      clearOf: ['head', 'body'],
    });
    const eye = SK.head.eye;
    ctx.part('eye_l', eyeMesh(lod, GAZE_YAW), { at: eye });
    ctx.part('eye_r', eyeMesh(lod, -GAZE_YAW), { at: flip(eye) });
    for (const [s, side] of [
      ['l', 1],
      ['r', -1],
    ] as const)
      ctx.joint(`eye_${s}_orbit`, {
        from: `eye_${s}`,
        to: `eye_socket_${s}`,
        at: side === 1 ? eye : flip(eye),
        axis: [-SOCKET_AXIS[0], -SOCKET_AXIS[1] * side, -SOCKET_AXIS[2]],
        kind: 'socket',
        tolerance: 0.5,
      });
    // Wings: a flapping group per side at the shoulder joint, bones and membrane inside it.
    const wing = wingMeshes(lod);
    // Flap about the line from the shoulder joint to the thigh, where the membrane roots: the
    // membrane's body edge stays on its hinge line and never pulls off the flank. The right wing
    // mirrors the left (a reflected rotation turns the other way, so its axis is negated too).
    const flank = flankLine(0.015);
    const hingeAxis = norm3(sub3(flank[flank.length - 1] ?? JOINT, JOINT));
    for (const [s, side] of [
      ['l', 1],
      ['r', -1],
    ] as const) {
      const at: Vec3 = [JOINT[0], JOINT[1] * side, JOINT[2]];
      const m = (x: Mesh): Mesh => (side === 1 ? x : mirrorWing(x));
      const axis: Vec3 = side === 1 ? hingeAxis : [-hingeAxis[0], hingeAxis[1], -hingeAxis[2]];
      ctx.group(`wing_${s}`, {
        at,
        motion: { kind: 'sway', axis, degrees: 9, hz: 0.35 },
        clearOf: ['body', `shoulder_${s}`],
      });
      ctx.part(`wing_${s}_arm`, m(wing.arm), { parent: `wing_${s}` });
      ctx.part(`wing_${s}_membrane`, m(wing.membrane), { parent: `wing_${s}` });
      // The humerus leaves its socket here; axis from the wing into the body.
      ctx.joint(`wing_${s}_shoulder`, {
        from: `wing_${s}_arm`,
        to: `shoulder_${s}`,
        at,
        axis: [-HUMERUS[0], -HUMERUS[1] * side, -HUMERUS[2]],
        kind: 'flush',
        tolerance: 0.3,
      });
    }
    ctx.part('tail', tailMesh(lod), {
      at: TAIL_PIVOT,
      motion: { kind: 'sway', axis: [0, 0, 1], degrees: 5, hz: 0.25 },
      clearOf: ['body'],
    });
  },
});
