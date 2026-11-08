// The Khronos glTF-Validator on every PBR extension we write: lacquered paint + liveries,
// sheen/anisotropy/iridescence/specular finishes, ice/liquid/jelly and optics overrides, with
// and without the trim sheet, and under each export profile. Zero errors, zero warnings.

import { describe, expect, it } from 'bun:test';
import { validateBytes } from 'gltf-validator';
import { compile, defineAsset, srgbToLinear } from '../core/index.ts';
import { DEFAULT_SHEET, paintTrimSheet } from '../material/index.ts';
import { box } from '../primitives/index.ts';
import { toGlb } from './glb.ts';
import { PROFILES } from './profile.ts';

const c: [number, number, number] = [0.6, 0.6, 0.6];
const showcase = defineAsset({
  name: 'pbr_fixture',
  kind: 'prop',
  budget: { triangles: [999, 999, 999] },
  paint: { body: { colour: '#b01818', clearcoat: 1, metallicFlake: 0.6 } },
  variants: { blue: { body: '#1830b0' } },
  finishes: {
    velvet: { sheen: { colour: '#c04060' } },
    brushed: { metallic: 1, roughness: 0.3, anisotropy: { strength: 0.8, rotation: 1.2 } },
    heat: { metallic: 1, roughness: 0.25, iridescence: { ior: 2, thickness: [250, 600] } },
    satin: { specular: { factor: 0.6, colour: '#ffe0c0' }, clearcoat: 0.4 },
  },
  optics: { glass: { ior: 1.52, attenuationColour: '#d8f0e8', attenuationDistance: 0.3 } },
  build(ctx) {
    ctx.part('body', box({ size: [2, 1, 0.5], at: [0, 0, 0.25], color: srgbToLinear('#b01818') }), {
      paint: 'body',
    });
    ['velvet', 'brushed', 'heat', 'satin'].forEach((f, i) => {
      ctx.part(`p_${f}`, box({ size: [0.3, 0.3, 0.2], at: [-0.8 + i * 0.5, 0, 0.6], color: c }), {
        finish: f,
      });
    });
    ['glass', 'ice', 'liquid', 'jelly', 'translucent'].forEach((s, i) => {
      ctx.part(`t_${s}`, box({ size: [0.2, 0.2, 0.2], at: [-0.8 + i * 0.4, 0.3, 0.9], color: c }), {
        surface: s as 'glass',
      });
    });
  },
});

// The validator (compiled Dart) calls Math.random; our preload seals it (see validator.test.ts).
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
type Message = { severity: number; code: string; pointer?: string; message?: string };
const bad = (r: { issues: { messages: Message[] } }): Message[] =>
  r.issues.messages.filter((m) => m.severity <= 1);

describe('glTF-Validator: PBR extensions', () => {
  it('a broken extension block IS caught (the referee works)', async () => {
    const glb = toGlb(compile(showcase));
    const text = new TextDecoder().decode(glb);
    // Same length: corrupt a factor's value into an out-of-range one.
    const broken = text.replace('"clearcoatFactor":1', '"clearcoatFactor":9');
    expect(broken).not.toBe(text);
    const r = await validate(new TextEncoder().encode(broken));
    expect(bad(r).length).toBeGreaterThan(0);
  });

  it('0 errors / 0 warnings, untextured and with the sheet; every extension recognised', async () => {
    const sheet = paintTrimSheet({ ...DEFAULT_SHEET, size: 512 });
    for (const o of [{}, { sheet }]) {
      const r = await validate(toGlb(compile(showcase), o));
      expect(bad(r)).toEqual([]);
      const unsupported = r.issues.messages.filter((m) => m.code === 'UNSUPPORTED_EXTENSION');
      expect(unsupported.filter((m) => (m.message ?? '').includes('KHR_materials'))).toEqual([]);
    }
  });

  it('0 errors / 0 warnings under every profile', async () => {
    for (const profile of PROFILES) {
      const r = await validate(toGlb(compile(showcase), { profile }));
      expect(bad(r)).toEqual([]);
    }
  });
});
