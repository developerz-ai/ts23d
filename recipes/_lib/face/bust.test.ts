// The bust's skin zones follow the character: a shaven beard's cut-hair dots (the stubble strip)
// thin out with `wear.stubble.amount`, and none at 0 (D531: the strip took the beard's region
// only, so amount 0 still drew dark dots the paint had turned off).

import { describe, expect, it } from 'bun:test';
import { compile, defineAsset, stripRect } from '@developerz.ai/ts23d';
import { CHARACTERS } from '../../face_demo/characters.ts';
import { buildFaceBust, type FaceBust } from './bust.ts';
import { SKIN_STUBBLE, skinFinish } from './skin-strip.ts';

/** Triangles of the human bust's skin on the stubble strip, at stubble `amount` (LOD 1). */
function stubbleTriangles(amount: number): number {
  const human = CHARACTERS.human;
  const wear = human.character.wear;
  if (!wear?.stubble) throw new Error('the human fixture lost its stubble');
  const b: FaceBust = {
    ...human,
    character: { ...human.character, wear: { ...wear, stubble: { ...wear.stubble, amount } } },
  };
  const asset = compile(
    defineAsset({
      name: `stubble_${Math.round(amount * 10)}`,
      kind: 'character',
      budget: { triangles: [80000, 16500, 4400] },
      finishes: { cornea: { clearcoat: 1 }, skin: skinFinish('#8c7b72') },
      build: (ctx) => buildFaceBust(ctx, b),
    }),
    { lod: 1 },
  );
  const skin = asset.parts.find((p) => p.name === 'skin')?.mesh;
  if (!skin) throw new Error('no skin part');
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
