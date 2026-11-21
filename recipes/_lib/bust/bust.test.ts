// The bust's far LODs hold the head's planes (D551): LOD2 keeps the brow over the eye sockets, the
// nose and the lips that LOD1 has (a face box at half the head's cell), and LOD1's skin paint is
// filtered over each vertex's faces, not point-sampled into triangle-wide blotches (D552). LOD2's
// face has its lips, mouth line and brows inked into the mesh and eyes with an iris (D614, D615);
// its garments' colour blocks end on the garments' edges (D616).

import { describe, expect, it } from 'bun:test';
import {
  type CompiledAsset,
  compile,
  dmath,
  type Lod,
  type Mesh,
  sculpt,
  type Vec3,
} from '@developerz.ai/ts23d';
import { ELF_BUST } from '../../elf_head/build.ts';
import { elf_head } from '../../elf_head/elf_head.ts';
import { GOBLIN_BUST } from '../../goblin_head/build.ts';
import { hiddenBody } from '../../goblin_head/clothes.ts';
import { goblin_head } from '../../goblin_head/goblin_head.ts';
import { HUMAN_BUST } from '../../human_head/build.ts';
import { human_head } from '../../human_head/human_head.ts';
import { skullLandmarks, skullOf } from '../face/skull.ts';
import { type BustRecipe, bustEdits, SECTION } from './bust.ts';
import { eyeball } from './eye.ts';
import { farInk } from './face-forms.ts';
import * as HUMAN from './human/spec.ts';
import { edgedColours, faceBlocks, type GarmentLayer, slice } from './layers.ts';

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

/** A far head's triangles by what the bust's ink names at their centre:
 *  [inked as named, all, their y, their corners]. */
function inked(m: Mesh, b: BustRecipe, want: Vec3): [number, number, number[], number[][]] {
  if (!b.skull) throw new Error('the fixture bust has no skull stage');
  const k = skullLandmarks(skullOf(b.skull, b.spec));
  // (Marker colours: this only asks the ink where each shape lies.)
  const ink = farInk(k, b.spec.H, { lips: [1, 0, 0], dark: [0, 0, 1], brows: [0, 1, 0] });
  let hit = 0;
  let all = 0;
  const ys: number[] = [];
  const corners: number[][] = [];
  for (let t = 0; t < m.indices.length; t += 3) {
    const v = [m.indices[t] ?? 0, m.indices[t + 1] ?? 0, m.indices[t + 2] ?? 0];
    const c: Vec3 = [0, 1, 2].map(
      (e) => v.reduce((s, i) => s + (m.positions[i * 3 + e] ?? 0), 0) / 3,
    ) as [number, number, number];
    const named = ink.colour(c);
    if (!named || named[0] !== want[0] || named[1] !== want[1]) continue;
    all++;
    ys.push(c[1]);
    corners.push(v);
    if (v.every((i) => lum(m, i) === lum(m, v[0] ?? 0))) hit++;
  }
  return [hit, all, ys, corners];
}

/** Every corner of these triangles carries `colour` (vertex colours are 32-bit floats). */
const wears = (m: Mesh, triangles: readonly number[][], colour: Vec3): boolean =>
  triangles.every((v) =>
    v.every((i) =>
      colour.every((x, e) => Math.abs((m.colors[i * 3 + e] ?? Number.NaN) - x) < 1e-4),
    ),
  );

/** The colours a bust's far ink should paint: the lips part-way from skin, the brows its own. */
function inkColours(b: BustRecipe): { lips: Vec3; brows: Vec3 } {
  const lips = b.zones?.lips ?? b.spec.lips;
  const brows = b.zones?.brows;
  if (!brows) throw new Error('the fixture bust has no brow colour');
  const mixed = [0, 1, 2].map((c) => {
    const skin = b.spec.skin[c as 0 | 1 | 2];
    return skin + (lips[c as 0 | 1 | 2] - skin) * 0.7;
  }) as [number, number, number];
  return { lips: mixed, brows };
}

