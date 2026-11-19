// Station wear as vertex colour, one story per surface: rising damp darkens the brick plinth and
// the first courses; brick tone varies course by course (kiln batches) with soot under the eaves; the canopy soffit is sooted by a century of exhaust, worst at
// its track edge; the platform's coping and edge flags grow lichen and carry a dark trodden band.

import { type Mesh, type Rng, type Vec3, valueNoise } from '@developerz.ai/ts23d';

export type Shade = (p: Vec3, n: Vec3, c: Vec3) => Vec3;

/** Run `f` over every vertex colour (meshes are in asset space). */
export function shade(m: Mesh, f: Shade): Mesh {
  const colors = new Float32Array(m.colors);
  for (let i = 0; i < m.positions.length / 3; i++) {
    const at = (a: Float32Array, k: number): number => a[i * 3 + k] ?? 0;
    const p: Vec3 = [at(m.positions, 0), at(m.positions, 1), at(m.positions, 2)];
    const n: Vec3 = [at(m.normals, 0), at(m.normals, 1), at(m.normals, 2)];
    colors.set(f(p, n, [at(colors, 0), at(colors, 1), at(colors, 2)]), i * 3);
  }
  return { ...m, colors };
}

const mix = (c: Vec3, to: Vec3, w: number): Vec3 => {
  const k = Math.min(1, Math.max(0, w));
  return [c[0] + (to[0] - c[0]) * k, c[1] + (to[1] - c[1]) * k, c[2] + (to[2] - c[2]) * k];
};

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const DAMP: Vec3 = [0.06, 0.045, 0.035];
const SOOT: Vec3 = [0.03, 0.028, 0.026];
const LICHEN: Vec3 = [0.32, 0.34, 0.18];
const TROD: Vec3 = [0.12, 0.11, 0.1];

/** Brick walls: course tone (75 mm courses hashed), rising damp, soot under the eaves. */
export function brickWear(rng: Rng, o: { floor: number; eave: number }): Shade {
  const blot = valueNoise(rng.fork('brick'), { scale: 0.8, octaves: 3 });
  const tone = valueNoise(rng.fork('course'), { scale: 0.05, octaves: 1 });
  return (p, _n, c) => {
    const course = Math.floor((p[2] - o.floor) / 0.075);
    let out: Vec3 = (() => {
      const t = 1 + 0.2 * tone([course * 0.37, 0, 0]);
      return [c[0] * t, c[1] * t, c[2] * t];
    })();
    const h = p[2] - o.floor;
    out = mix(out, DAMP, 0.65 * (1 - smooth(0.35, 1.2 + 0.3 * blot(p), h)));
    out = mix(out, SOOT, 0.6 * smooth(o.eave - 1.2, o.eave - 0.2, p[2]) * (0.6 + 0.4 * blot(p)));
    return out;
  };
}

/** Canopy: the soffit and deck edge sooted, heaviest toward the track (+X) edge. */
export function canopyWear(rng: Rng, o: { wallX: number; edgeX: number }): Shade {
  const blot = valueNoise(rng.fork('canopy'), { scale: 1.5, octaves: 3 });
  return (p, n, c) => {
    const t = smooth(o.wallX, o.edgeX, p[0]);
    const under = n[2] < -0.3 ? 1 : 0.6;
    return mix(c, SOOT, (0.3 + 0.5 * t) * under * (0.7 + 0.3 * blot(p)));
  };
}

/** Platform: lichen on the coping and the edge flags, a dark trodden band along the edge. */
export function platformWear(rng: Rng, o: { edgeX: number; top: number }): Shade {
  const patch = valueNoise(rng.fork('lichen'), { scale: 0.6, octaves: 3 });
  return (p, n, c) => {
    if (p[2] < o.top - 0.15 || n[2] < 0.5) return mix(c, DAMP, 0.3 * (1 - smooth(0, 0.5, p[2])));
    const edge = 1 - smooth(0.3, 1.6, o.edgeX - p[0]);
    let out = mix(c, LICHEN, 0.6 * edge * smooth(-0.1, 0.5, patch(p)));
    const trod = 1 - smooth(0.4, 0.9, Math.abs(o.edgeX - 1.6 - p[0]));
    out = mix(out, TROD, 0.25 * trod * (0.6 + 0.4 * patch([p[0], p[1] * 3, 0])));
    return out;
  };
}
