// The five heads. Each skull and jaw is sculpted in its own frame (+X to the snout, +Z up, mirrored
// across the midline), then set on the neck: brow, cheeks and snout ridges from blended forms, eye
// sockets and nostrils carved, the mouth cut open, gums and teeth in it. What makes the five different
// is each head's snout, weight and ornament: swept horns, nose horn, crest, frill, curled horns.

import {
  type BodyPlanDefinition,
  type BuildContext,
  type Field,
  type IntendedCrease,
  lathe,
  type Mesh,
  MeshBuilder,
  merge,
  type SculptEdit,
  sculptField,
  type Vec3,
} from '@developerz.ai/ts23d';
import { loft } from '../_lib/body-plan-kit.ts';
import { sculptPart } from '../_lib/creature/sculpt-part.ts';
import { HYDRA_SPEC, headFrame, JAW_HINGE, JAW_REST, NECKS } from './anatomy.ts';
import { pinKeratinAt } from './material.ts';
import {
  bossEdit,
  hornMeshes,
  hornSpecs,
  isSculpted,
  type Ornament,
  type SeatedHorn,
  seat,
  spikeEdit,
} from './ornament.ts';
import { C, lerp, noise3 } from './skin.ts';
import { inFrame, stamp } from './stamp.ts';

type Kit = Parameters<NonNullable<BodyPlanDefinition['detail']>>[2];

interface HeadStyle {
  /** Snout length past the skull, metres. */
  readonly snout: number;
  readonly width: number;
  readonly brow: number;
  readonly ornament: Ornament;
  readonly tone: Vec3;
}

export const HEAD_STYLES: readonly HeadStyle[] = [
  { snout: 0.44, width: 1, brow: 1, ornament: 'swept', tone: lerp(C.back, C.flank, 0.25) },
  { snout: 0.5, width: 0.92, brow: 1.2, ornament: 'nasal', tone: lerp(C.back, C.ochre, 0.3) },
  { snout: 0.47, width: 1.08, brow: 1.1, ornament: 'crest', tone: lerp(C.back, C.saddle, 0.15) },
  { snout: 0.4, width: 1.12, brow: 0.9, ornament: 'frill', tone: lerp(C.back, C.flank, 0.5) },
  { snout: 0.46, width: 0.98, brow: 1.3, ornament: 'curled', tone: lerp(C.back, C.ochre, 0.12) },
];

const RES: readonly number[] = [0.0115, 0.028, 0.078];
/** How round the lip edge is cut: a far mesh needs it soft to keep clean normals. */
const LIP_BLEND: readonly number[] = [0.022, 0.024, 0.045];

const style = (k: number): HeadStyle => HEAD_STYLES[k] as HeadStyle;

const skullEdits = (s: HeadStyle, back: readonly [number, number], lip: number): SculptEdit[] => {
  const nose = 0.14 + s.snout;
  const w = s.width;
  const skin = s.tone;
  const dark: Vec3 = [skin[0] * 0.6, skin[1] * 0.6, skin[2] * 0.6];
  return [
    // Block-out: braincase, the snout tapering from it, the collar over the neck.
    {
      shape: 'ellipsoid',
      at: [0.09, 0, 0.04],
      size: [0.22, 0.135 * w, 0.13],
      color: skin,
      blend: 0,
    },
    {
      shape: 'roundCone',
      at: [0.15, 0, 0.02],
      to: [nose - 0.05, 0, -0.012],
      size: [0.115 * w, 0.058 * w],
      color: skin,
      blend: 0.07,
    },
    {
      // The collar follows the neck that comes in, so it never juts out behind the skull.
      shape: 'roundCone',
      at: [0.03, 0, -0.03],
      to: [0.03 + back[0] * 0.17, 0, -0.03 + back[1] * 0.17],
      size: [0.118, 0.12],
      color: skin,
      blend: 0.06,
    },
    // Planes: jaw muscle, brow shelf, cheekbone, ridge down the snout.
    {
      shape: 'ellipsoid',
      at: [0.04, 0.115 * w, -0.03],
      size: [0.13, 0.05, 0.075],
      rotate: [0, -18, 0],
      color: skin,
      blend: 0.05,
    },
    {
      shape: 'capsule',
      at: [0.05, 0.105 * w, 0.125],
      to: [0.25, 0.082 * w, 0.082],
      size: 0.026 * s.brow,
      color: dark,
      blend: 0.05,
    },
    {
      shape: 'capsule',
      at: [0.08, 0.13 * w, -0.002],
      to: [0.27, 0.098 * w, 0.0],
      size: 0.016,
      color: skin,
      blend: 0.03,
    },
    {
      shape: 'capsule',
      at: [0.26, 0.038, 0.085],
      to: [nose - 0.1, 0.03, 0.05],
      size: 0.012,
      color: dark,
      blend: 0.055,
    },
    {
      // One boss across the midline: two mirrored bumps would meet in a groove.
      shape: 'ellipsoid',
      at: [nose - 0.07, 0, 0.05],
      size: [0.04, 0.058, 0.028],
      color: dark,
      blend: 0.035,
    },
    // Features: the eye socket and the nostril, carved.
    {
      shape: 'sphere',
      at: [0.22, 0.098 * w, 0.074],
      size: 0.04,
      op: 'subtract',
      blend: 0.032,
      color: dark,
    },
    {
      shape: 'sphere',
      at: [nose - 0.055, 0.042, 0.052],
      size: 0.0105,
      op: 'subtract',
      blend: 0.016,
      color: C.mouth,
    },
    // The mouth: everything below the lip line goes, the cut face painted as the palate.
    {
      shape: 'roundBox',
      at: [0.35, 0, -0.205],
      size: [1.3, 0.5, 0.3],
      round: 0.02,
      op: 'subtract',
      blend: lip,
      color: C.gum,
    },
  ];
};