// (The human and the elf: the goblin gives no far forms and keeps its plain far face.)
describe('bust far faces (D614, D615)', () => {
  const far = { ...at(2), human: compile(human_head, { lod: 2 }) };
  const busts = [
    ['human', HUMAN_BUST],
    ['elf', ELF_BUST],
  ] as const;
  it('fails on a mask without a mouth: lips, a dark line corner to corner and brows are inked', () => {
    for (const [name, b] of busts) {
      const head = part(far[name], 'head');
      const k = skullLandmarks(skullOf(b.skull ?? ELF_BUST.skull ?? never(), b.spec));
      // The mouth's line: flat-coloured triangles of their own across 80 % of the mouth.
      const [flat, all, ys] = inked(head, b, [0.4, 0, 0.6]);
      expect({ name, line: all }).toEqual({ name, line: Math.max(all, 6) });
      expect(flat).toBe(all);
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(
        1.6 * 0.8 * Math.abs(k.cheilion[1]),
      );
      const [, lipCount, , lipTris] = inked(head, b, [1, 0, 0]);
      const [, browCount, , browTris] = inked(head, b, [0, 1, 0]);
      expect(lipCount).toBeGreaterThanOrEqual(6);
      expect(browCount).toBeGreaterThanOrEqual(6);
      const colours = inkColours(b);
      expect({ name, lips: wears(head, lipTris, colours.lips) }).toEqual({ name, lips: true });
      expect({ name, brows: wears(head, browTris, colours.brows) }).toEqual({ name, brows: true });
      // The same triangles without their tint fail: position alone proves nothing.
      const bare = { ...head, colors: new Float32Array(head.colors.length).fill(0.5) };
      expect(wears(bare, lipTris, colours.lips)).toBe(false);
      expect(wears(bare, browTris, colours.brows)).toBe(false);
    }
  }, 120_000);
  it('the ink is the bust’s own colours, not the skin’s', () => {
    for (const [name, b] of busts) {
      const head = part(far[name], 'head');
      const k = skullLandmarks(skullOf(b.skull ?? ELF_BUST.skull ?? never(), b.spec));
      // Darkest vertex within 3 mm of the mouth's line against the cheek beside the nose.
      let line = 1;
      let cheek = 0;
      let n = 0;
      for (let i = 0; i < head.positions.length / 3; i++) {
        const [x, y, z] = [
          head.positions[i * 3] ?? 0,
          head.positions[i * 3 + 1] ?? 0,
          head.positions[i * 3 + 2] ?? 0,
        ];
        if (x < k.stomion[0] - 0.07 * b.spec.H) continue;
        if (Math.abs(y) < Math.abs(k.cheilion[1]) * 0.8 && Math.abs(z - k.stomion[2]) < 0.003)
          line = Math.min(line, lum(head, i));
        if (dmath.hypot(Math.abs(y) - Math.abs(k.cheek[1]), z - k.cheek[2]) < 0.012) {
          cheek += lum(head, i);
          n++;
        }
      }
      // (Uninked, the mouth was the skin's own value: 0.9–1.0 of the cheek's.)
      expect({ name, ratio: line / (cheek / Math.max(1, n)) < 0.75 }).toEqual({
        name,
        ratio: true,
      });
    }
  });
  it('fails on a blind far eye: four vertices or more stand on the iris, in its colour', () => {
    const e = HUMAN.EYE;
    const irisAt = (m: Mesh): number => {
      let n = 0;
      for (let i = 0; i < m.positions.length / 3; i++)
        if (
          Math.abs((m.colors[i * 3] ?? 0) - e.colours.iris[0]) < 0.02 &&
          Math.abs((m.colors[i * 3 + 2] ?? 0) - e.colours.iris[2]) < 0.02
        )
          n++;
      return n;
    };
    // The near ball at the far LOD's old 1 cm cell: no vertex in the iris's own colour.
    expect(irisAt(eyeball(e, 0.01))).toBe(0);
    expect(irisAt(eyeball(e, e.r * 0.6, 0, true))).toBeGreaterThanOrEqual(4);
  });
});

