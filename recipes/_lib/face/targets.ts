// Spec → warp targets: every base landmark moved by the race preset's declared ratios and the
// character's age / weight, mirrored left → right, then a seeded asymmetry. The result pairs with
// `baseLandmarks()` in the same order, ready for the thin-plate warp. Pure: same spec + rng = same
// targets. Scale is NOT applied here (the bust scales the whole mesh after the warp).

import type { Rng, Vec3 } from '@developerz.ai/ts23d';
import {
  BASE_H,
  baseLandmarks,
  type LandmarkName,
  LEFT,
  MIDLINE,
  type MidName,
  mirrorY,
  type SideName,
} from './landmarks.ts';
import type { Character } from './spec.ts';

type P = [number, number, number];
const H = BASE_H;
/** Cranium centre: the scaling origin for the vault. */
const C: Vec3 = [0.05, 0, 0.745];
const EYE_GROUP: SideName[] = [
  'eye',
  'endocanthion',
  'exocanthion',
  'upperLid',
  'lowerLid',
  'brow',
  'browOuter',
  'orbitale',
];
const EAR_GROUP: SideName[] = ['earTop', 'earOut', 'earBack', 'tragion', 'earLobe'];
const LOWER: (MidName | SideName)[] = [
  'rhinion',
  'pronasale',
  'subnasale',
  'labraleSup',
  'labraleInf',
  'pogonion',
  'menton',
  'alare',
  'cheilion',
  'jawline',
  'stomionSup',
  'stomionInf',
  'lipUpper',
  'lipLower',
  'lipUpper2',
  'lipLower2',
];
/** Body anchors: no asymmetry noise (the plinth cut stays level). */
const ANCHORS = new Set<string>([
  'chest',
  'back',
  'acromion',
  'jugular',
  'trapezius',
  // Lip margins: noise would part or cross them.
  'stomionSup',
  'stomionInf',
  'lipUpper',
  'lipLower',
  'lipUpper2',
  'lipLower2',
]);

/** The left-half + midline landmarks after the race and character, before mirroring. */
export function leftTargets(c: Character): { mid: Map<MidName, P>; side: Map<SideName, P> } {
  const mid = new Map<MidName, P>(Object.entries(MIDLINE).map(([k, v]) => [k as MidName, [...v]]));
  const side = new Map<SideName, P>(Object.entries(LEFT).map(([k, v]) => [k as SideName, [...v]]));
  const g = (k: MidName | SideName): P =>
    mid.get(k as MidName) ?? side.get(k as SideName) ?? [0, 0, 0];
  const r = c.race;
  // Cranium: width, vault height above the ear line, depth behind it.
  const euryY = g('euryon')[1];
  for (const k of [
    'crown',
    'forehead',
    'vertexBack',
    'occiput',
    'parietal',
    'euryon',
    'frontotemporale',
  ] as const) {
    const p = g(k);
    p[1] *= r.cranium.width;
    if (p[2] > C[2]) p[2] = C[2] + (p[2] - C[2]) * r.cranium.height;
    if (p[0] < C[0]) p[0] = C[0] + (p[0] - C[0]) * r.cranium.depth;
  }
  // Ears ride with the cranium's side.
  for (const k of EAR_GROUP) g(k)[1] += euryY * (r.cranium.width - 1);
  // Face length below the nasion.
  const nz = g('nasion')[2];
  for (const k of LOWER) g(k)[2] = nz + (g(k)[2] - nz) * r.face;
  g('gonion')[2] = nz + (g('gonion')[2] - nz) * (1 + (r.face - 1) * 0.6);
  g('cheek')[2] = nz + (g('cheek')[2] - nz) * (1 + (r.face - 1) * 0.5);
  // Brow shelf.
  const bf = r.brow.forward * H;
  g('glabella')[0] += bf;
  g('brow')[0] += bf;
  g('browOuter')[0] += bf * 0.8;
  g('frontotemporale')[0] += bf * 0.3;
  g('nasion')[0] += bf * 0.15;
  for (const k of ['glabella', 'brow', 'browOuter'] as const) g(k)[2] += r.brow.height * H;
  // Eyes: spacing moves the whole group; tilt lifts the outer corner; opening scales the lids.
  const dy = g('eye')[1] * (r.eyes.spacing - 1);
  for (const k of EYE_GROUP) g(k)[1] += dy;
  g('exocanthion')[2] += r.eyes.tilt * H;
  g('endocanthion')[2] -= r.eyes.tilt * H * 0.3;
  g('browOuter')[2] += r.eyes.tilt * H * 0.6;
  const ez = g('eye')[2];
  g('upperLid')[2] = ez + (g('upperLid')[2] - ez) * r.eyes.open;
  g('lowerLid')[2] = ez + (g('lowerLid')[2] - ez) * r.eyes.open;
  nose(g, c);
  // Cheekbones.
  g('zygion')[1] *= r.zygoma.width;
  g('cheek')[1] *= 1 + (r.zygoma.width - 1) * 0.7;
  for (const k of ['zygion', 'cheek'] as const) g(k)[2] += r.zygoma.height * H;
  g('cheek')[0] += r.zygoma.forward * H;
  g('zygion')[0] += r.zygoma.forward * H * 0.5;
  jaw(g, c);
  body(g, c);
  character(g, c);
  return { mid, side };
}