const jawEdits = (s: HeadStyle, lip: number): SculptEdit[] => {
  const end = 0.1 + s.snout * 0.9;
  const w = s.width;
  const skin = s.tone;
  const pale: Vec3 = lerp(skin, C.belly, 0.45);
  return [
    {
      shape: 'roundCone',
      at: [0.05, 0, -0.1],
      to: [end, 0, -0.1],
      size: [0.082 * w, 0.038 * w],
      color: pale,
      blend: 0,
    },
    {
      shape: 'ellipsoid',
      at: [0.08, 0.09 * w, -0.09],
      size: [0.13, 0.05, 0.06],
      color: skin,
      blend: 0.05,
    },
    { shape: 'sphere', at: [end - 0.012, 0.012, -0.104], size: 0.021, color: pale, blend: 0.03 },
    // Hollow the mouth floor between the tooth rows, then cut level at the lip line.
    {
      shape: 'capsule',
      at: [0.12, 0, -0.05],
      to: [end - 0.04, 0, -0.07],
      size: 0.036 * w,
      op: 'subtract',
      blend: 0.02,
      color: C.mouth,
    },
    {
      shape: 'roundBox',
      at: [0.35, 0, 0.09],
      size: [1.3, 0.5, 0.3],
      round: 0.02,
      op: 'subtract',
      blend: lip,
      color: C.gum,
    },
  ];
};

/** Half-width of the mouth at distance x along the head. */
const mouthWidth = (s: HeadStyle, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - 0.15) / s.snout));
  return s.width * (0.098 + (0.04 - 0.098) * t);
};

/** A tooth along +Z, base radius 1, with a long root that stays buried in the gum. */
const toothUnit = (segments: number): Mesh =>
  lathe({
    profile: [
      [0.8, -2.2],
      [1, -1],
      [1, 0],
      [0.72, 1.1],
      [0.36, 2.1],
      [0, 3.0],
    ],
    segments,
    color: C.tooth,
  });

/** The sideways place nearest the lip where a tooth root is held by solid gum, or null. */
function gumAt(f: Field, x: number, wide: number, z: number): number | null {
  for (const k of [1, 0.94, 1.06, 0.88, 0.82, 0.76, 0.7, 0.62]) {
    const y = wide * k;
    if (f([x, y, z]) < -0.005) return y;
  }
  return null;
}

