// PBR showcase: one test board for every glTF material extension ts23d writes, each exhibit on a
// pedestal with a block-letter label. Front row: lacquered car paint (red flake, blue flake, white
// solid — KHR_materials_clearcoat via paint slots), a glass ball, an ice cube, water in a bowl
// (transmission + ior + volume). Back row: velvet pouf (sheen), brushed aluminium can
// (anisotropy), heat-tinted titanium exhaust (iridescence), jelly dome (soft transmission).
// Build with `t3d build` and open <asset>.glb in a KHR-aware viewer (three.js, Babylon).

import {
  box,
  cylinder,
  defineAsset,
  hex,
  type Lod,
  lathe,
  type Mesh,
  NATURAL,
  text,
  type Vec2,
  type Vec3,
} from '@developerz.ai/ts23d';

const SLATE = hex('#2f3238');
const PLINTH = hex('#c9c5bd');
const INK = hex('#26282c');
const RED = '#a5121a';
const BLUE = '#123a8c';
const WHITE = '#e8e6e0';
const TOP = 0.16; // plinth height
const PED = 0.05; // pedestal height

/** Profile of a sphere of radius r sitting on z = 0, `n` steps pole to pole. */
const ball = (r: number, n: number): Vec2[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = (Math.PI * i) / n;
    return [r * Math.sin(a), r - r * Math.cos(a)] as Vec2;
  });

const SEG: Readonly<Record<Lod, number>> = { 0: 48, 1: 24, 2: 12 };

/** A short round pedestal at (x, y) on the plinth: every exhibit stands on one. */
function pedestal(x: number, y: number, seg: number): Mesh {
  return cylinder({
    radius: 0.09,
    length: PED,
    segments: seg,
    color: SLATE,
    at: [x, y, TOP + PED / 2],
  });
}

