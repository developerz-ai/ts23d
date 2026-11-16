import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ToolProc } from '../neural/index.ts';
import { doctor, doctorMain } from './doctor-cmd.ts';
import { type Host, parseGpus, refusal } from './tier-probe.ts';

const proc = (stdout: string, code = 0): ToolProc => ({
  code,
  stdout,
  stderr: '',
  timedOut: false,
  missing: false,
});
const MISSING: ToolProc = { code: null, stdout: '', stderr: '', timedOut: false, missing: true };

/** A machine where only the commands in `cmds` exist (keyed by exe + first arg). */
function fakeHost(
  cmds: Record<string, string>,
  o: { env?: Record<string, string>; files?: string[]; fetch?: Host['fetch'] } = {},
): Host {
  const home = mkdtempSync(join(tmpdir(), 't3d-doctor-'));
  return {
    env: { TS23D_HOME: home, HOME: home, ...o.env },
    platform: 'linux',
    exec: (exe, args) => {
      const out = cmds[`${exe} ${args[0] ?? ''}`.trim()];
      return Promise.resolve(out === undefined ? MISSING : proc(out));
    },
    fetch: o.fetch ?? (() => Promise.reject(new Error('offline'))),
    exists: (p) => (o.files ?? []).some((f) => p === f || p.startsWith(`${f}/`)),
  };
}

const smi = (name: string, mib: number, driver = '560.35.03'): Record<string, string> => ({
  'nvidia-smi --query-gpu=name,memory.total,driver_version': `${name}, ${mib}, ${driver}\n`,
  'nvidia-smi': '| NVIDIA-SMI 560.35.03   Driver Version: 560.35.03   CUDA Version: 12.6 |',
});

