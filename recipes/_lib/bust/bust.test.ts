// The bust's far LODs hold the head's planes (D551): LOD2 keeps the brow over the eye sockets, the
// nose and the lips that LOD1 has (a face box at half the head's cell), and LOD1's skin paint is
// filtered over each vertex's faces, not point-sampled into triangle-wide blotches (D552).

import { describe, expect, it } from 'bun:test';
import { type CompiledAsset, compile, type Lod, type Mesh } from '@developerz.ai/ts23d';
import { ELF_BUST } from '../../elf_head/build.ts';
import { elf_head } from '../../elf_head/elf_head.ts';
import { GOBLIN_BUST } from '../../goblin_head/build.ts';
import { goblin_head } from '../../goblin_head/goblin_head.ts';
import { skullLandmarks, skullOf } from '../face/skull.ts';
import type { BustRecipe } from './bust.ts';

/** Front-most x of `m` on the line through (·, y, z) along x. */
function front(m: Mesh, y: number, z: number): number {
  const P = m.positions;
  const T = m.indices;
  let best = Number.NEGATIVE_INFINITY;
  for (let t = 0; t < T.length; t += 3) {
    const [a, b, c] = [(T[t] ?? 0) * 3, (T[t + 1] ?? 0) * 3, (T[t + 2] ?? 0) * 3];
    const [ay, az] = [(P[a + 1] ?? 0) - y, (P[a + 2] ?? 0) - z];
    const [by, bz] = [(P[b + 1] ?? 0) - y, (P[b + 2] ?? 0) - z];
    const [cy, cz] = [(P[c + 1] ?? 0) - y, (P[c + 2] ?? 0) - z];
    const w0 = by * cz - bz * cy;
    const w1 = cy * az - cz * ay;
    const w2 = ay * bz - az * by;
    const inside = (w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0);
    const s = w0 + w1 + w2;
    if (!inside || s === 0) continue;
    best = Math.max(best, (w0 * (P[a] ?? 0) + w1 * (P[b] ?? 0) + w2 * (P[c] ?? 0)) / s);
  }
  return best;
}

/** Relief of the face's three key features, metres: the brow over the eye (or the eyeball's
 *  front, where the lids leave it showing), the nose tip over the cheek beside it, the lips over
 *  the fold below them. */
function features(m: Mesh, b: BustRecipe): { socket: number; nose: number; lips: number } {
  if (!b.skull) throw new Error('the fixture bust has no skull stage');
  const k = skullLandmarks(skullOf(b.skull, b.spec));
  const [ex, ey, ez] = b.eye.centre;
  const side = Math.abs(k.alare[1]) + 0.012;
  const z = k.pronasale[2];
  const sock = (s: number): number =>
    front(m, s * ey, k.brow[2]) - Math.max(front(m, s * ey, ez), ex + b.eye.r);
  const fold = front(m, 0, (k.labraleInf[2] + k.pogonion[2]) / 2);
  return {
    socket: (sock(1) + sock(-1)) / 2,
    nose: front(m, 0, z) - (front(m, side, z) + front(m, -side, z)) / 2,
    lips: Math.max(front(m, 0, k.labraleSup[2]), front(m, 0, k.labraleInf[2])) - fold,
  };
}

const part = (a: CompiledAsset, name: string): Mesh => {
  const m = a.parts.find((p) => p.name === name)?.mesh;
  if (!m) throw new Error(`no ${name} part`);
  return m;
};

const lum = (m: Mesh, i: number): number =>
  0.2126 * (m.colors[i * 3] ?? 0) +
  0.7152 * (m.colors[i * 3 + 1] ?? 0) +
  0.0722 * (m.colors[i * 3 + 2] ?? 0);

/** Mean |Δ luminance| across mesh edges: paint noise between neighbouring vertices. */
function edgeNoise(m: Mesh): number {
  let sum = 0;
  let n = 0;
  for (let t = 0; t < m.indices.length; t += 3)
    for (let e = 0; e < 3; e++) {
      sum += Math.abs(lum(m, m.indices[t + e] ?? 0) - lum(m, m.indices[t + ((e + 1) % 3)] ?? 0));
      n++;
    }
  return sum / n;
}

const at = (lod: Lod) => ({
  goblin: compile(goblin_head, { lod }),
  elf: compile(elf_head, { lod }),
});

describe('bust far LODs', () => {
  const near = at(1);
  const far = at(2);
  it('fails on a melted far face (D551): LOD2 keeps the sockets, nose and lips LOD1 has', () => {
    // At the head's own 2.2 cm cell the goblin's sockets kept 0.23 of LOD1's depth, the elf's
    // 0.33, and the goblin's lips 0.6: an egg with eyeballs bulging out of it.
    for (const [name, b] of [
      ['goblin', GOBLIN_BUST],
      ['elf', ELF_BUST],
    ] as const) {
      const n = features(part(near[name], 'head'), b);
      const f = features(part(far[name], 'head'), b);
      expect(f.socket / n.socket).toBeGreaterThan(0.75);
      expect(f.nose / n.nose).toBeGreaterThan(0.75);
      expect(f.lips / n.lips).toBeGreaterThan(0.75);
    }
  });

  it('fails on blotchy LOD1 paint (D552): the 1 cm vertices filter the paint, not sample it', () => {
    // Point-sampled, the paint's millimetre speckle and crevices jumped 0.028 (head) and 0.036
    // (bust) a goblin edge; LOD0's own 6 mm head is 0.014.
    expect(edgeNoise(part(near.goblin, 'head'))).toBeLessThan(0.022);
    expect(edgeNoise(part(near.goblin, 'bust'))).toBeLessThan(0.03);
  });
});
