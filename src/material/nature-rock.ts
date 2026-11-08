// Nature strips, rock and hard ground: layered rock face, cliff, cobblestone, asphalt, plus the
// two liquids — stylised opaque water and lava crust. Texture graphs (`tex`), height first. Lava
// glows only through a `glow` export rule (emission is a per-material glTF slot, not ORM).

import type { MaterialDef } from './material-def.ts';
import { tex } from './tex/index.ts';

type Def = MaterialDef & { readonly graph: NonNullable<MaterialDef['graph']> };

const PB = 'https://physicallybased.info';
const ALBEDO = 'https://en.wikipedia.org/wiki/Albedo';
const USGS = 'https://www.usgs.gov/media/images/sedimentary-rock-layers';

const layers = tex.strata({ thickness: 0.11, jitter: 0.7, ledge: 0.7, seed: 1 });
const layerWarp = tex.noise({ size: 1.2, seed: 2 });
const fractures = tex
  .ridged({ size: 0.25, sizeV: 0.12, octaves: 3, seed: 3 })
  .smoothstep(0.75, 0.95);
const strataH = layers.height
  .warp(layerWarp, 0.06)
  .mul(0.75)
  .add(tex.noise({ size: 0.04, octaves: 3, seed: 4 }).mul(0.25))
  .sub(fractures.mul(0.3));
export const rockStrata: Def = {
  id: 'rock_strata',
  scaleMetres: 1,
  roughness: 0.85,
  graph: tex.material({
    height: strataH,
    depth: 0.04,
    albedo: layers.id
      .warp(layerWarp, 0.06)
      .ramp([
        [0, '#6f5a48'],
        [0.3, '#8b6f55'],
        [0.55, '#a88a6a'],
        [0.8, '#b59c7c'],
        [1, '#7d6a5a'],
      ])
      .mul(strataH.remap(0.7, 1.08).clamp(0, 1.2)),
    roughness: strataH.remap(0.92, 0.8),
  }),
  description: 'Layered sandstone face: warped beds, recessed partings, cross fractures.',
  sources: [USGS],
};

const blocks = tex
  .cells({ size: 0.45, jitter: 0.9, out: 'edge', seed: 5 })
  .warp(tex.noise({ size: 0.3, seed: 6 }), 0.05);
const cliffH = blocks
  .smoothstep(0, 0.2)
  .mul(0.55)
  .add(tex.ridged({ size: 0.12, octaves: 4, seed: 7 }).mul(0.25))
  .add(tex.noise({ size: 0.03, octaves: 3, seed: 8 }).mul(0.2));
const lichen = tex.noise({ size: 0.2, seed: 9 }).smoothstep(0.62, 0.7);
export const cliff: Def = {
  id: 'cliff',
  scaleMetres: 1,
  roughness: 0.82,
  graph: tex.material({
    height: cliffH,
    depth: 0.08,
    albedo: cliffH
      .ramp([
        [0.1, '#4a4743'],
        [0.5, '#77726b'],
        [0.9, '#a19c93'],
      ])
      .mix('#8c9050', lichen.mul(0.55)),
    roughness: cliffH.remap(0.9, 0.78),
  }),
  description: 'Granite cliff: jointed blocks, ridged fractures, lichen patches.',
  sources: [ALBEDO],
};

const cobbles = tex.pebbles({ size: 0.13, radius: 0.47, jitter: 0.45, aspect: 1.25, seed: 10 });
const cobbleH = cobbles.height
  .pow(0.6)
  .mul(0.9)
  .add(tex.noise({ size: 0.02, seed: 11 }).mul(0.1));
const polish = tex.edgeWear(cobbleH, { width: 0.02, amount: 0.6, chip: 0.3 });
export const cobblestone: Def = {
  id: 'cobblestone',
  scaleMetres: 0.5,
  roughness: 0.75,
  graph: tex.material({
    height: cobbleH,
    depth: 0.035,
    albedo: cobbles.id
      .ramp([
        [0, '#5d5852'],
        [0.4, '#7c766d'],
        [0.7, '#6b625a'],
        [1, '#8a847a'],
      ])
      .mix('#4a4134', cobbles.mask.invert())
      .mul(polish.remap(1, 1.15)),
    roughness: cobbles.mask.lerp(0.95, 0.72).sub(polish.mul(0.2)).clamp(),
  }),
  description: 'Rounded cobbles set in sand: polished crowns, dark joints.',
  sources: [ALBEDO],
};

const aggregate = tex.scatter({
  size: 0.008,
  density: 0.45,
  radius: 0.35,
  shape: 'cone',
  seed: 12,
});
const asphaltCracks = tex
  .ridged({ size: 0.6, sizeV: 0.4, octaves: 3, seed: 13 })
  .smoothstep(0.9, 0.98);
export const asphalt: Def = {
  id: 'asphalt',
  scaleMetres: 0.5,
  roughness: 0.9,
  graph: tex.material({
    height: aggregate.height
      .mul(0.7)
      .add(tex.noise({ size: 0.01, seed: 14 }).mul(0.3))
      .sub(asphaltCracks.mul(0.6)),
    depth: 0.002,
    albedo: tex
      .noise({ size: 0.5, seed: 15 })
      .ramp([
        [0.2, '#3a3a3a'],
        [0.8, '#4c4b48'],
      ])
      .mix('#7e7a72', aggregate.mask.mul(aggregate.id.remap(0.3, 0.9)))
      .mix('#202020', asphaltCracks),
    roughness: aggregate.mask.lerp(0.92, 0.8),
  }),
  description: 'Worn asphalt: exposed stone aggregate, dark binder, hairline cracks.',
  sources: [ALBEDO],
};

const swell = tex
  .noise({ size: 0.35, sizeV: 0.6, seed: 16 })
  .mul(0.6)
  .add(tex.ridged({ size: 0.12, sizeV: 0.5, octaves: 2, seed: 17 }).mul(0.4));
export const water: Def = {
  id: 'water',
  scaleMetres: 0.5,
  roughness: 0.05,
  graph: tex.material({
    height: swell,
    depth: 0.01,
    albedo: swell.ramp([
      [0.2, '#163d4b'],
      [0.7, '#24596a'],
      [1, '#3f7d8a'],
    ]),
    roughness: swell.remap(0.08, 0.03),
  }),
  description: 'Opaque stylised water: teal body, wind ripples, near-mirror (PB roughness 0).',
  sources: [PB],
};

const plates = tex
  .cells({ size: 0.22, jitter: 1, out: 'edge', seed: 18 })
  .warp(tex.noise({ size: 0.15, seed: 19 }), 0.03);
const glowing = plates
  .smoothstep(0.05, 0)
  .max(tex.noise({ size: 0.4, seed: 20 }).smoothstep(0.78, 0.86));
export const lava: Def = {
  id: 'lava',
  scaleMetres: 0.5,
  roughness: 0.88,
  graph: tex.material({
    height: plates
      .smoothstep(0, 0.15)
      .mul(0.8)
      .add(tex.noise({ size: 0.02, seed: 21 }).mul(0.2)),
    depth: 0.03,
    albedo: tex
      .noise({ size: 0.05, seed: 22 })
      .ramp([
        [0, '#161413'],
        [1, '#2d2826'],
      ])
      .mix(
        glowing.ramp([
          [0, '#c2410c'],
          [1, '#ffb43a'],
        ]),
        glowing,
      ),
    roughness: glowing.lerp(0.9, 0.45),
  }),
  description:
    'Pahoehoe lava crust: charcoal-black plates over glowing orange cracks (add a glow rule for emission).',
  sources: [PB],
};
