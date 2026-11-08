import { describe, expect, it } from 'bun:test';
import type { IntendedCrease } from '../core/index.ts';
import {
  type Asset,
  type BuildContext,
  compile,
  defineAsset,
  type Mesh,
  type PartOptions,
  type Vec3,
} from '../core/index.ts';
import { sd, sdf } from '../primitives/index.ts';
import { connectionReport } from './connections.ts';

const grey: Vec3 = [0.5, 0.5, 0.5];
type Piece = readonly [string, Mesh, PartOptions?];

const asset = (kind: string, pieces: readonly Piece[], extra: Partial<Asset> = {}): Asset =>
  defineAsset({
    name: 'fixture',
    kind,
    budget: { triangles: [400000, 400000, 400000] },
    build: (ctx: BuildContext) => {
      for (const [name, mesh, o] of pieces) ctx.part(name, mesh, o);
    },
    ...extra,
  });

const codes = (a: Asset): string[] =>
  connectionReport(compile(a)).issues.map((i) => `${i.code}:${i.part}`);

describe('connections: seams inside sculpts', () => {
  const sculpt = (k: number): Mesh =>
    sdf({
      field:
        k > 0
          ? sd.smoothUnion(k, sd.sphere([0, 0, 0.2], 0.2), sd.sphere([0.18, 0, 0.3], 0.1))
          : sd.union(sd.sphere([0, 0, 0.2], 0.2), sd.sphere([0.18, 0, 0.3], 0.1)),
      bounds: [
        [-0.25, -0.25, -0.05],
        [0.35, 0.25, 0.45],
      ],
      resolution: 0.008,
      color: grey,
    });

  it('fails two forms pushed together without a blend, passes a blended union', () => {
    expect(codes(asset('character', [['head', sculpt(0)]]))).toContain('T3D_CONNECT_SEAM:head');
    expect(codes(asset('character', [['head', sculpt(0.08)]]))).not.toContain(
      'T3D_CONNECT_SEAM:head',
    );
  });

  it('skips a declared crease and every hard-surface kind', () => {
    const declared = asset('character', [['head', sculpt(0)]], {
      creases: [{ name: 'brow', part: 'head', at: [0.12, 0, 0.32], radius: 0.2, why: 'test' }],
    });
    expect(codes(declared)).not.toContain('T3D_CONNECT_SEAM:head');
    expect(codes(asset('vehicle', [['head', sculpt(0)]]))).not.toContain('T3D_CONNECT_SEAM:head');
  });

  it('accepts small regions strung along a curved fold, not along half of it', () => {
    const seams = connectionReport(
      compile(asset('character', [['head', sculpt(0)]])),
    ).issues.filter((i) => i.code === 'T3D_CONNECT_SEAM');
    const trace = seams.flatMap((i) => i.trace ?? []);
    expect(trace.length).toBeGreaterThan(8);
    const beads = (pts: readonly Vec3[]): IntendedCrease[] =>
      pts.map((at, k) => ({ name: `ring_${k}`, part: 'head', at, radius: 0.012, why: 'test' }));
    const half = asset('character', [['head', sculpt(0)]], {
      creases: beads(trace.slice(0, Math.floor(trace.length / 2))),
    });
    expect(codes(half)).toContain('T3D_CONNECT_SEAM:head');
    const all = asset('character', [['head', sculpt(0)]], { creases: beads(trace) });
    expect(codes(all)).not.toContain('T3D_CONNECT_SEAM:head');
  });

  // A ~5 m creature: its muscle grooves are a few centimetres across, far under 1.5 % of its size,
  // so the seam scale stops growing with the shell at an absolute cap (only sharp junctions count).
  const big = (hard: boolean): Mesh => {
    const torso = sd.sphere([0, 0, 2], 2);
    const limb = sd.sphere([1.8, 0, 3], 1);
    const body = hard ? sd.union(torso, limb) : sd.smoothUnion(0.8, torso, limb);
    // A soft muscle groove carved round the flank: 5 cm deep, its edges rounded over ~5 cm.
    const groove = sd.capsule([-0.6, 1.92, 1.2], [-0.6, 1.92, 2.8], 0.05);
    return sdf({
      field: hard ? body : sd.smoothSubtract(0.05, body, groove),
      bounds: [
        [-2.1, -2.1, -0.1],
        [2.9, 2.1, 4.1],
      ],
      resolution: 0.025,
      color: grey,
    });
  };

  it('flags a hard union on a 5 m sculpt, not a soft anatomical groove on it', () => {
    expect(codes(asset('creature', [['body', big(true)]]))).toContain('T3D_CONNECT_SEAM:body');
    expect(codes(asset('creature', [['body', big(false)]]))).not.toContain('T3D_CONNECT_SEAM:body');
  });
});
