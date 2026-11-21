// The bust's far LODs hold the head's planes (D551): LOD2 keeps the brow over the eye sockets, the
// nose and the lips that LOD1 has (a face box at half the head's cell), and LOD1's skin paint is
// filtered over each vertex's faces, not point-sampled into triangle-wide blotches (D552).

import { describe, expect, it } from 'bun:test';
import { type CompiledAsset, compile, dmath, type Lod, type Mesh } from '@developerz.ai/ts23d';
import { ELF_BUST } from '../../elf_head/build.ts';
import { elf_head } from '../../elf_head/elf_head.ts';
import { GOBLIN_BUST } from '../../goblin_head/build.ts';
import { hiddenBody } from '../../goblin_head/clothes.ts';
import { goblin_head } from '../../goblin_head/goblin_head.ts';
import { skullLandmarks, skullOf } from '../face/skull.ts';
import { type BustRecipe, bustEdits, SECTION } from './bust.ts';

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

/** Share of `m`'s triangles whose UV edge per world metre runs over 4× the median: a triangle
 *  spanning two projection planes reads metres of strip across a centimetre of cloth. */
function stretched(m: Mesh): number {
  const P = m.positions;
  const U = m.uvs;
  const T = m.indices;
  const rates: number[] = [];
  for (let t = 0; t < T.length; t += 3)
    for (let e = 0; e < 3; e++) {
      const a = T[t + e] ?? 0;
      const b = T[t + ((e + 1) % 3)] ?? 0;
      const w = dmath.hypot(
        (P[b * 3] ?? 0) - (P[a * 3] ?? 0),
        (P[b * 3 + 1] ?? 0) - (P[a * 3 + 1] ?? 0),
        (P[b * 3 + 2] ?? 0) - (P[a * 3 + 2] ?? 0),
      );
      if (w < 1e-6) continue;
      const uv = dmath.hypot(
        (U[b * 2] ?? 0) - (U[a * 2] ?? 0),
        (U[b * 2 + 1] ?? 0) - (U[a * 2 + 1] ?? 0),
      );
      rates.push(uv / w);
    }
  const sorted = [...rates].sort((x, y) => x - y);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  return rates.filter((r) => r > median * 4).length / Math.max(1, rates.length);
}

describe('bust garments', () => {
  const near = at(1);
  const far = compile(goblin_head, { lod: 2 });
  it('fails on grey sleeves (D578): garment UVs hold the strip’s scale on every triangle', () => {
    // The mesher's per-vertex projection axes put 20 % of the goblin's cloth edges at 4×+ the
    // strip's scale: a coarse mip, the sheet's rows bled into grey patches down the sleeves.
    expect(stretched(part(near.goblin, 'clothes'))).toBeLessThan(0.005);
    expect(stretched(part(near.elf, 'clothes'))).toBeLessThan(0.005);
  });

  it('fails on skin meshed under the clothes (D584): no skin vertex lies a cm inside the hidden body', () => {
    // The skull stage's own neck and shoulders were meshed whole under the vest and shirt.
    const hidden = hiddenBody(bustEdits(GOBLIN_BUST, 2, 1).skin.field);
    for (const [built, name] of [
      [near.goblin, 'bust'],
      [far, 'head'],
    ] as const) {
      const m = part(built, name);
      let deep = 0;
      for (let i = 0; i < m.positions.length / 3; i++)
        if (
          hidden([
            m.positions[i * 3] ?? 0,
            m.positions[i * 3 + 1] ?? 0,
            m.positions[i * 3 + 2] ?? 0,
          ]) < -0.01
        )
          deep++;
      expect({ name, deep }).toEqual({ name, deep: 0 });
    }
  });

  it('fails on a dark arm cut (D579): the sawn section is the cloth it cuts, in shade', () => {
    for (const [name, b] of [
      ['goblin', GOBLIN_BUST],
      ['elf', ELF_BUST],
    ] as const) {
      const saw = b.saw;
      if (!saw) throw new Error(`${name} has no saw`);
      const m = part(near[name], 'clothes');
      let face = 0;
      for (let i = 0; i < m.positions.length / 3; i++) {
        const p: [number, number, number] = [
          m.positions[i * 3] ?? 0,
          m.positions[i * 3 + 1] ?? 0,
          m.positions[i * 3 + 2] ?? 0,
        ];
        if (Math.abs(saw(p)) > 0.001) continue;
        face++;
        // (The old plug was SECTION itself, a near-black neutral (AO took it to within 0.035 of it);
        // the darkest cloth in shade, the vest's brown, stands 0.1 off.)
        const [r = 0, g = 0, b2 = 0] = [m.colors[i * 3], m.colors[i * 3 + 1], m.colors[i * 3 + 2]];
        expect(dmath.hypot(r - SECTION[0], g - SECTION[1], b2 - SECTION[2])).toBeGreaterThan(0.07);
      }
      expect(face).toBeGreaterThan(4);
    }
  });
});
