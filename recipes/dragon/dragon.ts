// Cinderhorn — an original stylised fantasy drake, the gallery flagship: a program, not a preset.
// This entry wires the body-part modules into the engine contract (parts, pivots, baked motion),
// declares the budgets, the design-spec dimensions and the LOD policy. Every module sculpts its
// piece in stages (block-out → planes → features → secondary → tone); see README.md.
//   body.ts  torso + neck.ts + legs.ts + tail stump, claws, back spines; stamps.ts VDM scales,
//            scales.ts belly plates + paint
//   head.ts  skull, horns.ts, teeth.ts · jaw.ts (bite pivot) · eyes.ts (aim pivots)
//   wings.ts bones + membrane panels (flap pivots) · tail.ts (swish pivot)
//   field.ts wear: ash, soot, cinder mud, scars, the snapped horn tip, the torn wing edge
//   pose.ts  the bind skeleton's proportions (leg and neck length): every part, pivot, joint and
//            crease is carried from the bind pose the modules sculpt in to the posed skeleton

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
import { brokenTip, tornEdge, worn } from './field.ts';
import { headMeshes, SOCKET_AXIS } from './head.ts';
import { mainHornSocket } from './horns.ts';
import { jawMesh } from './jaw.ts';
import { type Family, poseMesh, posePoint } from './pose.ts';
import { HUMERUS, JOINT } from './shoulder.ts';
import { SK, TAIL_PIVOT } from './skeleton.ts';
import { tailMesh } from './tail.ts';
import { mirrorWing, wingMeshes } from './wings.ts';

const flip = (p: Vec3): Vec3 => [p[0], -p[1], p[2]];

/** A worn part's mesh and pivot carried from the bind pose to the posed skeleton (pose.ts). */
const posed = (mesh: Mesh, family: Family, far: boolean, at?: Vec3): Mesh =>
  poseMesh(worn(mesh, at, far), family, at);
