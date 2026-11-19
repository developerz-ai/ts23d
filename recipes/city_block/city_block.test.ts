// The block is the survey: every built footprint matches its OSM polygon (IoU ≥ 0.9, measured on
// the compiled mesh's top-down silhouette, not on the input), every tagged height holds ±5 %,
// neighbours never share a facade colour, and the instanced export validates.

import { describe, expect, it } from 'bun:test';
import { cityPlan, compile, type Mesh, type Vec2 } from '@developerz.ai/ts23d';
import { sceneManifest, toInstancedGlb } from '@developerz.ai/ts23d/export';
import { validateBytes } from 'gltf-validator';
import { BUILDINGS, city_block, OSM, STYLE, scene } from './city_block.ts';

const c0 = compile(city_block, { lod: 0 });
const part = (name: string): Mesh | null => c0.parts.find((p) => p.name === name)?.mesh ?? null;

const inPoly = (p: Vec2, ring: readonly Vec2[]): boolean => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i] ?? [0, 0];
    const b = ring[j] ?? [0, 0];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      c = !c;
  }
  return c;
};

/** Top-down silhouette of a mesh vs a polygon, rasterised at 0.2 m. */
function silhouetteIoU(m: Mesh, ring: readonly Vec2[]): number {
  const P = m.positions;
  const tris: Vec2[][] = [];
  for (let t = 0; t < m.indices.length; t += 3)
    tris.push(
      [0, 1, 2].map((k) => {
        const i = m.indices[t + k] ?? 0;
        return [P[i * 3] ?? 0, P[i * 3 + 1] ?? 0] as Vec2;
      }),
    );
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  let [both, either] = [0, 0];
  for (let x = Math.min(...xs) - 1; x < Math.max(...xs) + 1; x += 0.2)
    for (let y = Math.min(...ys) - 1; y < Math.max(...ys) + 1; y += 0.2) {
      const built = tris.some((t) => inPoly([x, y], t));
      const src = inPoly([x, y], ring);
      if (built && src) both++;
      if (built || src) either++;
    }
  return either ? both / either : 0;
}

async function validate(glb: Uint8Array) {
  const sealed = Math.random;
  let s = 1;
  Math.random = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  try {
    return await validateBytes(glb);
  } finally {
    Math.random = sealed;
  }
}

describe('city_block from the pinned West Village extract', () => {
  it('the extract is the pinned one, credited ODbL', () => {
    expect(OSM.license).toBe('ODbL-1.0');
    expect(city_block.copyright).toContain('OpenStreetMap contributors');
    expect(BUILDINGS.length).toBeGreaterThan(30);
  });

  it('every footprint matches its OSM polygon: IoU ≥ 0.9 on the built silhouette', () => {
    const ious = BUILDINGS.map((b) => {
      const m = part(`b${b.id}`);
      return m ? silhouetteIoU(m, b.ring) : 0;
    });
    expect(Math.min(...ious)).toBeGreaterThanOrEqual(0.9);
  }, 60_000);

  it('every tagged height holds ±5 % (top of the roof band above the base)', () => {
    for (const b of BUILDINGS) {
      if (b.height === null) continue;
      const roof = c0.parts.find((p) => p.name === `b${b.id}_roof`);
      const P = roof?.mesh?.positions ?? new Float32Array();
      let top = 0;
      for (let i = 2; i < P.length; i += 3) top = Math.max(top, (P[i] ?? 0) + (roof?.at[2] ?? 0));
      expect(Math.abs(top - b.height) / b.height).toBeLessThan(0.05);
    }
  });

  it('keeps each cornice the same depth from LOD0 to LOD1 (no LOD-only draw shifts the rng)', () => {
    const c1 = compile(city_block, { lod: 1 });
    const plan = (m: Mesh | null | undefined): number[] => {
      const P = m?.positions ?? new Float32Array();
      const b = [Infinity, Infinity, -Infinity, -Infinity];
      for (let i = 0; i < P.length; i += 3) {
        b[0] = Math.min(b[0] ?? 0, P[i] ?? 0);
        b[1] = Math.min(b[1] ?? 0, P[i + 1] ?? 0);
        b[2] = Math.max(b[2] ?? 0, P[i] ?? 0);
        b[3] = Math.max(b[3] ?? 0, P[i + 1] ?? 0);
      }
      return b;
    };
    const cornices = c0.parts.filter((p) => p.name.endsWith('_cornice'));
    expect(cornices.length).toBeGreaterThan(5);
    for (const near of cornices) {
      const far = c1.parts.find((p) => p.name === near.name);
      const [a, b] = [plan(near.mesh), plan(far?.mesh)];
      for (let k = 0; k < 4; k++) expect(b[k] ?? 0).toBeCloseTo(a[k] ?? 0, 3);
    }
  });

  it('far, every wall keeps its own colour (mean wear, not its blackened foot and top)', () => {
    const c2 = compile(city_block, { lod: 2 });
    const lum = (c: readonly number[]): number =>
      0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0);
    let walls = 0;
    for (const p of cityPlan(BUILDINGS, STYLE)) {
      const C = c2.parts.find((q) => q.name === `b${p.id}`)?.mesh?.colors;
      if (!C?.length) continue;
      const mean = [0, 1, 2].map((k) => {
        let s = 0;
        for (let i = k; i < C.length; i += 3) s += C[i] ?? 0;
        return s / (C.length / 3);
      });
      expect(lum(mean) / lum(p.wall)).toBeGreaterThan(0.6);
      walls++;
    }
    expect(walls).toBeGreaterThan(30);
  });

  it('two neighbours are never identical', () => {
    const plans = cityPlan(BUILDINGS, STYLE);
    const byId = new Map(plans.map((p) => [p.id, p]));
    let pairs = 0;
    for (const p of plans)
      for (const n of p.neighbours) {
        pairs++;
        expect(byId.get(n)?.wall).not.toEqual(p.wall);
      }
    expect(pairs).toBeGreaterThan(20);
  });

  it('the windows export as GPU instances that validate, counted by the manifest', async () => {
    const s = scene();
    const m = sceneManifest(s);
    expect(m.instances).toBeGreaterThan(500);
    expect(m.uniqueMeshes).toBe(1);
    const report = await validate(toInstancedGlb(s));
    const msgs = (report.issues as { messages: { severity: number; code: string }[] }).messages;
    expect(msgs.filter((x) => x.severity <= 1).map((x) => x.code)).toEqual([]);
  });
});