describe('t3d doctor', () => {
  test('bare machine (no uv, no tools, no GPU): every missing item has a fix, CPU tier ok, exit 0', async () => {
    const host = fakeHost({});
    const r = await doctor(host);
    expect(r.checks.find((c) => c.id === 'bun')?.status).toBe('ok');
    for (const id of ['uv', 'blender', 'godot', 'basisu', 'gltfpack'])
      expect(r.checks.find((c) => c.id === id)?.status).toBe('missing');
    for (const c of r.checks.filter((c) => c.status !== 'ok')) expect(c.fix).toBeTruthy();
    expect(r.checks.find((c) => c.id === 'uv')?.fix).toContain('t3d setup tools');
    expect(await doctorMain(['--json'], true, host)).toBe(0);
  });

  test('no GPU: recommends kubeez for images with the key, and refuses both GPU profiles', async () => {
    const r = await doctor(fakeHost({}));
    const k = r.checks.find((c) => c.id === 'kubeez');
    expect(k?.detail).toContain('kubeez.com');
    expect(k?.detail).toContain('partner');
    expect(k?.fix).toContain('KUBEEZ_API_KEY');
    const m = r.checks.find((c) => c.id === 'meshy');
    expect([m?.status, m?.detail.includes('not set'), m?.fix?.includes('MESHY_API_KEY')]).toEqual([
      'info',
      true,
      true,
    ]);
    expect(r.profiles.tools.fits).toBe(true);
    expect(r.profiles['gpu-min']).toEqual({
      fits: false,
      reason: 'gpu-min needs an NVIDIA GPU with ≥ 8 GB; nvidia-smi found none',
    });
    expect(r.checks.find((c) => c.id === 'nvidia')?.status).toBe('info');
  });

  test('MESHY_API_KEY set: the meshy line is ok and never shows the key', async () => {
    const r = await doctor(fakeHost({}, { env: { MESHY_API_KEY: 'msy_never_printed' } }));
    const m = r.checks.find((c) => c.id === 'meshy');
    expect([m?.status, m?.detail.includes('is set')]).toEqual(['ok', true]);
    expect(JSON.stringify(r)).not.toContain('msy_never_printed');
  });

  test('a 6 GB card: gpu-full and gpu-min refused with the reason, venv fix does not send you to them', async () => {
    const r = await doctor(fakeHost(smi('NVIDIA GeForce GTX 1060 6GB', 6144)));
    expect(r.profiles['gpu-full'].reason).toBe(
      'gpu-full needs ≥ 24 GB of VRAM; nvidia-smi reports NVIDIA GeForce GTX 1060 6GB with 6.0 GB',
    );
    expect(r.profiles['gpu-min'].fits).toBe(false);
    expect(r.checks.find((c) => c.id === 'venv')?.fix).toContain('kubeez.com');
    expect(r.checks.find((c) => c.id === 'kubeez')).toBeDefined();
  });

  test('a 24 GB card with tools present: green tools, gpu-full fits, no kubeez nag', async () => {
    const host = fakeHost(
      {
        ...smi('NVIDIA GeForce RTX 3090', 24576, '615.71.09'),
        'uv --version': 'uv 0.13.8 (x)',
        'blender --version': 'Blender 5.3.0\n',
        'godot --headless': '4.7.2.stable.official.ed1daf0bf\n',
        'basisu -version': 'Basis Universal LDR/HDR GPU Texture Supercompression System v2.50.0',
        'gltfpack -v': 'gltfpack 1.3',
      },
      {},
    );
    const r = await doctor(host);
    for (const id of ['uv', 'blender', 'godot', 'basisu', 'gltfpack'])
      expect(r.checks.find((c) => c.id === id)?.status).toBe('ok');
    expect(r.profiles['gpu-full'].fits).toBe(true);
    expect(r.checks.find((c) => c.id === 'kubeez')).toBeUndefined();
    expect(r.checks.find((c) => c.id === 'nvidia')?.detail).toContain('CUDA ≤ 12.6');
  });

  test('gated licences are checked with HF_TOKEN, which never reaches the report', async () => {
    const token = 'hf_secret_never_printed';
    const seen: string[] = [];
    const host = fakeHost(smi('RTX', 24576, '615.71.09'), {
      env: { HF_TOKEN: token },
      fetch: (url, init) => {
        seen.push(new Headers(init?.headers).get('authorization') ?? '');
        return Promise.resolve(new Response(null, { status: url.includes('sam3') ? 403 : 200 }));
      },
    });
    const r = await doctor(host);
    expect(seen.filter((h) => h === `Bearer ${token}`).length).toBe(3);
    expect(r.checks.find((c) => c.id === 'gated:facebook/sam3')?.detail).toContain('HTTP 403');
    expect(r.checks.find((c) => c.id === 'gated:briaai/RMBG-2.0')?.status).toBe('ok');
    expect(JSON.stringify(r)).not.toContain(token);
  });

  test('an unknown argument is a usage error (exit 2)', async () => {
    expect(await doctorMain(['--fast'], true, fakeHost({}))).toBe(2);
  });
});

describe('GPU gates', () => {
  test('parseGpus reads nvidia-smi csv and ignores noise', () => {
    expect(parseGpus('NVIDIA GeForce RTX 3090, 24576, 615.71.09\n\nNo devices\n')).toEqual([
      { name: 'NVIDIA GeForce RTX 3090', vramMb: 24576, driver: '615.71.09' },
    ]);
  });

  test('refusal: VRAM, driver and OS', () => {
    const g = (vramMb: number, driver = '615.71') => ({ name: 'G', vramMb, driver });
    expect(refusal('gpu-full', 'linux', g(24576))).toBeUndefined();
    expect(refusal('gpu-full', 'linux', g(12288))).toContain('≥ 24 GB');
    expect(refusal('gpu-min', 'linux', g(8192))).toBeUndefined();
    expect(refusal('gpu-min', 'linux', g(8192, '535.10'))).toContain('driver ≥ 550');
    expect(refusal('tools', 'linux')).toBeUndefined();
    expect(refusal('tools', 'darwin')).toContain('darwin is planned');
  });
});