function nose(g: (k: MidName | SideName) => P, c: Character): void {
  const n = c.race.nose;
  const sub = g('subnasale');
  const nas = g('nasion');
  const tip = g('pronasale');
  const d0 = tip[0] - sub[0];
  tip[0] = sub[0] + d0 * n.projection;
  const rh = g('rhinion');
  rh[0] = nas[0] + (rh[0] - nas[0]) * (1 + (n.projection - 1) * 0.6);
  g('alare')[0] += (n.projection - 1) * d0 * 0.3;
  for (const k of ['pronasale', 'subnasale', 'alare', 'rhinion'] as const)
    g(k)[2] = nas[2] + (g(k)[2] - nas[2]) * n.length;
  rh[0] += n.bridge * H;
  nas[0] += n.bridge * H * 0.5;
  tip[2] -= n.hook * H;
  sub[2] -= n.hook * H * 0.3;
  rh[0] += n.hook * H * 0.5;
  g('alare')[1] *= n.width;
  g('alare')[0] -= Math.max(0, n.width - 1) * 0.004;
}

function jaw(g: (k: MidName | SideName) => P, c: Character): void {
  const r = c.race;
  g('gonion')[1] *= r.jaw.width;
  g('jawline')[1] *= (1 + (r.jaw.width - 1) * 0.9) * r.chin.width;
  g('mastoid')[1] *= 1 + (r.jaw.width - 1) * 0.4;
  const d = r.jaw.drop * H;
  g('menton')[2] -= d;
  g('pogonion')[2] -= d;
  g('jawline')[2] -= d * 0.8;
  g('gonion')[2] -= d * 0.5;
  for (const k of ['labraleInf', 'stomionInf', 'lipLower', 'lipLower2'] as const)
    g(k)[2] -= d * 0.3;
  const f = r.chin.forward * H;
  g('pogonion')[0] += f;
  g('menton')[0] += f * 0.7;
  g('labraleInf')[0] += f * 0.25;
  g('jawline')[0] += f * 0.3;
  const m = r.mouth;
  g('cheilion')[1] *= m.width;
  for (const k of ['labraleSup', 'labraleInf', 'stomionSup', 'stomionInf'] as const)
    g(k)[0] += m.lips * H;
  g('labraleSup')[2] += m.lips * H * 0.3;
  g('labraleInf')[2] -= m.lips * H * 0.3;
  // Close the lips: the margins meet where the base parts them.
  const shut = 1 - (c.mouth ?? 1);
  for (const [a, b] of [
    ['stomionSup', 'stomionInf'],
    ['lipUpper', 'lipLower'],
    ['lipUpper2', 'lipLower2'],
  ] as const) {
    const gap = g(a)[2] - g(b)[2];
    g(a)[2] -= gap * 0.45 * shut;
    g(b)[2] += gap * 0.55 * shut;
  }
  const u = m.underbite * H;
  for (const k of ['labraleInf', 'stomionInf', 'lipLower', 'lipLower2'] as const) g(k)[0] += u;
  g('pogonion')[0] += u * 0.7;
  g('menton')[0] += u * 0.5;
  g('labraleSup')[0] -= u * 0.2;
}

function body(g: (k: MidName | SideName) => P, c: Character): void {
  const b = c.race.body;
  g('neck')[1] *= b.neck;
  for (const k of ['throat', 'nape'] as const) g(k)[0] = 0.03 + (g(k)[0] - 0.03) * b.neck;
  g('trapezius')[2] += b.traps * H;
  g('trapezius')[1] *= 1 + (b.neck - 1) * 0.5;
  for (const k of ['acromion', 'chest', 'back'] as const) g(k)[1] *= b.shoulders;
}

/** Age and weight, both from the measured base. */
function character(g: (k: MidName | SideName) => P, c: Character): void {
  const a = c.age * H;
  g('upperLid')[2] -= 0.01 * a;
  g('browOuter')[2] -= 0.01 * a;
  g('pronasale')[2] -= 0.012 * a;
  g('pronasale')[0] += 0.005 * a;
  g('earLobe')[2] -= 0.03 * a;
  g('gonion')[2] -= 0.01 * a;
  g('jawline')[2] -= 0.015 * a;
  g('jawline')[1] += 0.01 * a;
  g('cheek')[2] -= 0.01 * a;
  g('labraleSup')[0] -= 0.008 * a;
  g('labraleInf')[0] -= 0.008 * a;
  g('cheilion')[2] -= 0.006 * a;
  const w = c.weight * H;
  g('cheek')[1] += 0.025 * w;
  g('cheek')[0] += 0.008 * w;
  g('jawline')[1] += 0.03 * w;
  g('jawline')[2] -= 0.01 * w;
  g('gonion')[1] += 0.02 * w;
  g('neck')[1] += 0.04 * w;
  g('throat')[0] += 0.03 * w;
  g('zygion')[1] += 0.008 * w;
}

/** Base → target pairs for the warp, in `baseLandmarks()` order, asymmetry seeded from `rng`. */
export function warpPairs(
  c: Character,
  rng: Rng,
): { from: Vec3[]; to: Vec3[]; names: LandmarkName[] } {
  const { mid, side } = leftTargets(c);
  const base = baseLandmarks();
  const names = [...base.keys()];
  const amp = c.asym * 0.012 * H;
  const to = names.map((n): Vec3 => {
    const m = mid.get(n as MidName);
    const s =
      n.endsWith('_l') || n.endsWith('_r') ? side.get(n.slice(0, -2) as SideName) : undefined;
    const p: Vec3 = m ?? (s ? (n.endsWith('_r') ? mirrorY(s) : [s[0], s[1], s[2]]) : [0, 0, 0]);
    if (amp === 0 || ANCHORS.has(n.replace(/_[lr]$/, ''))) return p;
    const k = m ? 0.5 : 1;
    return [
      p[0] + rng.range(-1, 1) * amp * k,
      p[1] + rng.range(-1, 1) * amp * k * (m ? 0 : 1),
      p[2] + rng.range(-1, 1) * amp * k,
    ];
  });
  return { from: names.map((n) => base.get(n) ?? [0, 0, 0]), to, names };
}