export const pbr_showcase = defineAsset({
  name: 'pbr_showcase',
  kind: 'prop',
  description:
    'Test board for glTF PBR extensions: clearcoat car paint, glass, ice, water, jelly, velvet sheen, brushed anisotropy, iridescent heat tint.',
  tags: ['material', 'test', 'pbr'],
  license: 'CC0-1.0',
  budget: { triangles: [40000, 12000, 3500] },
  paint: {
    red: { colour: RED, clearcoat: 1, clearcoatRoughness: 0.03, metallicFlake: 0.5 },
    blue: { colour: BLUE, clearcoat: 1, clearcoatRoughness: 0.05, metallicFlake: 0.85 },
    white: { colour: WHITE, clearcoat: 1, clearcoatRoughness: 0.02 },
  },
  finishes: {
    velvet: { roughness: 0.9, sheen: { colour: '#f0b8e0', roughness: 0.45 } },
    brushed: { metallic: 1, roughness: 0.24, anisotropy: { strength: 0.85, rotation: 0 } },
    heat_tint: {
      metallic: 1,
      roughness: 0.22,
      iridescence: { factor: 1, ior: 2.2, thickness: [80, 130] },
    },
  },
  optics: {
    glass: { thickness: 0.32, ior: 1.5 },
    ice: { thickness: 0.24 },
    liquid: { thickness: 0.06 },
    jelly: { thickness: 0.2, attenuationColour: '#ff8a9c', attenuationDistance: 0.5 },
  },
  build(ctx) {
    const seg = SEG[ctx.lod];
    const rings = Math.max(6, seg / 2);
    ctx.part('plinth', box({ size: [1.5, 4.6, TOP], at: [0, 0, 0], color: PLINTH }));
    const front = 0.38;
    const back = -0.38;
    const label = (name: string, x: number, y: number, word: string): void => {
      if (ctx.lod !== 0) return;
      ctx.part(
        name,
        // Flat on the plinth top in front of the exhibit, read from the front (+X).
        text(word, {
          origin: [x + 0.27, y, TOP],
          up: [-1, 0, 0],
          height: 0.04,
          color: INK,
          align: 'centre',
        }),
      );
    };
    const at = (i: number): number => -1.9 + i * 0.76;
    const stand = (name: string, x: number, y: number): void => {
      ctx.part(`${name}_pedestal`, pedestal(x, y, seg));
    };
    const z0 = TOP + PED;

    // Front row: three lacquered paints, then glass, ice and water.
    const paints: readonly (readonly [string, string, Vec3])[] = [
      ['red', RED, hex(RED)],
      ['blue', BLUE, hex(BLUE)],
      ['white', WHITE, hex(WHITE)],
    ];
    paints.forEach(([slot, , colour], i) => {
      const y = at(i);
      stand(`paint_${slot}`, front, y);
      ctx.part(
        `paint_${slot}`,
        lathe({ profile: ball(0.17, rings), segments: seg, color: colour, at: [front, y, z0] }),
        { paint: slot },
      );
      label(`label_paint_${slot}`, front, y, slot === 'white' ? 'white gloss' : `${slot} flake`);
    });
    stand('glass', front, at(3));
    ctx.part(
      'glass_ball',
      lathe({
        profile: ball(0.16, rings),
        segments: seg,
        color: hex('#f4f8f8'),
        strip: 'glass',
        at: [front, at(3), z0],
      }),
      { surface: 'glass' },
    );
    label('label_glass', front, at(3), 'glass');
    stand('ice', front, at(4));
    ctx.part(
      'ice_cube',
      box({
        size: [0.22, 0.22, 0.22],
        at: [front, at(4), z0],
        color: hex('#e8f4ff'),
        strip: 'glass',
      }),
      { surface: 'ice' },
    );
    label('label_ice', front, at(4), 'ice');
    // Water: a white ceramic bowl, the water surface a disc just under its rim.
    const bowl: Vec2[] = [
      [0, 0],
      [0.1, 0],
      [0.16, 0.03],
      [0.19, 0.09],
      [0.2, 0.1],
      [0.185, 0.1],
      [0.175, 0.085],
      [0.145, 0.035],
      [0.09, 0.018],
      [0, 0.018],
    ];
    stand('water', front, at(5));
    ctx.part(
      'water_bowl',
      lathe({ profile: bowl, segments: seg, color: hex('#ece8e0'), at: [front, at(5), z0] }),
    );
    ctx.part(
      'water',
      lathe({
        profile: [
          [0, 0.075],
          [0.165, 0.075],
        ],
        segments: seg,
        color: hex('#d8eef0'),
        strip: 'glass',
        at: [front, at(5), z0],
      }),
      { surface: 'liquid' },
    );
    label('label_water', front, at(5), 'water');

    // Back row: velvet, brushed aluminium, heat-tinted titanium, jelly.
    const by = (i: number): number => -1.52 + i * 1.01;
    stand('velvet', back, by(0));
    const pouf: Vec2[] = Array.from({ length: rings + 1 }, (_, i) => {
      const a = (Math.PI * i) / rings;
      return [0.19 * Math.sin(a) ** 0.6, 0.075 - 0.075 * Math.cos(a)] as Vec2;
    });
    ctx.part(
      'velvet_pouf',
      lathe({ profile: pouf, segments: seg, color: hex('#5a1f4a'), at: [back, by(0), z0] }),
      {
        finish: 'velvet',
      },
    );
    label('label_velvet', back, by(0), 'velvet');

    stand('brushed', back, by(1));
    // A lathe-turned can: brushed around its circumference (tangent = +U), so the highlight
    // stretches along the axis — the anisotropic streak.
    ctx.part(
      'brushed_can',
      cylinder({
        radius: 0.11,
        length: 0.32,
        segments: seg,
        color: NATURAL,
        strip: 'aluminium',
        at: [back, by(1), z0 + 0.16],
      }),
      { finish: 'brushed' },
    );
    label('label_brushed', back, by(1), 'brushed');

    stand('heat', back, by(2));
    const tube: Vec2[] = [
      [0.055, -0.22],
      [0.065, -0.1],
      [0.065, 0.16],
      [0.075, 0.22],
    ];
    ctx.part('heat_saddle', box({ size: [0.05, 0.16, 0.04], at: [back, by(2), z0], color: SLATE }));
    ctx.part(
      'heat_exhaust',
      lathe({
        profile: tube,
        segments: seg,
        axis: 'y',
        color: hex('#9a9aa0'),
        at: [back, by(2), z0 + 0.04 + 0.065],
      }),
      { finish: 'heat_tint' },
    );
    label('label_heat', back, by(2), 'heat tint');

    stand('jelly', back, by(3));
    const dome: Vec2[] = Array.from({ length: rings / 2 + 1 }, (_, i) => {
      const a = (Math.PI / 2) * (i / (rings / 2));
      return [0.17 * Math.cos(a), 0.15 * Math.sin(a)] as Vec2;
    });
    ctx.part(
      'jelly_dome',
      lathe({
        profile: [[0, 0], ...dome],
        segments: seg,
        color: hex('#ff9aaa'),
        strip: 'glass',
        at: [back, by(3), z0],
      }),
      { surface: 'jelly' },
    );
    label('label_jelly', back, by(3), 'jelly');
  },
});
