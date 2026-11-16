// Skin transmission in the GLB: only a `skin` / `skin_*` finish writes it; the block carries
// KHR_materials_diffuse_transmission + KHR_materials_volume in range, is listed as used and never
// required, and the Khronos glTF-Validator passes the file with 0 errors / 0 warnings.

import { describe, expect, it } from 'bun:test';
import { validateBytes } from 'gltf-validator';
import { compile, defineAsset } from '../core/index.ts';
import { DEFAULT_SHEET, paintTrimSheet } from '../material/index.ts';
import { box } from '../primitives/index.ts';
import { toGlb } from './glb.ts';
import { DIFFUSE_TRANSMISSION, isSkinFinish, SKIN_TRANSMISSION } from './transmission.ts';

type Ext = Record<string, Record<string, unknown>>;
type Gltf = {
  extensionsUsed?: string[];
  extensionsRequired?: string[];
  materials: { name: string; extensions?: Ext }[];
};
const jsonOf = (glb: Uint8Array): Gltf => {
  const dv = new DataView(glb.buffer, glb.byteOffset);
  return JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + dv.getUint32(12, true))));
};

const head = (finish: string) =>
  defineAsset({
    name: 'bust',
    kind: 'character',
    budget: { triangles: [99, 99, 99] },
    finishes: { [finish]: { sheen: { colour: '#40201a', roughness: 0.6 } } },
    build(ctx) {
      ctx.part('head', box({ size: [0.2, 0.2, 0.25], color: [0.8, 0.6, 0.5] }), { finish });
      ctx.part('plinth', box({ size: [0.3, 0.3, 0.05], color: [0.2, 0.2, 0.2] }));
    },
  });

// The validator (compiled Dart) calls Math.random; seal it as pbr-validator.test.ts does.
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
type Message = { severity: number; code: string; message?: string };

describe('skin diffuse transmission', () => {
  it('writes nothing for a finish that is not skin', () => {
    const g = jsonOf(toGlb(compile(head('velvet'))));
    expect(g.extensionsUsed ?? []).not.toContain(DIFFUSE_TRANSMISSION);
    expect(isSkinFinish('skinny_jeans')).toBe(false);
    expect(isSkinFinish('skin_pale')).toBe(true);
  });

  it('a skin finish writes diffuse transmission + volume, used and never required', () => {
    const g = jsonOf(toGlb(compile(head('skin'))));
    const m = g.materials.find((x) => x.name === 'ts23d_finish_skin');
    const dt = m?.extensions?.[DIFFUSE_TRANSMISSION];
    expect(dt?.['diffuseTransmissionFactor']).toBe(SKIN_TRANSMISSION.factor);
    const colour = dt?.['diffuseTransmissionColorFactor'] as number[];
    expect(colour).toHaveLength(3);
    for (const c of colour) expect(c >= 0 && c <= 1).toBe(true);
    const vol = m?.extensions?.['KHR_materials_volume'];
    expect(vol?.['thicknessFactor']).toBeGreaterThan(0);
    expect(vol?.['attenuationDistance']).toBeGreaterThan(0);
    // The finish's own sheen survives alongside.
    expect(m?.extensions?.['KHR_materials_sheen']).toBeDefined();
    expect(g.extensionsUsed).toContain(DIFFUSE_TRANSMISSION);
    expect(g.extensionsRequired ?? []).not.toContain(DIFFUSE_TRANSMISSION);
  });

  it('passes the Khronos glTF-Validator with 0 errors / 0 warnings, with and without the sheet', async () => {
    const sheet = paintTrimSheet({ ...DEFAULT_SHEET, size: 512 });
    for (const o of [{}, { sheet }]) {
      const r = await validate(toGlb(compile(head('skin')), o));
      const bad = (r.issues.messages as Message[]).filter((x) => x.severity <= 1);
      expect(bad).toEqual([]);
    }
  });
});