describe('far garment edges (D616)', () => {
  const quad: Mesh = {
    positions: Float32Array.from([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
    normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uvs: new Float32Array(8),
    colors: new Float32Array(12).fill(1),
    indices: Uint32Array.from([0, 1, 2, 0, 2, 3]),
  };
  /** The furthest any triangle of `m` reaches across the line x = `x0`, metres. */
  const across = (m: Mesh, x0: number): number => {
    let worst = 0;
    for (let t = 0; t < m.indices.length; t += 3) {
      const xs = [0, 1, 2].map((k) => (m.positions[(m.indices[t + k] ?? 0) * 3] ?? 0) - x0);
      worst = Math.max(worst, Math.min(Math.max(...xs), -Math.min(...xs)));
    }
    return worst;
  };
  it('slice: no triangle is left across the line, and the surface keeps its area', () => {
    expect(across(quad, 0.3)).toBeGreaterThan(0.25);
    const cut = slice(
      quad,
      (p) => p[0] - 0.3,
      () => true,
    );
    // (Bisected to 1/256 of a 1 m edge.)
    expect(across(cut, 0.3)).toBeLessThan(5e-3);
    expect(cut.indices.length / 3).toBe(6);
    // Outside `within` nothing is cut.
    expect(
      slice(
        quad,
        (p) => p[0] - 0.3,
        () => false,
      ),
    ).toBe(quad);
  });
  it('fails on a toothed colour edge: a garment’s blocks end on its own edge', () => {
    const shell = (name: string, r: number, color: Vec3, from: number): GarmentLayer => ({
      name,
      strip: 'plain',
      color,
      cell: [0.01, 0.01, 0.01],
      part: 'clothes',
      edits: [
        {
          field: (p) => Math.max(Math.abs(dmath.hypot(p[0], p[1], p[2]) - r) - 0.002, from - p[0]),
          bounds: [
            [-0.2, -0.2, -0.2],
            [0.2, 0.2, 0.2],
          ],
          color,
        },
      ],
    });
    // A vest over a shirt, ending at x = 13 mm: an edge that follows no line of the far grid.
    const shirt = shell('shirt', 0.1, [1, 1, 1], -1);
    const vest = shell('vest', 0.106, [0.3, 0.15, 0.05], 0.013);
    const far = sculpt({
      edits: [{ shape: 'sphere', at: [0, 0, 0], size: 0.104 }],
      resolution: 0.02,
      color: [0, 0, 0],
    });
    /** How far a triangle in the vest's colour reaches past the vest's edge, metres. */
    const teeth = (m: Mesh): number => {
      let worst = 0;
      for (let t = 0; t < m.indices.length; t += 3) {
        const v = [0, 1, 2].map((k) => m.indices[t + k] ?? 0);
        if ((m.colors[(v[0] ?? 0) * 3] ?? 0) > 0.6) continue;
        worst = Math.max(worst, 0.013 - Math.min(...v.map((i) => m.positions[i * 3] ?? 0)));
      }
      return worst;
    };
    // Blocks on the far cell's own triangles (the vest's colour by vertex): teeth a cell deep.
    const colors = new Float32Array(far.colors.length);
    for (let i = 0; i < far.positions.length / 3; i++)
      colors.set((far.positions[i * 3] ?? 0) > 0.013 ? [0.3, 0.15, 0.05] : [1, 1, 1], i * 3);
    expect(teeth(faceBlocks({ ...far, colors }))).toBeGreaterThan(0.006);
    expect(teeth(edgedColours(far, [shirt, vest]))).toBeLessThan(0.003);
  });
});

function never(): never {
  throw new Error('the fixture bust has no skull stage');
}
