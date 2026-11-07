// Boulders: four weathered rocks meshed from signed-distance fields (surface nets, smooth gradient
// normals). Each is a blocky core (smooth-unioned ellipsoids and a rounded box), cut by one or two
// fracture planes, pitted by seeded fractal noise, flattened on its bearing face at z = 0, and
// tinted with lichen on upward faces. Resolution (cell edge, m) is the LOD knob. Dossier: README.md.

import {
  type BuildContext,
  defineAsset,
  type Field,
  hex,
  sd,
  sdf,
  type Vec3,
  valueNoise,
} from '@developerz-ai/ts23d';

const STONE = hex('#8d8a84');
const DARK = hex('#5f5c58');
const LICHEN = hex('#7d8a4e');

/** Length (X), width (Y), height (Z) in metres; `cuts` fracture planes. */
const ROCKS: readonly { size: Vec3; cuts: number }[] = [
  { size: [0.6, 0.45, 0.35], cuts: 2 },
  { size: [1.0, 0.75, 0.6], cuts: 3 },
  { size: [1.6, 1.1, 0.85], cuts: 2 },
  { size: [2.4, 1.7, 1.1], cuts: 3 },
];

/** A plane through `at` with outward normal `n` (unit): negative behind it. */
const plane =
  (at: Vec3, n: Vec3): Field =>
  (p) =>
    (p[0] - at[0]) * n[0] + (p[1] - at[1]) * n[1] + (p[2] - at[2]) * n[2];

function rock(ctx: BuildContext, i: number, size: Vec3, cuts: number, y: number): void {
  const rng = ctx.rng.fork(`rock-${i}`);
  const [l, w, h] = size;
  const c: Vec3 = [0, y, h * 0.45];
  // Core: an ellipsoid mass, a rounded block offset inside it, a smaller lobe: blocky, not round.
  let f: Field = sd.smoothUnion(
    0.12 * h,
    sd.ellipsoid(c, [l * 0.5, w * 0.5, h * 0.6]),
    sd.box(
      [c[0] + rng.range(-0.1, 0.1) * l, y, c[2] - 0.05 * h],
      [l * 0.8, w * 0.75, h * 0.9],
      0.15 * h,
    ),
  );
  f = sd.smoothUnion(
    0.1 * h,
    f,
    sd.ellipsoid(
      [l * rng.range(0.15, 0.3), y + w * rng.range(-0.2, 0.2), h * 0.6],
      [l * 0.3, w * 0.35, h * 0.35],
    ),
  );
  // Fracture planes: sliced faces read as split rock.
  for (let k = 0; k < cuts; k++) {
    const nx = rng.range(-1, 1);
    const ny = rng.range(-1, 1);
    const len = Math.sqrt(nx * nx + ny * ny + 0.09) || 1;
    const n: Vec3 = [nx / len, ny / len, 0.3 / len];
    const d = rng.range(0.26, 0.36);
    f = sd.intersect(f, plane([n[0] * l * d, y + n[1] * w * d, c[2]], n));
  }
  const pits = valueNoise(rng.fork('pits'), { scale: Math.max(0.12, l * 0.18), octaves: 4 });
  const rough = sd.displace(f, pits, 0.08 * h);
  // Bearing face: cut flat at the ground.
  const field: Field = (p) => Math.max(rough(p), -p[2]);
  const pad = 0.15 * l;
  ctx.part(
    `boulder_${i}`,
    sdf({
      field,
      bounds: [
        [-l / 2 - pad, y - w / 2 - pad, 0],
        [l / 2 + pad, y + w / 2 + pad, h * 1.15],
      ],
      resolution: ctx.pick([0.035, 0.08, 0.2]) * Math.max(0.6, l / 1.6),
      // 'concrete' is the sheet's fractal-noise strip; 'stone' is coursed masonry (walls, not rock).
      strip: 'concrete',
      lipschitz: 1.6,
      color: (p, nrm) => {
        const up = Math.max(0, nrm[2]);
        const t = Math.min(1, p[2] / h);
        const base: Vec3 = [
          DARK[0] + (STONE[0] - DARK[0]) * t,
          DARK[1] + (STONE[1] - DARK[1]) * t,
          DARK[2] + (STONE[2] - DARK[2]) * t,
        ];
        const moss = up > 0.75 ? Math.min(1, (up - 0.75) * 4) * 0.8 : 0;
        return [
          base[0] + (LICHEN[0] - base[0]) * moss,
          base[1] + (LICHEN[1] - base[1]) * moss,
          base[2] + (LICHEN[2] - base[2]) * moss,
        ];
      },
    }),
  );
}

export const boulders = defineAsset({
  name: 'boulders',
  kind: 'prop',
  description:
    'Four weathered boulders (0.6–2.4 m): SDF masses, fracture cuts, noise pitting, lichen.',
  tags: ['rock', 'boulder', 'nature', 'sdf', 'scatter'],
  seed: 7,
  budget: { triangles: [40000, 9000, 2000] },
  build(ctx) {
    let y = 0;
    ROCKS.forEach(({ size, cuts }, i) => {
      rock(ctx, i, size, cuts, y + size[1] / 2);
      y += size[1] + 0.5;
    });
  },
});
