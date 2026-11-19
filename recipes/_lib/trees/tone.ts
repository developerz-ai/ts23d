// Two-tone foliage: the sunlit outer crown is warmer and lighter, the shaded inner and lower crown
// cooler and darker. Each vertex is weighted by where it sits in the crown (its offset from the
// crown centre, normalised by the crown's half extents, against the sun direction), so whole
// twig cards on the sunny shoulder turn yellow-green and the cave under the crown goes blue-dark:
// a colour block that reads at hero distance, not per-vertex noise.

import { boundsOf, type Mesh, type Vec3 } from '@developerz.ai/ts23d';

export interface Tone {
  /** Multiplier at full sun (outer crown facing `sun`). */
  readonly sunny: Vec3;
  /** Multiplier at full shade (inner and far side). */
  readonly shady: Vec3;
  /** Unit-ish direction the light comes from (up and towards the hero side). */
  readonly sun: Vec3;
}

export function sunShade(m: Mesh, t: Tone): Mesh {
  const b = boundsOf(m);
  const c: Vec3 = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
  const h: Vec3 = [
    Math.max(1e-3, (b.max[0] - b.min[0]) / 2),
    Math.max(1e-3, (b.max[1] - b.min[1]) / 2),
    Math.max(1e-3, (b.max[2] - b.min[2]) / 2),
  ];
  const sl = Math.hypot(t.sun[0], t.sun[1], t.sun[2]) || 1;
  const sun: Vec3 = [t.sun[0] / sl, t.sun[1] / sl, t.sun[2] / sl];
  const colors = new Float32Array(m.colors);
  for (let i = 0; i < m.positions.length / 3; i++) {
    const o: Vec3 = [
      ((m.positions[i * 3] ?? 0) - c[0]) / h[0],
      ((m.positions[i * 3 + 1] ?? 0) - c[1]) / h[1],
      ((m.positions[i * 3 + 2] ?? 0) - c[2]) / h[2],
    ];
    const r = Math.min(1, Math.hypot(o[0], o[1], o[2]));
    const facing = (o[0] * sun[0] + o[1] * sun[1] + o[2] * sun[2]) / Math.max(1e-3, r);
    // Outer shell facing the sun → 1; core and far side → 0.
    const w = Math.min(1, Math.max(0, 0.5 + 0.5 * facing)) * r ** 0.7;
    for (let k = 0; k < 3; k++) {
      const f = (t.shady[k] ?? 1) + ((t.sunny[k] ?? 1) - (t.shady[k] ?? 1)) * w;
      colors[i * 3 + k] = Math.min(1, (colors[i * 3 + k] ?? 0) * f);
    }
  }
  return { ...m, colors };
}
