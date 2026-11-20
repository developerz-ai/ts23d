// The "no skin through the cloth" check: sample the body's skin on a grid wherever an outfit
// declares cloth, walk out along the skin's normal to the finished sculpt's outermost surface and
// read its colour there. A point whose outer colour is the skin tone is skin punching through the
// garment (a fold valley dipping under the skin, cloth thinner than the head pipeline's skin, a
// paint mask gone wrong). Returns those points so a test can fail on them and name where.

import type { Field } from '@developerz.ai/ts23d';
import { dmath } from '@developerz.ai/ts23d';
import type { Surface, V } from './kit.ts';

export interface SkinCheck {
  /** The finished sculpt (skin + outfit): field and colour. */
  readonly field: Field;
  readonly colorAt: (p: V) => V;
  /** The bare body the outfit lies on. */
  readonly skin: Surface;
  /** Where the outfit declares cloth (≤ 0 inside). */
  readonly covered: Field;
  readonly tone: V;
  readonly box: readonly [V, V];
  /** Grid spacing, metres. */
  readonly step: number;
}

/** Skin-coloured points on the outer surface inside the covered area (empty = the cloth holds). */
export function skinShowing(c: SkinCheck): V[] {
  const [lo, hi] = c.box;
  const out: V[] = [];
  const seen = new Set<string>();
  for (let x = lo[0]; x <= hi[0]; x += c.step)
    for (let y = lo[1]; y <= hi[1]; y += c.step)
      for (let z = lo[2]; z <= hi[2]; z += c.step) {
        const g: V = [x, y, z];
        if (Math.abs(c.skin.field(g)) > c.step) continue;
        const p = c.skin.on(g);
        // Projection that did not land on the skin (a deep crease): no verdict there.
        if (Math.abs(c.skin.field(p)) > 5e-4) continue;
        const key = p.map((v) => Math.round(v / c.step)).join(',');
        if (seen.has(key) || c.covered(p) > 0) continue;
        seen.add(key);
        // Out along the normal to the last point inside the finished sculpt.
        const n = c.skin.normal(p);
        let q: V | null = null;
        let last = p;
        for (let t = 0; t < 0.04; t += 0.0005) {
          const r: V = [p[0] + n[0] * t, p[1] + n[1] * t, p[2] + n[2] * t];
          if (c.field(r) > 0) {
            q = last;
            break;
          }
          last = r;
        }
        // The walk never left the sculpt (the normal ran into a fold of the body): no verdict.
        if (!q) continue;
        const col = c.colorAt(q);
        const d = dmath.hypot(col[0] - c.tone[0], col[1] - c.tone[1], col[2] - c.tone[2]);
        if (d < 0.06) out.push(q);
      }
  return out;
}
