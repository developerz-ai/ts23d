import { describe, expect, it } from 'bun:test';
import {
  boundsOf,
  compile,
  defineAsset,
  type Lod,
  type Mesh,
  Ts23dError,
  translate,
  triangleCount,
} from '../core/index.ts';
import { stripRect } from '../material/index.ts';
import { box } from '../primitives/index.ts';
import { runQa } from '../qa/index.ts';
import { type RoofMeshOptions, roof, roofInfo, roofMesh } from './roof.ts';
import { type RoofType, ridgeHeight } from './roof-shape.ts';

const RAD = Math.PI / 180;
const base: RoofMeshOptions = {
  type: 'gable',
  footprint: [9, 6.5],
  pitchDeg: 40,
  at: [0, 0, 5],
  color: [0.3, 0.32, 0.38],
};

const invalid = (f: () => unknown): Ts23dError => {
  try {
    f();
  } catch (e) {
    if (e instanceof Ts23dError) return e;
    throw e;
  }
  throw new Error('expected a Ts23dError');
};

/** Signed volume by the divergence theorem: origin-independent only for a closed surface. */
function volume(m: Mesh): number {
  let v = 0;
  const p = (i: number): [number, number, number] => [
    m.positions[i * 3] ?? 0,
    m.positions[i * 3 + 1] ?? 0,
    m.positions[i * 3 + 2] ?? 0,
  ];
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [p(m.indices[t] ?? 0), p(m.indices[t + 1] ?? 0), p(m.indices[t + 2] ?? 0)];
    v +=
      (a[0] * (b[1] * c[2] - b[2] * c[1]) -
        a[1] * (b[0] * c[2] - b[2] * c[0]) +
        a[2] * (b[0] * c[1] - b[1] * c[0])) /
      6;
  }
  return v;
}

