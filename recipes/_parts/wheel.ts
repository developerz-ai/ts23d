// Wheel + tyre: rounded tyre on a dished rim, spokes to a hub, tread lugs at LOD0. Spins about Y;
// origin = hub centre. Real car wheel: 0.63 m tyre on a 0.43 m (17") rim, 0.22 m wide.

import {
  box,
  cylinder,
  definePart,
  lathe,
  type Mesh,
  merge,
  place,
  type Vec2,
} from '@developerz.ai/ts23d';
import { DARK_STEEL, RUBBER, STEEL } from './shape.ts';

export const wheel = definePart({
  name: 'wheel',
  description: 'tyre on a spoked rim with a hub; tread lugs at LOD0; spins about Y',
  tags: ['vehicle', 'wheel', 'moving'],
  params: { diameter: 0.63, width: 0.22, rim: 0.43, spokes: 5, tread: true },
  schema: {
    diameter: { min: 0.1, max: 4, unit: 'm', doc: 'tyre outer diameter' },
    width: { min: 0.03, max: 1.5, unit: 'm', doc: 'tyre section width' },
    rim: { min: 0.05, max: 3.5, unit: 'm', doc: 'rim (bead seat) diameter' },
    spokes: { min: 0, max: 24, unit: 'count', doc: '0 = solid disc' },
    tread: { doc: 'raised lugs on the crown at LOD0' },
  },
  validate: (p) =>
    p.rim >= p.diameter * 0.95 ? `rim ${p.rim} m leaves no tyre inside ${p.diameter} m` : undefined,
  build(b, p) {
    const R = p.diameter / 2;
    const ri = p.rim / 2;
    const hw = p.width / 2;
    const seg = b.pick([40, 20, 10]);
    const n = b.pick([10, 6, 4]);
    // Tyre: a superellipse section, a closed counter-clockwise (r, y) loop: inner bead (−Y) →
    // crown → inner bead (+Y), closed along the rim seat.
    const tyreProfile: Vec2[] = [];
    for (let i = 0; i <= 2 * n; i++) {
      const t = -Math.PI / 2 + (i / (2 * n)) * Math.PI;
      const c = Math.cos(t);
      const s = Math.sin(t);
      tyreProfile.push([
        ri + (R - ri) * Math.abs(c) ** 0.5,
        hw * Math.sign(s) * Math.abs(s) ** 0.5,
      ]);
    }
    tyreProfile.push(tyreProfile[0] ?? [ri, -hw]);
    const tyre = lathe({
      profile: tyreProfile,
      segments: seg,
      axis: 'y',
      color: RUBBER,
      strip: 'rubber',
    });
    const rimW = hw * 0.92;
    const rimBand = lathe({
      profile: [
        [ri * 0.9, -rimW],
        [ri * 1.02, -rimW],
        [ri * 1.02, rimW],
        [ri * 0.9, rimW],
        [ri * 0.9, -rimW],
      ],
      segments: seg,
      axis: 'y',
      color: STEEL,
      strip: 'aluminium',
    });
    const hubR = ri * 0.28;
    const parts: Mesh[] = [tyre, rimBand];
    parts.push(
      cylinder({
        radius: hubR,
        length: rimW * 1.1,
        segments: b.pick([16, 10, 6]),
        axis: 'y',
        color: DARK_STEEL,
        strip: 'aluminium',
      }),
    );
    if (p.spokes === 0 || b.lod === 2) {
      parts.push(
        cylinder({
          radius: ri * 0.91,
          length: rimW * 0.5,
          segments: seg,
          axis: 'y',
          color: STEEL,
          strip: 'aluminium',
        }),
      );
    } else {
      const sl = ri * 0.9 - hubR * 0.8;
      const spoke = box({
        size: [ri * 0.16, rimW * 0.5, sl],
        at: [0, 0, hubR * 0.8],
        color: STEEL,
        strip: 'aluminium',
        bevel: b.lod === 0 ? ri * 0.02 : 0,
      });
      for (let i = 0; i < p.spokes; i++)
        parts.push(place(spoke, { pitch: (i / p.spokes) * Math.PI * 2 }));
    }
    if (p.tread && b.lod === 0) {
      const lugs = Math.round((Math.PI * p.diameter) / 0.035);
      const lug = box({
        size: [0.018, p.width * 0.36, 0.008],
        at: [0, 0, R - 0.003],
        color: RUBBER,
        strip: 'rubber',
      });
      for (let i = 0; i < lugs; i++) {
        const y = (i % 2 === 0 ? 1 : -1) * p.width * 0.2;
        parts.push(place(lug, { at: [0, y, 0], pitch: ((i + 0.5) / lugs) * Math.PI * 2 }));
      }
    }
    return merge(parts);
  },
});
