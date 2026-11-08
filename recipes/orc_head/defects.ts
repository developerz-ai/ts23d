// Orc defects — the battle story, deliberate and measured (original design). Sculpt edits laid on
// the stage-2 skin, so each follows the real surface and blends without seams:
//   scars (raised pale tissue with a slight central crease, ≈ 3–4 % of the face's ≈ 0.03 m²):
//     1. crown → left brow, 0.10 m × 5 mm (skull.ts), 2. across the nose bridge from the left brow
//     to the right of the nose, 0.06 m × 5 mm, 3. down the right cheek, 0.05 m × 6 mm,
//     4. a notch through the left upper lip, 0.016 m × 4 mm;
//   asymmetry: the right brow sits 2 mm lower at its outer end;
//   the right ear is torn: a V notch 9 mm deep out of the rim, 60 % of the way to the tip;
//   teeth (jaw.ts): right inner lower tooth missing, right outer one crooked 10°, right tusk
//     broken 30 % short; war paint ~25 % worn off and faded (paint.ts).

import type { SculptEdit } from '@developerz.ai/ts23d';
import { clayOn, creaseOn, ell, type Surface, type V } from '../_lib/bust/kit.ts';
import { atEar } from './ears.ts';
import { C } from './palette.ts';

/** A healed scar: a raised pale ridge with a slight crease down its middle. */
function scar(s: Surface, path: readonly V[], w: number): SculptEdit[] {
  return [
    clayOn(s, path, w, w * 0.4, { mirror: false, color: C.scar, n: path.length * 5 }),
    creaseOn(s, path, w * 0.35, w * 0.12, { mirror: false, color: C.scarDeep, n: path.length * 5 }),
  ];
}

export function defectEdits(stage: number, s?: Surface): SculptEdit[] {
  if (stage < 4 || !s) return [];
  const out: SculptEdit[] = [];
  // 2. Across the nose bridge.
  out.push(
    ...scar(
      s,
      [
        [0.1, 0.034, 0.478],
        [0.118, 0.012, 0.455],
        [0.13, -0.008, 0.43],
        [0.133, -0.022, 0.415],
      ],
      0.0026,
    ),
  );
  // 3. Down the right cheek.
  out.push(
    ...scar(
      s,
      [
        [0.085, -0.074, 0.44],
        [0.1, -0.07, 0.415],
        [0.112, -0.062, 0.39],
      ],
      0.003,
    ),
  );
  // 4. Through the left upper lip.
  out.push(
    ...scar(
      s,
      [
        [0.133, 0.024, 0.386],
        [0.138, 0.026, 0.368],
      ],
      0.002,
    ),
  );
  // Asymmetry: the right brow's outer end pushed 2 mm down.
  out.push(ell([0.08, -0.08, 0.468], [0.014, 0.012, 0.006], { blend: 0.012, mirror: false }));
  out.push(
    ell([0.084, -0.062, 0.494], [0.02, 0.026, 0.007], {
      op: 'subtract',
      blend: 0.015,
      mirror: false,
    }),
  );
  // The right ear's torn notch.
  const n = atEar(0.062, 0.034, 0);
  out.push(
    ell([n[0], -n[1], n[2]], [0.006, 0.006, 0.02], {
      op: 'subtract',
      blend: 0.0012,
      mirror: false,
    }),
  );
  return out;
}