function teeth(
  k: number,
  lod: number,
  skull: Field,
  jaw: Field,
): { upper: Mesh | null; lower: Mesh | null } {
  if (lod > 1) return { upper: null, lower: null };
  const s = style(k);
  const open = JAW_REST[k] ?? 0.1;
  const unit = toothUnit(lod === 0 ? 6 : 4);
  // LOD1: a tooth every 8 cm, enough to read a toothed mouth at mid range.
  const step = lod === 0 ? 0.036 : 0.08;
  const [up, low]: [Mesh[], Mesh[]] = [[], []];
  // Teeth shorten toward the hinge, where the open mouth leaves them less room.
  const room = (x: number): number => (0.3 * (x - JAW_HINGE[0]) * Math.sin(open) + 0.012) / 3;
  for (const side of [1, -1]) {
    let i = 0;
    for (let x = 0.2; x < 0.14 + s.snout - 0.03; x += step, i++) {
      const big = i % 4 === 1 ? 1.45 : 1;
      const size = Math.min(0.0098 * big * (1 - (x / (s.snout + 0.3)) * 0.35), room(x));
      const wide = mouthWidth(s, x);
      const top = gumAt(skull, x, wide, -0.046);
      if (top !== null)
        up.push(stamp(unit, [x, top * side, -0.055], [0.1, side * 0.05, -1], size, i));
      const under = x < 0.1 + s.snout * 0.82 ? gumAt(jaw, x + 0.012, wide * 0.9, -0.07) : null;
      if (under !== null)
        low.push(
          stamp(unit, [x + 0.012, under * side, -0.06], [0.1, side * 0.07, 1], size * 0.86, i),
        );
    }
  }
  return { upper: pinKeratinAt(merge(up), 0.9), lower: pinKeratinAt(merge(low), 0.9) };
}

/** The forked tongue lying in the floor of the lower jaw, its root sunk in the mouth floor. */
function tongue(s: HeadStyle, lod: number): Mesh {
  const end = 0.1 + s.snout * 0.9 - 0.07;
  const fork = 0.78;
  const prong = (side: number): Mesh =>
    loft({
      us: Array.from({ length: lod === 0 ? 14 : 6 }, (_, i) => i / ((lod === 0 ? 14 : 6) - 1)),
      sides: lod === 0 ? 10 : 6,
      point: (u, a) => {
        const x = 0.13 + (end - 0.13) * u;
        const split = Math.max(0, (u - fork) / (1 - fork));
        const w = (0.026 - 0.012 * u) * (1 - 0.55 * split);
        const h = 0.011 * (1 - 0.5 * u);
        return [
          x,
          side * split * 0.016 + Math.cos(a) * w * (1 - 0.5 * split),
          -0.083 - 0.014 * u + Math.sin(a) * h,
        ];
      },
      color: (_p, _n, u) => lerp(C.tongue, C.mouth, 0.25 * (1 - u)),
    });
  return merge([prong(1), prong(-1)]);
}

/** The slit-pupil eye, poles on its look axis (+Z). */
function eyeUnit(segments: number, rings: number): Mesh {
  const b = new MeshBuilder();
  const rows: number[][] = [];
  for (let i = 0; i <= rings; i++) {
    const a = (i / rings) * Math.PI;
    const row: number[] = [];
    for (let j = 0; j <= segments; j++) {
      const t = (j / segments) * Math.PI * 2;
      const n: Vec3 = [Math.sin(a) * Math.cos(t), Math.sin(a) * Math.sin(t), Math.cos(a)];
      const slit = Math.abs(n[0]) < 0.14 * (1 - Math.abs(n[1]) ** 2) && n[2] > 0.62;
      const rim = Math.max(0, a / 1.2);
      const c: Vec3 = slit ? [0.01, 0.008, 0.008] : lerp(C.iris, [0.05, 0.03, 0.02], rim ** 3);
      row.push(b.vertex({ p: n, n, uv: [0, 0], color: c }));
    }
    rows.push(row);
  }
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < segments; j++) {
      const [p, q] = [rows[i] ?? [], rows[i + 1] ?? []];
      if (i > 0) b.tri(p[j] ?? 0, q[j + 1] ?? 0, p[j + 1] ?? 0);
      if (i < rings - 1) b.tri(p[j] ?? 0, q[j] ?? 0, q[j + 1] ?? 0);
    }
  return b.build();
}

const rotateAboutY = (m: Mesh, at: Vec3, a: number): Mesh => {
  const [c, s] = [Math.cos(a), Math.sin(a)];
  const turn = (x: number, z: number): [number, number] => [c * x + s * z, -s * x + c * z];
  const positions = m.positions.slice();
  const normals = m.normals.slice();
  for (let i = 0; i < positions.length; i += 3) {
    const [x, z] = turn((positions[i] ?? 0) - at[0], (positions[i + 2] ?? 0) - at[2]);
    positions[i] = x + at[0];
    positions[i + 2] = z + at[2];
    const [nx, nz] = turn(normals[i] ?? 0, normals[i + 2] ?? 0);
    normals[i] = nx;
    normals[i + 2] = nz;
  }
  return { ...m, positions, normals };
};

export interface HeadMeshes {
  readonly skull: Mesh;
  readonly jaw: Mesh;
  readonly eyes: Mesh;
  readonly horns: Mesh | null;
  readonly upperTeeth: Mesh | null;
  readonly lowerTeeth: Mesh | null;
}

