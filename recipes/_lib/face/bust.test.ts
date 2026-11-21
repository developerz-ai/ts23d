// The bust's skin zones follow the character: a shaven beard's cut-hair dots (the stubble strip)
// thin out with `wear.stubble.amount`, and none at 0 (D531: the strip took the beard's region
// only, so amount 0 still drew dark dots the paint had turned off). Its skin reads the pore
// strips at an even texel density at every LOD (D550).

import { describe, expect, it } from 'bun:test';
import { compile, defineAsset, type Lod, type Mesh, stripRect } from '@developerz.ai/ts23d';
import { CHARACTERS } from '../../face_demo/characters.ts';
import { WOOL } from '../bust/cloth-strips.ts';
import { buildFaceBust, type FaceBust } from './bust.ts';
import {
  SKIN_CLEAR,
  SKIN_FINE,
  SKIN_FRECKLED,
  SKIN_MATTE,
  SKIN_OILY,
  SKIN_ROW,
  SKIN_STRIP,
  SKIN_STUBBLE,
  SKIN_WET,
  skinFinish,
} from './skin-strip.ts';
import { directionJumps, texelSpread } from './texel-spread.ts';

/** The bust `b`'s skin part at `lod`. */
function skinOf(b: FaceBust, name: string, lod: Lod): Mesh {
  const asset = compile(
    defineAsset({
      name,
      kind: 'character',
      budget: { triangles: [80000, 16500, 4400] },
      finishes: { cornea: { clearcoat: 1 }, skin: skinFinish('#8c7b72') },
      build: (ctx) => buildFaceBust(ctx, b),
    }),
    { lod },
  );
  const skin = asset.parts.find((p) => p.name === 'skin')?.mesh;
  if (!skin) throw new Error('no skin part');
  return skin;
}

/** Triangles of the human bust's skin on the stubble strip, at stubble `amount` (LOD 1). */
function stubbleTriangles(amount: number): number {
  const human = CHARACTERS.human;
  const wear = human.character.wear;
  if (!wear?.stubble) throw new Error('the human fixture lost its stubble');
  const b: FaceBust = {
    ...human,
    character: { ...human.character, wear: { ...wear, stubble: { ...wear.stubble, amount } } },
  };
  const skin = skinOf(b, `stubble_${Math.round(amount * 10)}`, 1);
  const r = stripRect(SKIN_STUBBLE);
  let n = 0;
  for (let t = 0; t < skin.indices.length; t += 3) {
    const v = skin.indices[t] ?? 0;
    const y = skin.uvs[v * 2 + 1] ?? 0;
    if (y >= Math.min(r.v0, r.v1) && y <= Math.max(r.v0, r.v1)) n++;
  }
  return n;
}

describe('face bust stubble', () => {
  it('draws no cut hairs at amount 0 and fewer at a light amount', () => {
    const full = stubbleTriangles(1);
    const light = stubbleTriangles(0.4);
    expect(full).toBeGreaterThan(50);
    expect(stubbleTriangles(0)).toBe(0);
    expect(light).toBeGreaterThan(0.2 * full);
    expect(light).toBeLessThan(0.6 * full);
  });
});

describe('face bust skin texels', () => {
  // The pore strips have no direction: all 13 planes, true scale within their tilt.
  const PORES = [SKIN_STRIP, SKIN_OILY, SKIN_MATTE, SKIN_CLEAR, SKIN_FRECKLED, SKIN_STUBBLE];
  // The lids' fine lines and the lips' run one way: level planes only (D562), a wider tilt.
  const LINES = [SKIN_FINE, SKIN_WET];
  const near = skinOf(CHARACTERS.human, 'texels_1', 1);
  it('fails on smeared or stretched pores (D550): even texel density at the near and far LOD', () => {
    // LOD1's 1 cm triangles: true scale within the projection planes' tilt everywhere.
    const pores = texelSpread(near, PORES, SKIN_ROW);
    expect(pores.p95).toBeLessThan(1.15);
    expect(pores.worst).toBeLessThan(1.25);
    const lines = texelSpread(near, LINES, SKIN_ROW);
    expect(lines.p95).toBeLessThan(1.45);
    expect(lines.smear).toBeLessThan(1.45);
    // LOD2's triangles outgrow the 16 mm row: they may read the pores larger, never smeared.
    const far = texelSpread(
      skinOf(CHARACTERS.human, 'texels_2', 2),
      [...PORES, ...LINES],
      SKIN_ROW,
    );
    expect(far.smear).toBeLessThan(1.15);
  });

  it('fails on a knit broken into patches (D562): the tunic weave keeps its direction', () => {
    // Share of the tunic's edge length where the wool's V direction turns more than 20°: 13
    // projection planes chosen per triangle raised it from 0.05 (creases, the top plane's seam on
    // the shoulders) to 0.089, hard-edged triangles of rib running another way.
    expect(directionJumps(near, [WOOL], 20)).toBeLessThan(0.06);
  });
});
