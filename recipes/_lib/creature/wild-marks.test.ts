// wild-marks.ts: `wearKeep` shortens a card only where a wear it was given a share for lies under
// its root, and `defineWildCreature`'s `cardWear` makes the fur itself carry a scar (failure first:
// the kind's cards were painted where each vertex hangs, at full length over the scar, so a scar
// painted on the skin under a furred flank never showed).

import { describe, expect, it } from 'bun:test';
import {
  type CompiledAsset,
  type CreatureSpec,
  compile,
  creaturePlan,
  dmath,
  type Mesh,
  type Vec3,
} from '@developerz.ai/ts23d';
import { defineWildCreature, type Wild } from './wild.ts';
import { wearKeep } from './wild-marks.ts';

const SCAR = { a: [0.2, 0.5, 1] as Vec3, b: [-0.2, 0.5, 1] as Vec3, width: 0.02, axis: 1 as const };

describe('wearKeep', () => {
  const keep = wearKeep(
    {
      mud: { top: 0.2, colour: [0.3, 0.2, 0.1] },
      matted: { zones: [{ at: [0, 0, 0.6], radius: 0.2 }], strength: 1, width: 0.02 },
      scars: [SCAR],
    },
    { mud: 0.6, matted: 0.5, scar: 0.1 },
  );

  it('parts the coat to the scar share on the scar and leaves it whole beside it', () => {
    expect(keep([0, 0.5, 1])).toBeCloseTo(0.1, 2);
    expect(keep([0, 0.5, 1.2])).toBe(1);
  });

  it('shortens caked mud at the toes, nothing well above it', () => {
    expect(keep([0, 0.1, 0])).toBeCloseTo(0.6, 2);
    expect(keep([0.5, 0.1, 0.5])).toBe(1);
    // Splash height (under 2.2 × top, over the caked band): flecks never shorten a card.
    for (let i = 0; i < 200; i++) expect(keep([0.6 + 0.003 * i, 0.1, 0.3])).toBe(1);
  });

  it('clumps short only inside a matted zone, never past its share', () => {
    const inside = Array.from({ length: 200 }, (_, i) => keep([0.002 * i - 0.2, 0, 0.6]));
    expect(Math.min(...inside)).toBeLessThan(0.7);
    expect(Math.min(...inside)).toBeGreaterThanOrEqual(0.5 - 1e-9);
    expect(keep([0, 0, 1.5])).toBe(1);
  });

  it('keeps every card whole for a wear it has no share for', () => {
    const none = wearKeep({ scars: [SCAR], mud: { top: 0.2, colour: [0, 0, 0] } }, {});
    expect(none([0, 0.5, 1])).toBe(1);
    expect(none([0, 0.1, 0])).toBe(1);
  });
});

describe('defineWildCreature cardWear', () => {
  const SPEC: CreatureSpec = {
    skeleton: 'quadruped',
    family: 'canid',
    mass: 40,
    length: 1.15,
    height: 0.8,
    colours: {
      coat: [0.4, 0.35, 0.3],
      nose: [0.02, 0.02, 0.02],
      iris: [0.6, 0.4, 0.1],
      keratin: [0.1, 0.09, 0.08],
    },
  };
  const bones = creaturePlan(SPEC).bones;
  const chest = bones.trunk[0]?.at ?? [0.3, 0, 0.55];
  // A scar down the left flank behind the shoulder: projected along Y onto the flank's skin.
  const scar = {
    a: [chest[0] - 0.1, 0, bones.height * 0.72] as Vec3,
    b: [chest[0] - 0.1, 0, bones.height * 0.5] as Vec3,
    width: 0.05,
    axis: 1 as const,
    reach: 1,
  };
  const wild = (cardWear?: Wild['cardWear']): Wild => ({
    wear: { scars: [scar], scarColour: [0.9, 0.1, 0.1] },
    ...(cardWear ? { cardWear } : {}),
  });
  const fur = (c: CompiledAsset): Mesh => {
    const m = c.parts.find((p) => p.name === 'fur')?.mesh;
    if (!m) throw new Error('no fur part');
    return m;
  };
  /** Mean card reach (root → farthest vertex) and redness of the cards rooted on the scar. */
  const onScar = (m: Mesh): { reach: number; red: number; cards: number } => {
    const P = m.positions;
    const n = P.length / 3;
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = (v: number): number => {
      while ((parent[v] ?? v) !== v) v = parent[v] ?? v;
      return v;
    };
    for (let t = 0; t < m.indices.length; t += 3)
      for (const k of [1, 2]) {
        const a = find(m.indices[t] ?? 0);
        const b = find(m.indices[t + k] ?? 0);
        if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
      }
    const at = (v: number): Vec3 => [P[v * 3] ?? 0, P[v * 3 + 1] ?? 0, P[v * 3 + 2] ?? 0];
    const far = new Map<number, number>();
    for (let v = 0; v < n; v++) {
      const id = find(v);
      const [a, b] = [at(id), at(id + 1)];
      const r: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      const on =
        Math.abs(r[0] - scar.a[0]) < scar.width * 0.5 &&
        r[2] < scar.a[2] - 0.05 &&
        r[2] > scar.b[2] + 0.05;
      if (!on) continue;
      const p = at(v);
      far.set(id, Math.max(far.get(id) ?? 0, dmath.hypot(p[0] - r[0], p[1] - r[1], p[2] - r[2])));
    }
    let [reach, red] = [0, 0];
    for (const [id, d] of far) {
      reach += d;
      red += (m.colors[id * 3] ?? 0) - (m.colors[id * 3 + 1] ?? 0);
    }
    return {
      reach: reach / Math.max(1, far.size),
      red: red / Math.max(1, far.size),
      cards: far.size,
    };
  };

  it('parts the cards over a scar down to a stub, every card still rooted on it', () => {
    const plain = onScar(
      fur(compile(defineWildCreature({ name: 'w', spec: SPEC }, wild()), { lod: 1 })),
    );
    const worn = onScar(
      fur(compile(defineWildCreature({ name: 'w', spec: SPEC }, wild({ scar: 0.15 })), { lod: 1 })),
    );
    expect(plain.cards).toBeGreaterThan(3);
    expect(worn.cards).toBe(plain.cards);
    expect(worn.reach).toBeLessThan(plain.reach * 0.4);
    // Painted from the skin under the root: the scar's red core, at least as red as before.
    expect(worn.red).toBeGreaterThan(plain.red - 0.05);
  }, 240_000);
});
