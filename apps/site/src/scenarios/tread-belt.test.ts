import { describe, expect, it } from 'bun:test';
import { TreadBelt } from './tread-belt.ts';

// A stadium belt 4 m long round two 0.5 m wheels in the XZ plane at y = 1, CCW seen from +Y.
function stadium(): number[][] {
  const pts: number[][] = [];
  for (let i = 0; i <= 40; i++) pts.push([-2 + (4 * i) / 40, 1, 0]);
  for (let i = 1; i < 40; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / 40;
    pts.push([2 + 0.5 * Math.cos(a), 1, 0.5 + 0.5 * Math.sin(a)]);
  }
  for (let i = 0; i <= 40; i++) pts.push([2 - (4 * i) / 40, 1, 1]);
  for (let i = 1; i < 40; i++) {
    const a = Math.PI / 2 + (Math.PI * i) / 40;
    pts.push([-2 + 0.5 * Math.cos(a), 1, 0.5 + 0.5 * Math.sin(a)]);
  }
  return pts;
}

const pose = (belt: TreadBelt, d: number, n: number): { p: number[]; nrm: number[] } => {
  const p = new Array<number>(n * 3).fill(0);
  const nrm = new Array<number>(n * 3).fill(0);
  belt.pose(d, p, nrm);
  return { p, nrm };
};

describe('TreadBelt', () => {
  // A link on the ground run, 2 cm below the centre line, normal pointing down (the grouser face).
  const link = [0, 1.1, -0.02, 0.05, 0.9, -0.02];
  const down = [0, 0, -1, 0, 0, -1];

  it('moves the ground run backwards when driving forward (a belt that ran the other way fails)', () => {
    for (const path of [stadium(), stadium().reverse()]) {
      const { p } = pose(new TreadBelt(path, link, down), 0.3, 2);
      expect(p[0]).toBeCloseTo(-0.3, 2);
      expect(p[3]).toBeCloseTo(-0.25, 2);
    }
  });

  it('keeps the rest pose exactly at distance 0', () => {
    const { p, nrm } = pose(new TreadBelt(stadium(), link, down), 0, 2);
    for (const [i, v] of link.entries()) expect(p[i]).toBeCloseTo(v, 6);
    for (const [i, v] of down.entries()) expect(nrm[i]).toBeCloseTo(v, 6);
  });

  it('carries a link over the wheel onto the top run, face turned outward (up)', () => {
    const belt = new TreadBelt(stadium(), link, down);
    // From x = 0 on the bottom: 2 m back, half a turn (π·0.5) round the rear wheel, 1 m forward.
    const { p, nrm } = pose(belt, 2 + Math.PI * 0.5 + 1, 2);
    expect(p[0]).toBeCloseTo(-1, 1);
    expect(p[1]).toBeCloseTo(1.1, 4);
    expect(p[2]).toBeCloseTo(1.02, 1);
    expect(nrm[2]).toBeCloseTo(1, 1);
  });

  it('comes back to rest after one full belt length', () => {
    const belt = new TreadBelt(stadium(), link, down);
    const { p } = pose(belt, belt.length, 2);
    for (const [i, v] of link.entries()) expect(p[i]).toBeCloseTo(v, 3);
  });
});
