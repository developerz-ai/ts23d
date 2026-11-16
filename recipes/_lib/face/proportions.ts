// Measured facial proportions as recipe checks: the ratios a portrait artist checks by eye (eye
// line at half the head, the face five eyes wide, one eye between the eyes, the nose base where
// the middle and lower thirds meet, the neck against the head, the eyeball's size and how far it
// sits behind the brow), measured on a skull-stage head's landmarks and skin field, each held to
// a sourced band. A race declares its own table (its deltas, with the reason) — the check fails
// the build (T3D_QA_CHECK) when the head leaves it.

import type { Check, CheckFinding, Field, Vec3 } from '@developerz.ai/ts23d';
import type { SkullLandmarks } from './skull.ts';

export interface Band {
  readonly lo: number;
  readonly hi: number;
  /** Where the band comes from (an anthropometric survey, an artist's canon, a declared delta). */
  readonly source: string;
}

export interface ProportionTable {
  /** Pupil height above the menton ÷ menton → vertex. */
  readonly eyeLine: Band;
  /** Eye fissure width (en–ex) ÷ head breadth (eu–eu): the face is five eyes wide. */
  readonly eyeFifth: Band;
  /** Intercanthal width (en–en) ÷ eye fissure width: one eye between the eyes. */
  readonly interocular: Band;
  /** Glabella → subnasale ÷ subnasale → menton: the middle third against the lower. */
  readonly noseThird: Band;
  /** Neck breadth half-way down the visible neck ÷ head breadth. */
  readonly neckWidth: Band;
  /** Glabella ahead of the eyeball's front, metres: the ball sits in the orbit, under the brow. */
  readonly eyeDepth: Band;
  /** Eyeball diameter, metres. */
  readonly eyeball: Band;
}

export type Proportions = Record<keyof ProportionTable, number>;

const ANSUR = 'ANSUR II (Gordon et al. 2014) male means';
const FARKAS = 'Farkas, Anthropometry of the Head and Face (1994), adult male norms';

/** Adult male human: survey means with the spread of ~2 SD (or the artist's canon where noted). */
export const HUMAN_PROPORTIONS: ProportionTable = {
  eyeLine: {
    lo: 0.45,
    hi: 0.53,
    source: `eyes at half the head (Loomis); ${ANSUR}: menton–sellion 124 mm of a 232 mm head, pupils ≈ 5 mm below sellion → 0.51`,
  },
  eyeFifth: {
    lo: 0.17,
    hi: 0.23,
    source: `${FARKAS}: en–ex 31 mm, eu–eu 151 mm → 0.21 (NASA-STD-3000 §3 head breadth 15.5 cm)`,
  },
  interocular: { lo: 0.85, hi: 1.3, source: `${FARKAS}: en–en 33 mm ÷ en–ex 31 mm → 1.05` },
  noseThird: {
    lo: 0.75,
    hi: 1.15,
    source: `${FARKAS}: g–sn ≈ 64 mm, sn–me ≈ 72 mm → 0.89 (neoclassical canon 1.0)`,
  },
  neckWidth: {
    lo: 0.66,
    hi: 0.86,
    source: `${ANSUR}: neck circumference 395 mm (≈ 120 mm breadth with the sternocleidomastoids) ÷ head breadth 157 mm → 0.76; the upper neck runs narrower`,
  },
  eyeDepth: {
    lo: 0.008,
    hi: 0.024,
    source:
      'Hertel exophthalmometry: cornea 16–18 mm ahead of the lateral orbital rim, the glabella 8–20 mm ahead of the cornea',
  },
  eyeball: {
    lo: 0.022,
    hi: 0.026,
    source: 'Bekerman et al. 2014: axial 23.5 mm, transverse 24.2 mm',
  },
};

/** First crossing of `f` going out from `from` along `dir` (unit), metres; Infinity if none. */
function reach(f: Field, from: Vec3, dir: Vec3, max = 0.5): number {
  let t = 0;
  for (let i = 0; i < 1000 && t < max; i++) {
    const p: Vec3 = [from[0] + dir[0] * t, from[1] + dir[1] * t, from[2] + dir[2] * t];
    if (f(p) > 0) return t;
    t += 0.0005;
  }
  return Infinity;
}

/** The table's ratios measured on a head: landmarks, plus the skin field for the neck. */
export function measureHead(k: SkullLandmarks, skin: Field): Proportions {
  const breadth = 2 * Math.abs(k.euryon[1]);
  const fissure = Math.abs(k.exocanthion[1] - k.endocanthion[1]);
  // Upper neck: a third of the way from the jaw angle down to the sternal notch, on its axis.
  const z = k.gonion[2] - (k.gonion[2] - k.jugular[2]) / 3;
  const at: Vec3 = [(k.throat[0] + k.nape[0]) / 2, 0, z];
  const neck = reach(skin, at, [0, 1, 0]) + reach(skin, at, [0, -1, 0]);
  return {
    eyeLine: (k.eye[2] - k.menton[2]) / (k.crown[2] - k.menton[2]),
    eyeFifth: fissure / breadth,
    interocular: (2 * Math.abs(k.endocanthion[1])) / fissure,
    noseThird: (k.glabella[2] - k.subnasale[2]) / (k.subnasale[2] - k.menton[2]),
    neckWidth: neck / breadth,
    eyeDepth: k.glabella[0] - (k.eye[0] + k.eyeR),
    eyeball: 2 * k.eyeR,
  };
}

/** One finding per ratio outside its band. */
export function proportionFindings(
  m: Proportions,
  t: ProportionTable,
  name: string,
): CheckFinding[] {
  return (Object.keys(t) as Array<keyof ProportionTable>).flatMap((key) => {
    const b = t[key];
    const v = m[key];
    return v >= b.lo && v <= b.hi
      ? []
      : [
          {
            part: 'head',
            message: `${name}: ${key} ${v.toFixed(3)} is outside ${b.lo}…${b.hi} (${b.source})`,
            fix: `move the race's FaceSpec / Character (recipes/_lib/face/spec.ts) until ${key} is back in its band; never widen a band without a source`,
          },
        ];
  });
}

/** A recipe check: the head's proportions against `t`, measured once (the head is static). */
export function proportionCheck(
  name: string,
  k: SkullLandmarks,
  skin: () => Field,
  t: ProportionTable,
): Check {
  let found: CheckFinding[] | null = null;
  return () => {
    found ??= proportionFindings(measureHead(k, skin()), t, name);
    return found;
  };
}
