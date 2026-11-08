import { describe, expect, it } from 'bun:test';
import { type Asset, type AssetDefinition, compile, defineAsset } from '../core/index.ts';
import { box, cylinder } from '../primitives/index.ts';
import { flushness } from './flush.ts';
import { gapOverlay, gapZoom } from './gap-overlay.ts';
import { gaps, scanGaps } from './gaps.ts';

const grey: [number, number, number] = [0.5, 0.5, 0.5];
type IntendedGap = NonNullable<AssetDefinition['gaps']>[number];

/**
 * A closed 2 × 2 × 2 m box with an opening in its +X face, closed by a `door` panel. `slot` is
 * the gap left under the header; `proud` moves the door out in front of the frame.
 */
const cabinet = (
  o: { slot?: number; proud?: number; gaps?: readonly IntendedGap[]; spin?: boolean } = {},
): Asset =>
  defineAsset({
    name: 'cabinet',
    kind: 'prop',
    budget: { triangles: [999, 999, 999] },
    ...(o.gaps ? { gaps: o.gaps } : {}),
    build: (ctx) => {
      const slot = o.slot ?? 0;
      const frame = [
        box({ size: [2, 2, 0.2], color: grey }), // floor
        box({ size: [2, 2, 0.2], at: [0, 0, 1.8], color: grey }), // roof
        box({ size: [2, 0.2, 1.6], at: [0, 0.9, 0.2], color: grey }), // sides
        box({ size: [2, 0.2, 1.6], at: [0, -0.9, 0.2], color: grey }),
        box({ size: [0.2, 2, 1.6], at: [-0.9, 0, 0.2], color: grey }), // back
      ];
      frame.forEach((m, i) => {
        ctx.part(`frame_${i}`, m);
      });
      const door = box({ size: [0.05, 1.6, 1.6 - slot], color: grey });
      ctx.part('door', door, {
        at: [0.975 + (o.proud ?? 0), 0, 0.2],
        ...(o.spin ? { motion: { kind: 'spin' as const, axis: [1, 0, 0] as const, rps: 1 } } : {}),
      });
    },
  });

describe('gaps gate', () => {
  it('flags a 1 cm slot under the header, with where, how wide and a fix', () => {
    const found = gaps(compile(cabinet({ slot: 0.01 }), { lod: 0 }));
    expect(found.length).toBeGreaterThan(0);
    const f = found[0];
    expect(f?.gate).toBe('gaps');
    expect(f?.message).toContain("'door'");
    // Pixel-quantised (3 mm pixels): a 1 cm slot reads 0.9–1.2 cm.
    expect(f?.message).toMatch(/(0\.9|1\.[0-2]) cm slit/);
    expect(f?.message).toContain('seen from +X');
    expect(f?.fix).toContain('gaps: [{ parts:');
  });

  it('flags a see-through slit as see-through', () => {
    const scan = scanGaps(compile(cabinet({ slot: 0.02 }), { lod: 0 }));
    expect(scan.gaps.some((g) => g.parts.includes('door') && g.depth > 1)).toBe(true);
  });

  it('passes when the door fills its opening', () => {
    expect(gaps(compile(cabinet(), { lod: 0 }))).toEqual([]);
  });

  it('skips a declared slot and running clearance of a spinning part', () => {
    const declared = cabinet({ slot: 0.01, gaps: [{ parts: ['door'], why: 'vent' }] });
    expect(gaps(compile(declared, { lod: 0 }))).toEqual([]);
    const pair = cabinet({ slot: 0.01, gaps: [{ parts: ['door', 'frame_1'], why: 'vent' }] });
    expect(gaps(compile(pair, { lod: 0 }))).toEqual([]);
    const wrongPair = cabinet({ slot: 0.01, gaps: [{ parts: ['door', 'frame_4'], why: 'x' }] });
    expect(gaps(compile(wrongPair, { lod: 0 })).length).toBeGreaterThan(0);
    expect(gaps(compile(cabinet({ slot: 0.01, spin: true }), { lod: 0 }))).toEqual([]);
  });

  it('runs at LOD0 only', () => {
    expect(gaps(compile(cabinet({ slot: 0.01 }), { lod: 1 }))).toEqual([]);
  });

  it('ignores a rod beside a wall (rims must be surfaces, not members)', () => {
    const rod = defineAsset({
      name: 'rail',
      kind: 'prop',
      budget: { triangles: [999, 999, 999] },
      build: (ctx) => {
        ctx.part('wall', box({ size: [0.2, 2, 2], color: grey }));
        ctx.part(
          'rod',
          cylinder({
            radius: 0.015,
            length: 1.6,
            segments: 8,
            axis: 'z',
            at: [0.13, 0, 1],
            color: grey,
          }),
        );
      },
    });
    expect(gaps(compile(rod, { lod: 0 }))).toEqual([]);
  });

  it('draws the overlay and a zoom as PNGs', () => {
    const scan = scanGaps(compile(cabinet({ slot: 0.01 }), { lod: 0 }));
    const sig = [0x89, 0x50, 0x4e, 0x47];
    expect([...gapOverlay(scan, 120).slice(0, 4)]).toEqual(sig);
    const g = scan.gaps[0];
    if (!g) throw new RangeError('no gap');
    expect([...gapZoom(scan, g, 64).slice(0, 4)]).toEqual(sig);
  });
});

describe('flushness', () => {
  it('measures a door standing 5 cm proud of its frame, and a flush one', () => {
    const proud = flushness(compile(cabinet({ proud: 0.05 }), { lod: 0 }), 'door', 'frame_*', {
      view: '+X',
    });
    expect(proud.samples).toBeGreaterThan(0);
    expect(proud.proud).toBeCloseTo(0.05, 2);
    const flush = flushness(compile(cabinet(), { lod: 0 }), 'door', 'frame_*', { view: '+X' });
    expect(flush.step).toBeLessThan(0.003);
  });
});