/** Unit direction back down the neck in the skull's XZ plane (the skull is mirrored about Y). */
function neckComesFrom(k: number): readonly [number, number] {
  const f = headFrame(k);
  const bones = HYDRA_SPEC.chains.find((c) => c.name === `neck_${k}`)?.path ?? [];
  const before = bones.at(-2) ?? f.at;
  const d: Vec3 = [before[0] - f.at[0], before[1] - f.at[1], before[2] - f.at[2]];
  const [x, z] = [
    d[0] * f.x[0] + d[1] * f.x[1] + d[2] * f.x[2],
    d[0] * f.z[0] + d[1] * f.z[1] + d[2] * f.z[2],
  ];
  const l = Math.hypot(x, z) || 1;
  return [x / l, z / l];
}

/** A sculpt's field as the mesher sees it: authored on +Y, mirrored across the midline. */
function foldedField(edits: readonly SculptEdit[], color: Vec3): Field {
  const { field } = sculptField(edits, { color });
  return (p) => field([p[0], Math.abs(p[1]), p[2]]);
}

function buildHead(k: number, lod: number): HeadMeshes {
  const s = style(k);
  const res = RES[lod] ?? 0.075;
  const lip = LIP_BLEND[lod] ?? 0.04;
  const f = headFrame(k);
  const put = (m: Mesh): Mesh => inFrame(m, f.at, f.x, f.y, f.z);
  const mottle = (p: Vec3, c: Vec3): Vec3 => {
    if (lod === 2) return c;
    const n = noise3([p[0] * 22 + k * 3, Math.abs(p[1]) * 22, p[2] * 22]);
    const fine = noise3([p[0] * 70, Math.abs(p[1]) * 70, p[2] * 70]);
    return lerp(
      lerp(c, C.saddle, Math.max(0, n - 0.5) * 1.1),
      C.flank,
      Math.max(0, fine - 0.58) * 0.9,
    );
  };
  const part = (edits: readonly SculptEdit[], cell = res): Mesh =>
    sculptPart({ edits, res: cell, color: s.tone, mirror: true, paint: mottle }).mesh;
  // The jaw has no ornament to hold: a coarser cell up close keeps its triangles for the skulls.
  const jawRes = lod === 0 ? 0.0165 : res;
  const plain = skullEdits(s, neckComesFrom(k), lip);
  const bare = foldedField(plain, s.tone);
  const horns: SeatedHorn[] = hornSpecs(s.ornament, s.snout, lod).map((h) => seat(h, bare));
  // Bosses go in before the sockets and the mouth are carved: the last edits stay the cuts.
  const carved = plain.filter((e) => 'op' in e && e.op === 'subtract');
  const solid = plain.filter((e) => !carved.includes(e));
  const grown = horns.filter((h) => isSculpted(h, lod));
  const set = horns.filter((h) => !isSculpted(h, lod));
  const skullForm = [
    ...solid,
    ...set.map((h) => bossEdit(h, s.tone)),
    ...grown.map(spikeEdit),
    ...carved,
  ];
  // Far away the jaw is a solid wedge: a hollow it cannot resolve only breaks its normals.
  const jawForm = jawEdits(s, lip).filter(
    (e) => lod < 2 || !('shape' in e && e.shape === 'capsule' && e.op === 'subtract'),
  );
  const open = JAW_REST[k] ?? 0.1;
  const { upper, lower } = teeth(
    k,
    lod,
    foldedField(skullForm, s.tone),
    foldedField(jawForm, s.tone),
  );
  const eye = eyeUnit(lod === 0 ? 14 : 8, lod === 0 ? 10 : lod === 1 ? 6 : 4);
  const eyes = [1, -1].map((side) =>
    stamp(eye, [0.225, side * 0.092 * s.width, 0.07], [0.3, side * 0.9, 0.16], 0.031),
  );
  return {
    skull: put(part(skullForm)),
    jaw: put(
      rotateAboutY(
        lod < 2 ? merge([part(jawForm, jawRes), tongue(s, lod)]) : part(jawForm, jawRes),
        JAW_HINGE,
        open,
      ),
    ),
    eyes: put(merge(eyes)),
    // Head 0 lost the tip of its camera-side swept horn in a fight.
    horns:
      set.length > 0
        ? put(merge(set.flatMap((h, i) => hornMeshes(h, lod, k === 0 && i === 0))))
        : null,
    upperTeeth: upper ? put(upper) : null,
    lowerTeeth: lower ? put(rotateAboutY(lower, JAW_HINGE, open)) : null,
  };
}

