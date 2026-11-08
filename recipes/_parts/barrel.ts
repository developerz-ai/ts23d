// Barrel: a 200 L steel drum (rolling hoops, chimes, bungs) or a coopered oak cask (bulging staves,
// iron hoops). Origin = base centre. Real: ISO 15750 steel drum Ø 585 × 880 mm; 225 L barrique
// Ø ~0.70 m at the bilge, 0.95 m tall.

import { cylinder, definePart, lathe, type Mesh, merge, type Vec2 } from '@developerz.ai/ts23d';
import { NAT, PAINT_RED, ringProfile } from './shape.ts';

export const barrel = definePart({
  name: 'barrel',
  description: '200 L steel drum or coopered oak cask with iron hoops',
  tags: ['prop', 'container'],
  params: { style: 'steel' as 'steel' | 'wood', height: 0.88, diameter: 0.585 },
  schema: {
    style: { oneOf: ['steel', 'wood'] },
    height: { min: 0.2, max: 2, unit: 'm' },
    diameter: { min: 0.1, max: 1.5, unit: 'm', doc: 'end diameter (steel: body)' },
  },
  build(b, p) {
    const seg = b.pick([32, 16, 10]);
    const r = p.diameter / 2;
    const h = p.height;
    if (p.style === 'steel') {
      const prof: Vec2[] = [
        [r - 0.01, 0],
        [r + 0.004, 0.003],
        [r + 0.004, 0.018],
        [r, 0.022],
      ];
      if (b.lod < 2)
        for (const hz of [h / 3, (2 * h) / 3])
          prof.push(
            [r, hz - 0.012],
            [r + 0.008, hz - 0.004],
            [r + 0.008, hz + 0.004],
            [r, hz + 0.012],
          );
      prof.push([r, h - 0.022], [r + 0.004, h - 0.018], [r + 0.004, h - 0.003], [r - 0.01, h]);
      const meshes: Mesh[] = [
        lathe({
          profile: prof,
          segments: seg,
          caps: true,
          color: PAINT_RED,
          strip: 'steel_painted',
          uv: 'metres',
        }),
      ];
      if (b.lod === 0)
        for (const [bx, br] of [
          [r * 0.6, 0.028],
          [-r * 0.6, 0.014],
        ] as const)
          meshes.push(
            cylinder({
              radius: br,
              length: 0.006,
              at: [bx, 0, h + 0.002],
              segments: 8,
              color: PAINT_RED,
              strip: 'steel_painted',
            }),
          );
      return merge(meshes);
    }
    const bilge = r * 1.2;
    const n = b.pick([10, 6, 4]);
    const prof: Vec2[] = Array.from({ length: n + 1 }, (_, i): Vec2 => {
      const z = (i / n) * h;
      return [r + (bilge - r) * Math.sin((Math.PI * z) / h), z];
    });
    const rAt = (z: number): number => r + (bilge - r) * Math.sin((Math.PI * z) / h);
    const meshes: Mesh[] = [
      lathe({ profile: prof, segments: seg, caps: true, color: NAT, strip: 'oak', uv: 'metres' }),
    ];
    const hoops = b.lod === 2 ? [0.1, 0.9] : [0.06, 0.2, 0.8, 0.94];
    for (const f of hoops) {
      const z = f * h;
      const hr = Math.max(rAt(z - 0.02), rAt(z + 0.02));
      meshes.push(
        lathe({
          profile: ringProfile(hr - 0.006, hr + 0.004, z - 0.02, z + 0.02),
          segments: seg,
          color: NAT,
          strip: 'iron_rust',
        }),
      );
    }
    return merge(meshes);
  },
});