/** Which pose family a part belongs to, by name (crease regions name their part). */
const familyOf = (part: string): Family =>
  part === 'body' ? 'body' : /^(head|horn|eye|jaw)/.test(part) ? 'head' : 'rigid';

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
    length: 9.2,
    width: 7.9,
    height: 4.9,
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
  // Measured: LOD0 sculpt cells 5.7 cm body / 1.6 cm head / 3 cm jaw / 5.2 cm tail / 4.2 cm wing
  // arm (149 k). The head stays at 1.6 cm: at 1.7 the horn collars and nostrils alias into seams;
  // the body's serratus grooves (3.4 cm radius) hold to 5.8 cm, where the skull's rear edge
  // shows past the coarser neck. LOD1 15 / 5.4 cm with tube bones; LOD2 25 / 16 cm with tube
  // limbs, wings and tail. Every LOD sits inside the creature band (150 k / 30 k / 4 k).
  budget: { triangles: [150000, 30000, 4000] },
  // Sculpted anatomy the connections seam check must not flag (creases.ts says why, per region).
  creases: dragonCreases().map((c) => ({ ...c, at: posePoint(c.at, familyOf(c.part)) })),
  glow: [{ parts: ['eye_l', 'eye_r'], color: hex('#ffb020'), strength: 1.2 }],
  // The raked, burnt right flank and the soot-blackened jaw to the lens; low, so the neck rises.
  hero: { azDeg: -42, elDeg: 9 },
  // Roughness split: wet corneas; polished keratin on the main horns; the scaled hide stays
  // rough, the wing membranes too.
  finishes: {
    cornea: { clearcoat: 1, clearcoatRoughness: 0.04 },
    keratin: { clearcoat: 0.6, clearcoatRoughness: 0.22 },
  },
  build(ctx) {
    const lod = ctx.lod;
    const far = lod === 2;
    const { body, sockets } = bodyMesh(lod);
    ctx.part('body', posed(body, 'body', far));
    ctx.part('shoulder_l', posed(sockets[0], 'rigid', far));
    ctx.part('shoulder_r', posed(sockets[1], 'rigid', far));
    const head = headMeshes(lod);
    ctx.part('head', posed(head.head, 'head', far));
    // Main horns grow from bosses split off the skull; eyes sit in orbits split off the skull.
    for (const [s, side, i] of [
      ['l', 1, 0],
      ['r', -1, 1],
    ] as const) {
      // The boss is a patch split off the skull sculpt (welded over the cut), not an appendage:
      // judged as grown, its 3 cm overlap plug read as 86 % buried (QA connections warning).
      ctx.part(`horn_boss_${s}`, posed(head.bosses[i], 'head', far), {
        connect: { as: 'welded', to: 'head' },
      });
      // The right horn lost its last half in a fight; the left one is chipped at the tip.
      const horn = brokenTip(head.horns[i], mainHornSocket(side).at, side === -1 ? 0.5 : 0.84);
      ctx.part(`horn_${s}`, posed(horn, 'head', far), { finish: 'keratin' });
      const socket = mainHornSocket(side);
      ctx.joint(`horn_${s}_root`, {
        from: `horn_${s}`,
        to: `horn_boss_${s}`,
        ...socket,
        at: posePoint(socket.at, 'head'),
        kind: 'socket',
        tolerance: 0.5,
        why: 'the 17 cm horn roots on a broader 27 cm bony boss (a raised base, not a peg in a hole)',
      });
      ctx.part(`eye_socket_${s}`, posed(head.sockets[i], 'head', far));
    }
    ctx.part('jaw', posed(jawMesh(lod).mesh, 'head', far, SK.head.hinge), {
      at: posePoint(SK.head.hinge, 'head'),
      motion: { kind: 'sway', axis: [0, 1, 0], degrees: 10, hz: 0.4, oneWay: true },
      clearOf: ['head', 'body'],
    });
    // The eyes ride the head rigidly: only their pivots move.
    const eye = posePoint(SK.head.eye, 'head');
    ctx.part('eye_l', eyeMesh(lod, GAZE_YAW), { at: eye, finish: 'cornea' });
    ctx.part('eye_r', eyeMesh(lod, -GAZE_YAW), { at: flip(eye), finish: 'cornea' });
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
      const bind: Vec3 = [JOINT[0], JOINT[1] * side, JOINT[2]];
      const at = posePoint(bind, 'rigid');
      const m = (x: Mesh): Mesh => (side === 1 ? x : mirrorWing(x));
      const axis: Vec3 = side === 1 ? hingeAxis : [-hingeAxis[0], hingeAxis[1], -hingeAxis[2]];
      ctx.group(`wing_${s}`, {
        at,
        motion: { kind: 'sway', axis, degrees: 9, hz: 0.35 },
        clearOf: ['body', `shoulder_${s}`],
      });
      ctx.part(`wing_${s}_arm`, posed(m(wing.arm), 'rigid', far, bind), { parent: `wing_${s}` });
      // The right wing's trailing edge is torn between the second and third fingers.
      // …and the left one, wider, between the first and second: the hero's lens sees that wing.
      // The far membrane is a few dozen triangles: a notch folds them over, so it stays whole.
      const whole = m(wing.membrane);
      const skin = far
        ? whole
        : side === -1
          ? tornEdge(whole, side, 1, 0.75, 0.9)
          : tornEdge(tornEdge(whole, side, 0, 0.85, 1.1), side, 2, 0.5, 0.55);
      ctx.part(`wing_${s}_membrane`, posed(skin, 'rigid', far, bind), { parent: `wing_${s}` });
      // The humerus leaves its socket here; axis from the wing into the body.
      ctx.joint(`wing_${s}_shoulder`, {
        from: `wing_${s}_arm`,
        to: `shoulder_${s}`,
        at,
        axis: [-HUMERUS[0], -HUMERUS[1] * side, -HUMERUS[2]],
        kind: 'flush',
      });
    }
    ctx.part('tail', posed(tailMesh(lod), 'rigid', far, TAIL_PIVOT), {
      at: posePoint(TAIL_PIVOT, 'rigid'),
      motion: { kind: 'sway', axis: [0, 0, 1], degrees: 5, hz: 0.25 },
      clearOf: ['body'],
    });
  },
});
