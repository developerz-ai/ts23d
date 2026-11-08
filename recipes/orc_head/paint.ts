// Orc war paint and flush: colour-only sculpt edits (op 'paint'), so they ride the skin's blend
// weights with soft edges. Flush: blood near the surface at the nose, ears, lips and brow knot.
// War paint (stage 4): three claw stripes down the left cheek, a crest stripe up the forehead,
// asymmetric on purpose, ~25 % worn off and faded (seeded).

import type { Rng, SculptEdit } from '@developerz.ai/ts23d';
import { type Surface, spline, type V } from '../_lib/bust/kit.ts';
import { atEar } from './ears.ts';
import { C } from './palette.ts';

/** A colour stroke: spheres along a stroke on the skin, as paint edits. */
function stroke(
  s: Surface,
  ctrl: readonly V[],
  r: number,
  color: V,
  soft: number,
  mirror = false,
  wear?: { readonly rng: Rng; readonly skin: V; readonly off: number; readonly fade: number },
): SculptEdit[] {
  const knots = ctrl.map((p) => s.on(p));
  let length = 0;
  for (let i = 1; i < knots.length; i++) {
    const a = knots[i - 1];
    const b = knots[i];
    if (a && b) length += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  const pts = spline(knots, Math.max(4, Math.ceil(length / (r * 0.6))));
  // Worn paint: `off` of the dabs are skipped (cracked where the skin creases and on high
  // points), and every dab is faded toward the skin by up to `fade`.
  const out: SculptEdit[] = [];
  for (const p of pts) {
    const k = wear ? wear.rng.next() : 1;
    if (wear && k < wear.off) continue;
    const f = wear ? wear.fade * wear.rng.next() : 0;
    const c: V = wear
      ? [
          color[0] + (wear.skin[0] - color[0]) * f,
          color[1] + (wear.skin[1] - color[1]) * f,
          color[2] + (wear.skin[2] - color[2]) * f,
        ]
      : color;
    out.push({ shape: 'sphere', at: p, size: r, op: 'paint', blend: soft, color: c, mirror });
  }
  return out;
}

export function warPaint(stage: number, s: Surface, rng: Rng): SculptEdit[] {
  // War paint ~20 % worn off (skipped dabs) and faded up to 30 % toward the skin.
  const worn = { rng, skin: C.skin, off: 0.2, fade: 0.3 };
  const out: SculptEdit[] = [];
  // Flush (mirrored): nose tip and wings, lips, ear rims, the scowl knot.
  out.push(
    ...stroke(
      s,
      [
        [0.14, 0, 0.405],
        [0.13, 0.03, 0.398],
      ],
      0.012,
      C.flush,
      0.012,
      true,
    ),
  );
  out.push(
    ...stroke(
      s,
      [
        [0.14, 0, 0.368],
        [0.12, 0.05, 0.362],
      ],
      0.006,
      C.lips,
      0.006,
      true,
    ),
  );
  out.push(
    ...stroke(
      s,
      [atEar(0.03, 0.03, 0), atEar(0.07, 0.025, 0), atEar(0.095, 0.016, 0)],
      0.014,
      C.earGlow,
      0.018,
      true,
    ),
  );
  if (stage < 4) return out;
  // Three claw stripes down the left cheek, over the eye.
  for (const dy of [-0.012, 0, 0.012])
    out.push(
      ...stroke(
        s,
        [
          [0.1, 0.05 + dy, 0.49],
          [0.105, 0.056 + dy, 0.43],
          [0.1, 0.064 + dy, 0.385],
        ],
        0.0038,
        C.paint,
        0.003,
        false,
        worn,
      ),
    );
  // Crest stripe up the forehead to the crown.
  out.push(
    ...stroke(
      s,
      [
        [0.11, 0, 0.49],
        [0.09, 0, 0.53],
        [0.03, 0, 0.58],
      ],
      0.006,
      C.paint,
      0.004,
      false,
      worn,
    ),
  );
  return out;
}
