import { describe, expect, test } from 'bun:test';
import { compile, toGlb, triangleCount } from '@developerz.ai/ts23d';
import { readGlbChunks } from '@developerz.ai/ts23d/export';
import { sound_demo } from '../../../recipes/sound_demo/sound_demo.ts';
import { t34 } from '../../../recipes/t34/t34.ts';
import { wolf } from '../../../recipes/wolf/wolf.ts';
import { exportOptions, nodeParts } from './glb-export.ts';

type Node = { readonly name?: string };
const nodeNames = (glb: Uint8Array): string[] =>
  (readGlbChunks(glb).json['nodes'] as Node[]).map((n) => n.name ?? '');

describe('nodeParts', () => {
  const c = compile(t34, { lod: 2 });
  const glb = toGlb(c, exportOptions({}));
  const roles = c.parts.map((p) => ({
    name: p.name,
    motion: p.motion?.kind ?? null,
    emitter: p.emitter?.kind ?? null,
  }));
  const parts = nodeParts(glb, roles);
  const names = parts.map((p) => p.name);

  test('compile parts merged into their pivot are not nodes, so they are not listed', () => {
    const nodes = nodeNames(glb);
    // The defect: these five rows were listed and hovering them outlined nothing.
    for (const merged of ['hull', 'fittings', 'turret_body', 'gun_mantlet', 'gun_barrel']) {
      expect(c.parts.map((p) => p.name)).toContain(merged);
      expect(nodes).not.toContain(merged);
      expect(names).not.toContain(merged);
    }
    for (const name of names) expect(nodes).toContain(name);
  });

  test('lists the merged body and the pivots, each under its parent, parents first', () => {
    expect(names).toContain('body');
    expect(names).not.toContain('t34');
    expect(parts.find((p) => p.name === 'turret')?.parent).toBeNull();
    expect(parts.find((p) => p.name === 'gun')?.parent).toBe('turret');
    expect(parts.find((p) => p.name === 'muzzle')?.parent).toBe('gun');
    for (const [i, p] of parts.entries())
      if (p.parent !== null) expect(names.indexOf(p.parent)).toBeLessThan(i);
  });

  test('no triangle is lost in the merge, and motion and emitters keep their rows', () => {
    const compiled = c.parts.reduce((n, p) => n + (p.mesh ? triangleCount(p.mesh) : 0), 0);
    expect(parts.reduce((n, p) => n + p.triangles, 0)).toBe(compiled);
    expect(parts.find((p) => p.name === 'wheel_l_0')?.motion).toBe(
      roles.find((r) => r.name === 'wheel_l_0')?.motion ?? null,
    );
    expect(parts.find((p) => p.name === 'exhaust_smoke_l')?.emitter).not.toBeNull();
  });

  test('a skinned asset lists its mesh, not its bones', () => {
    const w = compile(wolf, { lod: 2 });
    const listed = nodeParts(toGlb(w, exportOptions({})), []).map((p) => p.name);
    // The coat's finish splits the skin into `body` or `body_finish_<name>` nodes.
    expect(listed.some((n) => n === 'body' || n.startsWith('body_finish_'))).toBe(true);
    expect(listed).not.toContain('spine_0');
  });
});

describe('exportOptions', () => {
  const c = compile(sound_demo, { lod: 2 });
  const wavs = (glb: Uint8Array): string[] =>
    JSON.stringify(readGlbChunks(glb).json).match(/"[^"]*\.wav"/g) ?? [];

  test('a download references no WAV file: nothing ships beside the GLB', () => {
    // The defect: the exporter's default writes KHR_audio_emitter with `<clip>.wav` URIs.
    expect(wavs(toGlb(c, { animations: true })).length).toBeGreaterThan(0);
    const glb = toGlb(c, exportOptions({}));
    expect(wavs(glb)).toEqual([]);
    expect(readGlbChunks(glb).json['extensionsUsed']).not.toContain('KHR_audio_emitter');
  });

  test('clips are baked and parts merged unless the request says otherwise', () => {
    expect(exportOptions({})).toEqual({ animations: true, keepParts: false, sounds: false });
    expect(exportOptions({ animations: false, keepParts: true })).toEqual({
      animations: false,
      keepParts: true,
      sounds: false,
    });
  });
});
