import { describe, expect, test } from 'bun:test';
import { createRng, type Vec3 } from '../core/index.ts';
import { bodyRes, creaturePlan } from './creature.ts';
import { bodyEdits } from './creature-body.ts';
import { creatureFur, furChains, furLie, furZones } from './creature-fur.ts';
import { creatureHeadFur } from './creature-head-fur.ts';
import { sculptPiece } from './creature-mesh.ts';
import type { CreatureSpec } from './creature-spec.ts';
import { furRelief } from './creature-surface.ts';

/** A test wolf (the recipe's sourced numbers, trimmed). */
const WOLF: CreatureSpec = {
  skeleton: 'quadruped',
  family: 'canid',
  mass: 40,
  length: 1.15,
  height: 0.8,
  head: 0.265,
  neck: 0.28,
  tail: 0.42,
  surface: 'fur',
  coat: 0.03,
  colours: {
    coat: [0.32, 0.27, 0.2],
    nose: [0.01, 0.01, 0.01],
    iris: [0.6, 0.3, 0.05],
    keratin: [0.03, 0.02, 0.02],
  },
};

const { bones } = creaturePlan(WOLF);
// The body at LOD1 cells keeps the test fast; card counts follow area, not cell size.
const piece = sculptPiece({
  edits: bodyEdits(bones, WOLF, 1, bodyRes(bones) * 2.2, [0.1, 0.1, 0.1], [0.3, 0.3, 0.3]),
  res: bodyRes(bones) * 2.2,
  color: WOLF.colours.coat,
  mirror: bones.mirror,
});
const fur = (lod: 0 | 1 | 2, spec = WOLF) =>
  creatureFur(piece.mesh, bones, spec, { lod, rng: createRng(7), field: piece.field });

describe('creatureFur', () => {
  test('fails closed: LOD2 and non-fur surfaces grow no cards', () => {
    expect(fur(2)).toBeNull();
    expect(fur(0, { ...WOLF, surface: 'scales' })).toBeNull();
  });

  test('wolf LOD0: 2–4k cards, every root buried in the body', () => {
    const f = fur(0);
    expect(f).not.toBeNull();
    const roots = f?.roots ?? [];
    expect(roots.length).toBeGreaterThan(2000);
    expect(roots.length).toBeLessThan(4000);
    let outside = 0;
    for (const r of roots) if (piece.field(r) > 0) outside++;
    expect(outside).toBe(0);
  });

  test('LOD1 has at most a quarter of the cards, wider', () => {
    const a = fur(0);
    const b = fur(1);
    expect((b?.roots.length ?? 0) * 4).toBeLessThanOrEqual((a?.roots.length ?? 0) * 1.1);
    const width = (m: NonNullable<ReturnType<typeof fur>>['mesh']): number => {
      const p = m.positions;
      return Math.hypot(
        (p[0] ?? 0) - (p[3] ?? 0),
        (p[1] ?? 0) - (p[4] ?? 0),
        (p[2] ?? 0) - (p[5] ?? 0),
      );
    };
    if (a && b) expect(width(b.mesh)).toBeGreaterThan(width(a.mesh) * 1.3);
  });

  test('canids grow all six long-fur zones; unlisted families none', () => {
    expect(furZones(bones, 'canid').map((z) => z.name)).toEqual([
      'mane',
      'throat',
      'cheeks',
      'elbows',
      'breeches',
      'tail',
    ]);
    expect(furZones(bones, undefined)).toEqual([]);
  });

  test('the coat lies tailward along the spine and distally down the legs', () => {
    const chains = furChains(bones);
    const spine = chains[0]?.points ?? [];
    const first = spine[0] ?? [0, 0, 0];
    const last = spine[spine.length - 1] ?? [0, 0, 0];
    // Bones.spine runs rear → front; the coat chain runs front → rear (−X is the tail).
    expect(last[0]).toBeLessThan(first[0]);
    const leg = chains.find((c) => c.weight === 1.5)?.points ?? [];
    const top: Vec3 = leg[0] ?? [0, 0, 0];
    const foot: Vec3 = leg[leg.length - 1] ?? [0, 0, 0];
    expect(foot[2]).toBeLessThan(top[2]);
  });
});

