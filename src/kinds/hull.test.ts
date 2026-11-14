import { describe, expect, it } from 'bun:test';
import {
  boundsOf,
  compile,
  defineAsset,
  type Lod,
  type Mesh,
  merge,
  Ts23dError,
  translate,
  triangleCount,
} from '../core/index.ts';
import { runQa } from '../qa/index.ts';
import { type HullOptions, hull, hullMesh } from './hull.ts';

const tug: HullOptions = {
  length: 30,
  beam: 9,
  draft: 4,
  freeboard: 1.3,
  colors: {
    topsides: [0.1, 0.1, 0.1],
    bottom: [0.55, 0.12, 0.1],
    boot: [0.9, 0.9, 0.9],
    deck: [0.6, 0.5, 0.4],
  },
};

function volume(m: Mesh): number {
  let v = 0;
  const p = (i: number): number[] => [0, 1, 2].map((k) => m.positions[i * 3 + k] ?? 0);
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a = [], b = [], c = []] = [0, 1, 2].map((k) => p(m.indices[t + k] ?? 0));
    const [ax = 0, ay = 0, az = 0] = a;
    const [bx = 0, by = 0, bz = 0] = b;
    const [cx = 0, cy = 0, cz = 0] = c;
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return v;
}

describe('hull', () => {
  it('rejects missing or impossible dimensions with a fix', () => {
    for (const bad of [{ length: 0 }, { draft: -1 }, { beam: 40 }, { fullness: 0.5 }]) {
      try {
        hullMesh({ ...tug, ...bad });
        throw new Error('expected a throw');
      } catch (e) {
        expect(e).toBeInstanceOf(Ts23dError);
        expect((e as Ts23dError).code).toBe('T3D_RECIPE_INVALID');
        expect((e as Ts23dError).fix.length).toBeGreaterThan(10);
      }
    }
  });

  it('meets length, beam, draft and freeboard exactly', () => {
    const { shell, lines } = hullMesh(tug);
    const b = boundsOf(shell);
    expect(b.max[0] - b.min[0]).toBeCloseTo(30, 3);
    expect(b.max[1] - b.min[1]).toBeCloseTo(9, 3);
    expect(b.min[2]).toBeCloseTo(-4, 3);
    expect(lines.deck(0)).toBeCloseTo(1.3, 9);
    // Sheer: the deck edge rises toward both ends, more at the bow.
    expect(lines.deck(15)).toBeGreaterThan(lines.deck(-15));
    expect(lines.deck(-15)).toBeGreaterThan(1.3);
  });

  it('closes into a watertight solid with the deck (round and transom sterns)', () => {
    for (const stern of ['round', 'transom'] as const) {
      const m = hullMesh({ ...tug, stern });
      const solid = merge([m.shell, m.deck]);
      const v = volume(solid);
      expect(v).toBeGreaterThan(0.4 * 30 * 9 * 4);
      expect(volume(translate(solid, [50, -20, 9]))).toBeCloseTo(v, 1);
    }
  });

  it('paints crisp bands: antifouling below the waterline, topsides above the boot-top', () => {
    const { shell, lines } = hullMesh(tug);
    for (let i = 0; i < shell.positions.length / 3; i++) {
      const z = shell.positions[i * 3 + 2] ?? 0;
      // Where the stem rises out of the water the band boundary falls between stations.
      if (lines.keel(shell.positions[i * 3] ?? 0) > -0.3) continue;
      const r = shell.colors[i * 3] ?? 0;
      if (z < -1e-3) expect(r).toBeCloseTo(0.55, 5);
      if (z > 0.3 + 1e-3) expect(r).toBeCloseTo(0.1, 5);
    }
  });

  it('drops stations per LOD, is deterministic and passes QA as an asset', () => {
    const t = ([0, 1, 2] as Lod[]).map((l) =>
      triangleCount(hullMesh({ ...tug, bulwark: 1 }, l).shell),
    );
    expect(t[0]).toBeGreaterThan(t[1] ?? 0);
    expect(t[1]).toBeGreaterThan(t[2] ?? 0);
    const a = hullMesh({ ...tug, fender: { color: [0, 0, 0] } }).shell;
    const b = hullMesh({ ...tug, fender: { color: [0, 0, 0] } }).shell;
    expect(Buffer.from(a.positions.buffer).equals(Buffer.from(b.positions.buffer))).toBe(true);
    const boat = defineAsset({
      name: 'tug',
      kind: 'vessel',
      budget: { triangles: [60000, 15000, 1000] },
      build: (ctx) => {
        hull(ctx, { ...tug, bulwark: 1, stern: 'transom' });
      },
    });
    for (const lod of [0, 1, 2] as Lod[]) {
      const c = compile(boat, { lod });
      expect(c.parts.map((p) => p.name)).toEqual(['hull', 'hull_deck']);
      expect(runQa(c)).toEqual([]);
    }
  });

  it('collapsed stations (stem head, keel above the waterline) emit no zero-area triangles', () => {
    for (const lod of [0, 1, 2] as Lod[]) {
      const boat = defineAsset({
        name: 'tug',
        kind: 'vessel',
        budget: { triangles: [60000, 15000, 1000] },
        build: (ctx) => {
          const m = hullMesh({ ...tug, bulwark: 1, stern: 'transom' }, ctx.lod);
          ctx.part('shell', m.shell);
          ctx.part('deck', m.deck);
        },
      });
      const c = compile(boat, { lod });
      for (const p of c.parts) expect(p.mesh && zeroArea(p.mesh)).toBe(0);
    }
  });
});

/** Triangles with a zero cross product (any, not just the gate's 5% share). */
function zeroArea(m: Mesh): number {
  let n = 0;
  const p = (i: number): number[] => [0, 1, 2].map((k) => m.positions[i * 3 + k] ?? 0);
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a = [], b = [], c = []] = [0, 1, 2].map((k) => p(m.indices[t + k] ?? 0));
    const u = [0, 1, 2].map((k) => (b[k] ?? 0) - (a[k] ?? 0));
    const v = [0, 1, 2].map((k) => (c[k] ?? 0) - (a[k] ?? 0));
    const [ux = 0, uy = 0, uz = 0] = u;
    const [vx = 0, vy = 0, vz = 0] = v;
    if (Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) < 1e-12) n++;
  }
  return n;
}
