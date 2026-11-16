// Burley diffusion: the profile is normalised, the radius sampler follows its pdf, red reaches
// farther than blue, and a disk probe on a flat skin slab returns weights that average to albedo.

import { describe, expect, it } from 'bun:test';
import { compile, defineAsset } from '../../core/index.ts';
import type { PaintedSheet } from '../../material/index.ts';
import { box } from '../../primitives/index.ts';
import { frameOrbit } from '../camera.ts';
import { OPAQUE } from '../looks.ts';
import { sheetTextures } from '../texture.ts';
import { newHit } from './bvh.ts';
import { makeSky } from './sky.ts';
import { burley, probeExit, radiusPdf, SKIN_MFP, sampleRadius, shapeScale } from './sss.ts';
import { newSurf } from './surf.ts';
import { buildWorld } from './world.ts';

describe('Burley diffusion', () => {
  it('a mis-normalised profile fails the integral (the check can fail)', () => {
    let s = 0;
    const d = 0.002;
    for (let i = 0; i < 20000; i++) {
      const r = ((i + 0.5) / 20000) * 0.2;
      s += 4 * Math.PI * r * burley(r, d) * (0.2 / 20000);
    }
    expect(Math.abs(s - 1)).toBeGreaterThan(0.5);
  });

  it('integrates to one over the plane', () => {
    let s = 0;
    const d = 0.002;
    for (let i = 0; i < 20000; i++) {
      const r = ((i + 0.5) / 20000) * 0.2;
      s += 2 * Math.PI * r * burley(r, d) * (0.2 / 20000);
    }
    expect(Math.abs(s - 1)).toBeLessThan(0.005);
  });

  it('samples radii with the pdf it reports (median check)', () => {
    const d = 0.001;
    const rs = Array.from({ length: 999 }, (_, i) => sampleRadius((i + 0.5) / 999, d)).sort(
      (a, b) => a - b,
    );
    const med = rs[499] ?? 0;
    let cdf = 0;
    const steps = 20000;
    for (let i = 0; i < steps; i++) cdf += radiusPdf(((i + 0.5) / steps) * med, d) * (med / steps);
    expect(Math.abs(cdf - 0.5)).toBeLessThan(0.01);
  });

  it('carries red farther than blue', () => {
    expect(SKIN_MFP[0] / shapeScale(0.8)).toBeGreaterThan(SKIN_MFP[2] / shapeScale(0.8));
  });

  it('a probe on a flat skin slab averages back to the albedo', () => {
    const asset = compile(
      defineAsset({
        name: 'slab',
        kind: 'character',
        budget: { triangles: [12, 12, 12] },
        build: (ctx) => ctx.part('skin', box({ size: [1, 1, 0.2], color: [0.8, 0.5, 0.4] })),
      }),
    );
    const flat = new Uint8Array(16 * 4).fill(255);
    const sheet: PaintedSheet = { size: 4, albedo: flat, normal: flat, orm: flat };
    const cam = frameOrbit(
      new Float32Array([-1, -1, 0, 1, 1, 1]),
      { azDeg: 0, elDeg: 30, fovDeg: 30, fill: 0.8 },
      16,
      16,
    );
    const sky = makeSky({ sun: [0, 0, 1], sunColor: [1, 1, 1] });
    const w = buildWorld(asset, cam, sheetTextures(sheet), { sky, floor: false });
    const s = newSurf();
    s.p.set([0, 0, 0.2]);
    s.n.set([0, 0, 1]);
    s.ng.set([0, 0, 1]);
    s.albedo.set([0.8, 0.5, 0.4]);
    s.look = OPAQUE;
    const sum = [0, 0, 0];
    const wt = new Float64Array(3);
    let n = 0;
    for (let i = 0; i < 4000; i++) {
      const ok = probeExit(
        w,
        s,
        ((i % 3) + 0.5) / 3,
        (i + 0.5) / 4000,
        (i * 0.618) % 1,
        newHit(),
        new Float64Array(3),
        new Float64Array(3),
        wt,
      );
      n++;
      if (ok) for (let k = 0; k < 3; k++) sum[k] = (sum[k] ?? 0) + (wt[k] ?? 0);
    }
    expect(Math.abs((sum[0] ?? 0) / n - 0.8)).toBeLessThan(0.05);
    expect(Math.abs((sum[2] ?? 0) / n - 0.4)).toBeLessThan(0.03);
  });
});
