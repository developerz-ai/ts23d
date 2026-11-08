// Export profiles: an unknown name fails with the list; each known profile changes only its
// documented defaults; no profile = the exact bytes of before.

import { describe, expect, it } from 'bun:test';
import { compile, defineAsset } from '../core/index.ts';
import { DEFAULT_SHEET, paintTrimSheet } from '../material/index.ts';
import { box } from '../primitives/index.ts';
import { toGlb } from './glb.ts';
import { type ExportProfile, PROFILES, profileSettings } from './profile.ts';

const crate = defineAsset({
  name: 'crate',
  kind: 'prop',
  budget: { triangles: [99, 99, 99] },
  physics: { body: 'dynamic' },
  build(ctx) {
    ctx.part('body', box({ size: [1, 1, 1], at: [0, 0, 0.5], color: [0.5, 0.4, 0.3] }));
  },
});
type G = {
  extras: Record<string, unknown>;
  materials: Record<string, unknown>[];
  nodes: { name: string }[];
};
const json = (glb: Uint8Array): G => {
  const n = new DataView(glb.buffer, glb.byteOffset).getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + n)));
};
const sheet = paintTrimSheet({ ...DEFAULT_SHEET, size: 512 });

describe('export profiles', () => {
  it('rejects an unknown profile with the list in the fix', () => {
    expect(() => profileSettings('unity5')).toThrow(/unknown export profile 'unity5'/);
    expect(() => toGlb(compile(crate), { profile: 'cry' as ExportProfile })).toThrow();
  });

  it('no profile: bytes unchanged, no extras.profile', () => {
    const a = toGlb(compile(crate), { sheet });
    expect(json(a).extras['profile']).toBeUndefined();
    expect(toGlb(compile(crate), { sheet })).toEqual(a);
  });

  it('rt drops the baked occlusion texture; the others keep it', () => {
    for (const profile of PROFILES) {
      const g = json(toGlb(compile(crate), { sheet, profile }));
      expect(g.extras['profile']).toBe(profile);
      const ao = g.materials.every((m) => 'occlusionTexture' in m);
      expect(ao).toBe(profile !== 'rt');
    }
  });

  it('unreal names collision UCX_, godot -convcolonly, only with physics on', () => {
    const names = (profile: ExportProfile, physics: boolean) =>
      json(toGlb(compile(crate), { profile, physics })).nodes.map((n) => n.name);
    expect(names('unreal', false).some((n) => n.startsWith('UCX_'))).toBe(false);
    expect(names('unreal', true).some((n) => n.startsWith('UCX_'))).toBe(true);
    expect(names('godot', true).some((n) => n.endsWith('-convcolonly'))).toBe(true);
    expect(names('web', true).some((n) => n.startsWith('UCX_') || n.includes('-conv'))).toBe(false);
  });

  it('defaults: web packs one MSFT_lod file at 2048, unreal/godot split at 4096', () => {
    expect(profileSettings('web')).toMatchObject({ lodFiles: 'single', sheetSize: 2048 });
    expect(profileSettings('unreal')).toMatchObject({ lodFiles: 'split', sheetSize: 4096 });
    expect(profileSettings('godot').lodFiles).toBe('split');
    expect(profileSettings('rt').ao).toBe(false);
  });
});