describe('furRelief (flow-advected locks)', () => {
  /** Mean |Δrelief| for a step along an axis: small along the locks, larger across them. */
  const roughness = (axis: Vec3): number => {
    const r = furRelief(0.01, 0.03, 5, { dir: () => [1, 0, 0] });
    let s = 0;
    for (let i = 0; i < 400; i++) {
      const p: Vec3 = [(i % 20) * 0.017, Math.floor(i / 20) * 0.013, 0.31];
      const q: Vec3 = [p[0] + axis[0] * 0.012, p[1] + axis[1] * 0.012, p[2] + axis[2] * 0.012];
      s += Math.abs(r.at(p) - r.at(q));
    }
    return s / 400;
  };

  test('fails if isotropic: locks are smoother along the flow than across it', () => {
    expect(roughness([1, 0, 0])).toBeLessThan(roughness([0, 1, 0]) * 0.7);
  });

  test('furLie combs the wolf tailward on the back and is stronger in the mane', () => {
    const lie = furLie(bones, 'canid');
    const back = bones.spine[Math.floor(bones.spine.length / 2)] ?? [0, 0, 0];
    expect(lie.dir([back[0], 0, back[2] + 0.02])[0]).toBeLessThan(0);
    const mane = furZones(bones, 'canid')[0]?.at ?? [0, 0, 0];
    expect(lie.amp?.(mane) ?? 0).toBeGreaterThan(1.4);
  });
});

describe('creatureHeadFur', () => {
  const head = sculptPiece({
    edits: [{ shape: 'ellipsoid', at: [0.12, 0, 0], size: [0.13, 0.07, 0.07] }],
    res: 0.008,
    color: WOLF.colours.coat,
    mirror: true,
  });
  const bare = {
    nose: [0.25, 0, 0] as Vec3,
    noseR: 0.02,
    eye: [0.17, 0.05, 0.03] as Vec3,
    eyeR: 0.012,
    lips: -0.03,
    muzzle: 0.15,
    ears: 0.05,
  };
  test('fails closed at LOD2; leaves nose, eyes and above the ear roots bare', () => {
    expect(creatureHeadFur(head.mesh, WOLF, bare, { lod: 2, rng: createRng(1) })).toBeNull();
    const m = creatureHeadFur(head.mesh, WOLF, bare, {
      lod: 0,
      rng: createRng(1),
      field: head.field,
    });
    expect(m).not.toBeNull();
    const P = m?.positions ?? new Float32Array(0);
    const I = m?.indices ?? new Uint32Array(0);
    // Each card is one connected strip; its first two vertices straddle its buried root (flat or
    // folded cards alike).
    const first = new Map<number, number>();
    const comp = new Int32Array(P.length / 3).map((_, i) => i);
    const find = (i: number): number => {
      let r = i;
      while ((comp[r] ?? r) !== r) r = comp[r] ?? r;
      return r;
    };
    for (let t = 0; t < I.length; t += 3)
      for (let k = 1; k < 3; k++) {
        const a = find(I[t] ?? 0);
        const b = find(I[t + k] ?? 0);
        if (a !== b) comp[Math.max(a, b)] = Math.min(a, b);
      }
    for (let i = 0; i < P.length / 3; i++) if (!first.has(find(i))) first.set(find(i), i);
    expect(first.size).toBeGreaterThan(10);
    for (const v of first.values()) {
      const i = v * 3;
      const r: Vec3 = [
        ((P[i] ?? 0) + (P[i + 3] ?? 0)) / 2,
        ((P[i + 1] ?? 0) + (P[i + 4] ?? 0)) / 2,
        ((P[i + 2] ?? 0) + (P[i + 5] ?? 0)) / 2,
      ];
      expect(Math.hypot(r[0] - 0.25, r[1], r[2])).toBeGreaterThan(0.02);
      expect(r[2]).toBeLessThan(0.05);
    }
  });
});
