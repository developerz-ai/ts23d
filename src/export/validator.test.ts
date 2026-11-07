// The Khronos glTF-Validator is the referee: every GLB shape we emit (plain, animated, multi-
// surface, emitters + sockets) must validate with zero errors. Caught a sealed-buffer bug once.

import { describe, expect, it } from 'bun:test';
import { validateBytes } from 'gltf-validator';
import { compile, defineAsset } from '../core/index.ts';
import { DEFAULT_SHEET, paintTrimSheet } from '../material/index.ts';
import { box, cylinder } from '../primitives/index.ts';
import { toGlb } from './glb.ts';

const c: [number, number, number] = [0.6, 0.5, 0.4];
const sample = defineAsset({
  name: 'sample',
  kind: 'vehicle',
  budget: { triangles: [9999, 9999, 9999] },
  build(ctx) {
    ctx.part('hull', box({ size: [2, 1, 0.6], at: [0, 0, 0.3], color: c }));
    ctx.part('window', box({ size: [0.05, 0.6, 0.3], at: [1.0, 0, 0.6], color: [0.6, 0.8, 0.9] }), {
      surface: 'glass',
    });
    ctx.group('turret', {
      at: [0, 0, 0.9],
      motion: { kind: 'sway', axis: [0, 0, 1], degrees: 20, hz: 0.2 },
    });
    ctx.part('turret_body', box({ size: [0.8, 0.8, 0.3], color: c }), { parent: 'turret' });
    ctx.part('wheel', cylinder({ radius: 0.3, length: 0.2, segments: 16, axis: 'y', color: c }), {
      at: [0.6, 0.6, 0.3],
      motion: { kind: 'spin', axis: [0, 1, 0], rps: 1 },
    });
    ctx.emitter('exhaust', { kind: 'smoke', at: [-1, 0, 0.7], rate: 5, life: 2, size: [0.1, 0.8] });
    ctx.socket('seat_driver', { kind: 'seat', at: [0.5, 0.2, 0.6] });
    ctx.part('lamp', box({ size: [0.05, 0.2, 0.2], at: [1.02, 0.3, 0.45], color: [1, 1, 0.9] }));
    ctx.socket('headlamp', {
      kind: 'light',
      at: [1.06, 0.3, 0.55],
      dir: [1, 0, -0.1],
      data: { light: 'spot', color: '#ffe8c0', intensity: 200, range: 30, cone: 25 },
    });
    ctx.socket('cabin_light', { kind: 'light', at: [0, 0, 0.8], data: { light: 'point' } });
  },
});

// The validator (compiled Dart) calls Math.random internally; our preload seals it. Give the
// third-party code a seeded stand-in for the duration of the call — ours stays sealed.
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

type Message = { severity: number; code: string; pointer?: string };
const worst = (report: { issues: { messages: Message[] } }, severity: number): Message[] =>
  report.issues.messages.filter((m) => m.severity <= severity);
const full = {
  glow: [{ parts: ['lamp'], color: [1, 0.9, 0.7] as const, strength: 6 }],
  meta: {
    creators: ['ts23d test'],
    copyright: '© 2026 developerz.ai',
    license: 'MIT',
    sources: ['https://example.org/spec'],
    description: 'validator fixture',
  },
};

describe('glTF-Validator', () => {
  for (const animations of [false, true]) {
    it(`reports 0 errors and 0 warnings (animations: ${animations})`, async () => {
      const report = await validate(toGlb(compile(sample), { animations }));
      expect(worst(report, 1)).toEqual([]);
    });
  }

  it('reports 0 errors and 0 warnings with lights, glow and XMP metadata, unoptimised too', async () => {
    for (const optimize of [true, false]) {
      const report = await validate(
        toGlb(compile(sample), { ...full, optimize, animations: true }),
      );
      expect(worst(report, 1)).toEqual([]);
      // Lights and emissive strength are validated; validator 2.0.0-dev.3.10 predates
      // KHR_xmp_json_ld (info only), so glb.test.ts checks the packet's shape itself.
      const unsupported = report.issues.messages
        .filter((m: Message) => m.code === 'UNSUPPORTED_EXTENSION')
        .map((m: Message & { message?: string }) => m.message ?? '');
      expect(unsupported.every((m: string) => m.includes('KHR_xmp_json_ld'))).toBe(true);
    }
  });

  it('reports 0 errors and 0 warnings with the trim sheet embedded', async () => {
    const sheet = paintTrimSheet({ ...DEFAULT_SHEET, size: 512 });
    const report = await validate(toGlb(compile(sample), { sheet }));
    const bad = report.issues.messages.filter((m: { severity: number }) => m.severity <= 1);
    expect(bad).toEqual([]);
    // The local gltf-validator typings omit `info`; it is in the report at runtime.
    expect((report as { info?: { hasTextures?: boolean } }).info?.hasTextures).toBe(true);
    const unusedUv = report.issues.messages.filter(
      (m: { code: string; pointer?: string }) =>
        m.code === 'UNUSED_OBJECT' && (m.pointer ?? '').includes('TEXCOORD_0'),
    );
    expect(unusedUv).toEqual([]);
  });
});