export function hydraHeads(ctx: BuildContext, kit: Kit): void {
  const skulls: Mesh[] = [];
  const jaws: Mesh[] = [];
  const eyes: Mesh[] = [];
  const horns: Mesh[] = [];
  const teethAll: Mesh[] = [];
  for (let k = 0; k < NECKS; k++) {
    const h = buildHead(k, ctx.lod);
    const [head, jawBone] = [`head_${k}_0`, `jaw_${k}_0`];
    skulls.push(kit.bindBone(h.skull, head));
    jaws.push(kit.bindBone(h.jaw, jawBone));
    eyes.push(kit.bindBone(h.eyes, head));
    if (h.horns) horns.push(kit.bindBone(h.horns, head));
    if (h.upperTeeth) teethAll.push(kit.bindBone(h.upperTeeth, head));
    if (h.lowerTeeth) teethAll.push(kit.bindBone(h.lowerTeeth, jawBone));
  }
  ctx.part('heads', merge(skulls), { paint: 'skin' });
  ctx.part('jaws', merge(jaws), { paint: 'skin' });
  ctx.part('eyes', merge(eyes));
  if (horns.length > 0) ctx.part('horns', merge(horns));
  if (teethAll.length > 0) ctx.part('teeth', merge(teethAll));
}

/** The folds a head really has, as small regions in its own frame: nostril rims, the brow over the
 *  eye, the groove between the horn roots on the crown. */
export function headCreases(k: number): IntendedCrease[] {
  const s = style(k);
  const f = headFrame(k);
  const at = (p: Vec3): Vec3 => [
    f.at[0] + f.x[0] * p[0] + f.y[0] * p[1] + f.z[0] * p[2],
    f.at[1] + f.x[1] * p[0] + f.y[1] * p[1] + f.z[1] * p[2],
    f.at[2] + f.x[2] * p[0] + f.y[2] * p[1] + f.z[2] * p[2],
  ];
  const paired = (name: string, p: Vec3, radius: number, why: string): IntendedCrease[] =>
    ([1, -1] as const).map((side) => ({
      name: `${name}_${k}_${side > 0 ? 'l' : 'r'}`,
      part: 'heads',
      at: at([p[0], p[1] * side, p[2]]),
      radius,
      why,
    }));
  return [
    ...paired('nostril', [s.snout + 0.085, 0.04, 0.052], 0.04, 'the rim of a carved nostril'),
    // Only the heads whose brow or horn roots actually fold: the rest need no excuse.
    ...(s.ornament === 'nasal'
      ? paired('brow', [0.238, 0.08, 0.118], 0.024, 'the brow shelf folding over the eye socket')
      : []),
    ...(s.ornament === 'swept' || s.ornament === 'curled'
      ? [
          {
            name: `crown_${k}`,
            part: 'heads',
            at: at([0, 0, 0.178]),
            radius: 0.06,
            why: 'the groove along the midline of the crown, between the two horn roots',
          },
        ]
      : []),
    ...ornamentFolds(s.ornament, k, at),
  ];
}

/** The webbing a row of grown spikes leaves between its roots. */
function ornamentFolds(o: Ornament, k: number, at: (p: Vec3) => Vec3): IntendedCrease[] {
  const fold = (name: string, p: Vec3, radius: number, why: string): IntendedCrease => ({
    name: `${name}_${k}`,
    part: 'heads',
    at: at(p),
    radius,
    why,
  });
  const both = (name: string, p: Vec3, radius: number, why: string): IntendedCrease[] => [
    fold(`${name}_l`, p, radius, why),
    fold(`${name}_r`, [p[0], -p[1], p[2]], radius, why),
  ];
  if (o === 'crest')
    return [fold('crest_web', [0.02, 0, 0.27], 0.14, 'skin webbing between the crest spikes')];
  if (o === 'frill')
    return [
      ...both('frill_web', [-0.13, 0.12, 0.21], 0.12, 'skin webbing between the frill spikes'),
      ...both('frill_rim', [-0.19, 0.235, 0.14], 0.1, 'skin webbing at the outer frill spikes'),
    ];
  if (o === 'nasal')
    return [
      ...both('brow_spikes', [0.01, 0.145, 0.21], 0.1, 'the fold round the brow spike roots'),
      fold('snout_groove', [0.377, 0, 0.091], 0.05, 'the groove between the two snout ridges'),
    ];
  return [];
}