describe('roof', () => {
  it('rejects impossible pitches, footprints and mansard slopes with a fix', () => {
    for (const pitchDeg of [0, 2, 89, Number.NaN]) {
      const e = invalid(() => roofMesh({ ...base, pitchDeg }));
      expect(e.code).toBe('T3D_RECIPE_INVALID');
      expect(e.fix).toContain('°');
    }
    expect(invalid(() => roofMesh({ ...base, footprint: [0, 4] })).code).toBe('T3D_RECIPE_INVALID');
    expect(invalid(() => roofMesh({ ...base, thickness: 0 })).code).toBe('T3D_RECIPE_INVALID');
    const m = invalid(() =>
      roofMesh({ ...base, type: 'mansard', pitchDeg: 30, upperPitchDeg: 40 }),
    );
    expect(m.fix).toContain('shallower');
  });

  it('puts the ridge exactly at half-span · tan(pitch) + slab, and LOD2 at the bare rafter line', () => {
    const t = 0.18;
    const under = 5 + 3.25 * Math.tan(40 * RAD);
    expect(ridgeHeight(base)).toBeCloseTo(under + t / Math.cos(40 * RAD), 9);
    const lod0 = boundsOf(roofMesh({ ...base, caps: false }, 0));
    expect(lod0.max[2]).toBeCloseTo(under + t / Math.cos(40 * RAD), 4);
    expect(boundsOf(roofMesh(base, 2)).max[2]).toBeCloseTo(under, 4);
    // Ridge along the long side (X) by default: eaves overhang 0.35 on Y, rake 0.35 on X.
    expect(lod0.max[1]).toBeCloseTo(3.25 + 0.35, 4);
    expect(lod0.max[0]).toBeCloseTo(4.5 + 0.35, 4);
  });

  it('rests on the wall plate: the underside meets the wall line at plate height', () => {
    const info = roofInfo(base);
    // The top at the wall line sits one vertical slab thickness above the plate.
    expect(info.heightAt(0, 3.25)).toBeCloseTo(5 + 0.18 / Math.cos(40 * RAD), 6);
    expect(info.eave).toBeCloseTo(5 - 0.35 * Math.tan(40 * RAD), 6);
    const walls = boundsOf(roofMesh({ ...base, caps: false, overhang: 0, rake: 0 }, 2));
    expect(walls.min[2]).toBeCloseTo(5, 6);
  });

  it('turns the ridge with `ridge: y`', () => {
    const info = roofInfo({ ...base, ridge: 'y' });
    expect(info.heightAt(0, -3)).toBeCloseTo(info.heightAt(0, 3), 9);
    expect(info.heightAt(-3, 0)).toBeLessThan(info.heightAt(0, 0) - 1);
  });

  it('builds a closed slab: its volume is outline area × vertical thickness, from any origin', () => {
    const o: RoofMeshOptions = { ...base, type: 'hip', caps: false };
    const m = roofMesh(o, 0);
    const T = 0.18 / Math.cos(40 * RAD);
    const area = (9 + 0.7) * (6.5 + 0.7);
    expect(volume(m)).toBeCloseTo(area * T, 3);
    expect(volume(translate(m, [13, -7, 4]))).toBeCloseTo(area * T, 3);
  });

  it('lays slates in true-scale bands (0.66 m) up the slope from the eave', () => {
    const m = roofMesh({ ...base, type: 'hip', caps: false }, 0);
    const r = stripRect('slate');
    let checked = 0;
    for (let i = 0; i < m.positions.length / 3; i++) {
      // Vertices of the +Y slope's top surface.
      if ((m.normals[i * 3 + 1] ?? 0) < 0.3 || (m.normals[i * 3 + 2] ?? 0) < 0.5) continue;
      const f = ((m.uvs[i * 2 + 1] ?? 0) - r.v0) / (r.v1 - r.v0);
      const slant = (3.25 + 0.35 - (m.positions[i * 3 + 1] ?? 0)) / Math.cos(40 * RAD);
      const inBand = slant / 0.66 - Math.floor(slant / 0.66 + 1e-6);
      expect(f).toBeGreaterThanOrEqual(-1e-6);
      expect(f).toBeLessThanOrEqual(1 + 1e-6);
      expect(Math.min(Math.abs(f - inBand), Math.abs(f - 1 - inBand))).toBeLessThan(1e-3);
      checked++;
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('drops detail per LOD and is deterministic', () => {
    const types: RoofType[] = ['gable', 'hip', 'pyramid', 'mansard', 'gambrel', 'shed'];
    for (const type of types) {
      const tris = ([0, 1, 2] as Lod[]).map((l) => triangleCount(roofMesh({ ...base, type }, l)));
      expect(tris[0]).toBeGreaterThan(tris[1] ?? 0);
      expect(tris[1]).toBeGreaterThan(tris[2] ?? 0);
      expect(tris[2]).toBeLessThanOrEqual(40);
    }
    const a = roofMesh({ ...base, chimneys: [{ at: [-2, 1], color: [0.6, 0.3, 0.2] }] });
    const b = roofMesh({ ...base, chimneys: [{ at: [-2, 1], color: [0.6, 0.3, 0.2] }] });
    expect(Buffer.from(a.positions.buffer).equals(Buffer.from(b.positions.buffer))).toBe(true);
  });

  it('passes QA on a house at every LOD (attached, chimney clears the slope)', () => {
    const house = defineAsset({
      name: 'house',
      kind: 'building',
      budget: { triangles: [20000, 6000, 800] },
      build(ctx) {
        ctx.part('walls', box({ size: [9, 6.5, 5], color: [0.6, 0.3, 0.2] }));
        const info = roof(ctx, {
          ...base,
          type: 'hip',
          chimneys: [{ at: [-2, 1], color: [0.6, 0.3, 0.2] }],
        });
        expect(info.ridge).toBeGreaterThan(5);
      },
    });
    for (const lod of [0, 1, 2] as Lod[]) expect(runQa(compile(house, { lod }))).toEqual([]);
    const top = boundsOf(
      roofMesh({ ...base, type: 'hip', chimneys: [{ at: [-2, 1], color: [1, 1, 1] }] }),
    );
    expect(top.max[2]).toBeGreaterThan(roofInfo({ ...base, type: 'hip' }).heightAt(-2, 1) + 0.9);
  });
});
