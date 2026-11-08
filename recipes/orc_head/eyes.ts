// Orc eyes: the shared bust eye (../_lib/bust/eye.ts) with the orc's spec — ember eyes (dark
// amber sclera, bright iris, slit pupil) 1.3 × a human ball, a heavy scowling upper lid over 30 %
// of the iris, gaze converging 1.5 m ahead.

import type { EyeSpec } from '../_lib/bust/eye.ts';
import { L } from './landmarks.ts';
import { C } from './palette.ts';

export const ORC_EYE: EyeSpec = {
  centre: L.eye,
  r: L.eyeR,
  // Human iris/ball ratio 5.85 / 12 = 0.49, kept.
  iris: L.eyeR * 0.49,
  upper: 0.32,
  lower: 0.14,
  lid: 0.0028,
  tilt: -4,
  scowl: 12,
  pupil: 'slit',
  colours: {
    sclera: C.sclera,
    iris: C.iris,
    pupil: C.pupil,
    wet: C.wet,
    caruncle: C.caruncle,
  },
};
