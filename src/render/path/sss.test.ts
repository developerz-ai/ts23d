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
        0.5,
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

  it('light crosses a thin sheet of skin (an ear lit from behind glows red)', () => {
    // A 3 mm sheet: probes from its top face must also find exits on its bottom face, weighted
    // reddest (red's mean free path is the longest), with the exit's normal turned outward (down).
    const T = 0.003;
    const asset = compile(
      defineAsset({
        name: 'ear',
        kind: 'character',
        budget: { triangles: [12, 12, 12] },
        build: (ctx) => ctx.part('skin', box({ size: [0.2, 0.2, T], color: [0.8, 0.5, 0.4] })),
      }),
    );
    const flat = new Uint8Array(16 * 4).fill(255);
    const sheet: PaintedSheet = { size: 4, albedo: flat, normal: flat, orm: flat };
    const cam = frameOrbit(
      new Float32Array([-0.1, -0.1, 0, 0.1, 0.1, T]),
      { azDeg: 0, elDeg: 30, fovDeg: 30, fill: 0.8 },
      16,
      16,
    );
    const sky = makeSky({ sun: [0, 0, 1], sunColor: [1, 1, 1] });
    const w = buildWorld(asset, cam, sheetTextures(sheet), { sky, floor: false });
    const s = newSurf();
    s.p.set([0, 0, T]);
    s.n.set([0, 0, 1]);
    s.ng.set([0, 0, 1]);
    s.albedo.set([0.8, 0.5, 0.4]);
    s.look = OPAQUE;
    const back = [0, 0, 0];
    let crossed = 0;
    const hit = newHit();
    const po = new Float64Array(3);
    const pd = new Float64Array(3);
    const wt = new Float64Array(3);
    const N = 3000;
    for (let i = 0; i < N; i++) {
      const side = probeExit(
        w,
        s,
        ((i % 3) + 0.5) / 3,
        (i + 0.5) / N,
        (i * 0.618) % 1,
        (i * 0.7548) % 1,
        hit,
        po,
        pd,
        wt,
      );
      const z = (po[2] ?? 0) + (pd[2] ?? 0) * hit.t;
      if (side !== 0 && z < T / 2) {
        crossed++;
        expect(side).toBe(-1);
        for (let k = 0; k < 3; k++) back[k] = (back[k] ?? 0) + (wt[k] ?? 0);
      }
    }
    expect(crossed).toBeGreaterThan(N / 20);
    expect(back[0] ?? 0).toBeGreaterThan((back[2] ?? 0) * 2);
  });

  it('exits only where skin meets air, facing out by winding (D515)', () => {
    // A skin shell 0.3 mm over a body (scales over a snake, a lid over an eye): the probe from the
    // shell's top meets two outward faces in a row. Counting crossings called the second one a far
    // face and turned its normal into the body; and the body's faces lie inside the shell, so
    // exiting there summed the same light twice. Both gave single-pixel colour grain.
    const T = 0.01;
    const lift = 0.0003;
    const asset = compile(
      defineAsset({
        name: 'shell',
        kind: 'character',
        budget: { triangles: [24, 24, 24] },
        build: (ctx) => {
          ctx.part('body', box({ size: [0.2, 0.2, T], color: [0.8, 0.5, 0.4] }));
          ctx.part(
            'scales',
            box({ size: [0.2 + 2 * lift, 0.2 + 2 * lift, T + lift], color: [0.8, 0.5, 0.4] }),
          );
        },
      }),
    );
    const flat = new Uint8Array(16 * 4).fill(255);
    const sheet: PaintedSheet = { size: 4, albedo: flat, normal: flat, orm: flat };
    const cam = frameOrbit(
      new Float32Array([-0.1, -0.1, 0, 0.1, 0.1, T]),
      { azDeg: 0, elDeg: 30, fovDeg: 30, fill: 0.8 },
      16,
      16,
    );
    const sky = makeSky({ sun: [0, 0, 1], sunColor: [1, 1, 1] });
    const w = buildWorld(asset, cam, sheetTextures(sheet), { sky, floor: false });
    const top = T + lift;
    const s = newSurf();
    s.p.set([0, 0, top]);
    s.n.set([0, 0, 1]);
    s.ng.set([0, 0, 1]);
    s.albedo.set([0.8, 0.5, 0.4]);
    s.look = OPAQUE;
    const hit = newHit();
    const po = new Float64Array(3);
    const pd = new Float64Array(3);
    const wt = new Float64Array(3);
    let inner = 0;
    let wrong = 0;
    let exits = 0;
    const N = 3000;
    for (let i = 0; i < N; i++) {
      const side = probeExit(
        w,
        s,
        ((i % 3) + 0.5) / 3,
        (i + 0.5) / N,
        (i * 0.618) % 1,
        (i * 0.7548) % 1,
        hit,
        po,
        pd,
        wt,
      );
      if (side === 0) continue;
      exits++;
      const z = (po[2] ?? 0) + (pd[2] ?? 0) * hit.t;
      // Tops (shell or body) face up, out of the skin: +1. Bottoms face down: −1.
      const want = z > T / 2 ? 1 : -1;
      if (Math.abs(z - (top - lift)) < lift / 2) inner++;
      if (side !== want) wrong++;
    }
    expect(exits).toBeGreaterThan(N / 2);
    expect(inner).toBe(0);
    expect(wrong).toBe(0);
  });
});
