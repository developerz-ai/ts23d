import { describe, expect, it } from 'bun:test';
import type { CompiledAsset, Mesh, Vec3 } from '@developerz.ai/ts23d';
import { scalpCoverCheck } from './scalp-check.ts';

const SKIN: Vec3 = [0.66, 0.31, 0.16];
const HAIR: Vec3 = [0.04, 0.02, 0.01];
/** A row of vertices up a head side, z = 0 … 0.1; the hairline is z = 0.05. */
function row(color: (z: number) => Vec3): Mesh {
  const zs = Array.from({ length: 21 }, (_, i) => i * 0.005);
  return {
    positions: new Float32Array(zs.flatMap((z) => [0, 0, z])),
    normals: new Float32Array(zs.length * 3),
    uvs: new Float32Array(zs.length * 2),
    colors: new Float32Array(zs.flatMap((z) => [...color(z)])),
    indices: new Uint32Array(0),
  };
}
const asset = (m: Mesh): CompiledAsset =>
  ({ parts: [{ name: 'head', mesh: m, at: [0, 0, 0] }] }) as unknown as CompiledAsset;
const check = scalpCoverCheck({ part: 'head', line: (p) => 0.05 - p[2], hair: HAIR, skin: SKIN });

describe('scalp coverage check (D57)', () => {
  it('fails a cap whose front band blends back to skin (the bald patch under the cards)', () => {
    // Skin up to 2 cm inside the line: the cap's thickness eased to zero, the skin won.
    const f = check(asset(row((z) => (z < 0.07 ? SKIN : HAIR))));
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('bare scalp');
    expect(f[0]?.fix).toContain('scalp');
  });
  it('counts AO-darkened skin as skin', () => {
    const dim: Vec3 = [SKIN[0] * 0.55, SKIN[1] * 0.55, SKIN[2] * 0.55];
    expect(check(asset(row((z) => (z < 0.07 ? dim : HAIR))))).toHaveLength(1);
  });
  it('passes a hair-coloured scalp with a soft skin edge at the line', () => {
    expect(check(asset(row((z) => (z < 0.053 ? SKIN : HAIR))))).toHaveLength(0);
  });
  it('ignores an asset without the part', () => {
    expect(check({ parts: [] } as unknown as CompiledAsset)).toHaveLength(0);
  });
});
