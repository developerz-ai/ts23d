// What `t3d doctor`, `t3d setup` and `t3d server` share about the optional tier: where it lives
// ($TS23D_HOME, default ~/.ts23d; uninstall = delete the folder), the three setup profiles and the
// GPU each needs, and the probes (nvidia-smi, a tool's version, a file). Everything a probe touches
// comes through `Host`, so tests run with a fake nvidia-smi and no network.

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nodeExec, type ToolExec } from '../neural/index.ts';

export interface Host {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly platform: NodeJS.Platform;
  readonly exec: ToolExec;
  readonly fetch: (url: string, init?: RequestInit) => Promise<Response>;
  readonly exists: (path: string) => boolean;
}

export const realHost = (): Host => ({
  env: process.env,
  platform: process.platform,
  exec: nodeExec,
  fetch: (url, init) => fetch(url, init),
  exists: existsSync,
});

/** One line of `t3d doctor`: every status but ok carries the exact fix. */
export interface Check {
  readonly id: string;
  readonly group: 'cpu' | 'tools' | 'gpu' | 'models' | 'server' | 'hosted';
  /** ok · missing (needed for its tier) · warn (works, degraded) · info (optional, a hint) */
  readonly status: 'ok' | 'missing' | 'warn' | 'info';
  readonly detail: string;
  readonly fix?: string;
}

export type SetupProfile = 'tools' | 'gpu-min' | 'gpu-full';

export interface ProfileInfo {
  /** Smallest card it runs on, GB of VRAM (0 = no GPU needed). */
  readonly minGb: number;
  /** Disk it takes under $TS23D_HOME (and $HF_HOME), GB, roughly. */
  readonly diskGb: number;
  readonly summary: string;
}

export const PROFILES: Readonly<Record<SetupProfile, ProfileInfo>> = {
  tools: {
    minGb: 0,
    diskGb: 3,
    summary: 'bpy (Blender as a module), Godot headless, basisu, gltfpack, Material Maker; no GPU',
  },
  'gpu-min': {
    minGb: 8,
    diskGb: 30,
    summary: 'TRELLIS.2 GGUF through ComfyUI (low VRAM) + DINOv2 scoring; image: kubeez.com',
  },
  'gpu-full': {
    minGb: 24,
    diskGb: 80,
    summary:
      'Pixal3D, TRELLIS.2, DINOv2 (+ optional video-motion, UniRig, UniMate, HairDeck); one model resident at a time',
  },
};

export const isSetupProfile = (p: string | undefined): p is SetupProfile =>
  p !== undefined && Object.hasOwn(PROFILES, p);

/** The default server port (examples/neural-server/server.py, every profile). */
export const SERVER_PORT = 8190;

export interface TierPaths {
  readonly home: string;
  /** uv installed by setup when none is on PATH. */
  readonly bin: string;
  readonly toolsBin: string;
  readonly bpyPython: string;
  readonly materialMaker: string;
  /** The model venv: $TS23D_NEURAL_VENV (an existing one) or <home>/neural/.venv. */
  readonly venv: string;
  readonly python: string;
  /** Local CUDA toolkit and gcc shim sit beside the venv (setup's layout and SETUP.md's). */
  readonly cudaHome: string;
  readonly toolchain: string;
  readonly serverToml: string;
  readonly pidFile: string;
  readonly serverLog: string;
  readonly hfHome: string;
}

const expand = (p: string): string => (p.startsWith('~/') ? join(homedir(), p.slice(2)) : p);

export function tierPaths(env: Host['env']): TierPaths {
  const home = resolve(expand(env['TS23D_HOME'] || join(homedir(), '.ts23d')));
  const venv = resolve(expand(env['TS23D_NEURAL_VENV'] || join(home, 'neural', '.venv')));
  const neural = join(home, 'neural');
  return {
    home,
    bin: join(home, 'bin'),
    toolsBin: join(home, 'tools', 'bin'),
    bpyPython: join(home, 'venv-bpy', '.venv', 'bin', 'python'),
    materialMaker: join(home, 'tools', 'material-maker'),
    venv,
    python: join(venv, 'bin', 'python'),
    cudaHome: join(dirname(venv), 'cuda-12.4'),
    toolchain: join(dirname(venv), 'toolchain-bin'),
    serverToml: join(neural, 'server.toml'),
    pidFile: join(neural, 'server.pid'),
    serverLog: join(neural, 'server.log'),
    hfHome: resolve(expand(env['HF_HOME'] || join(home, 'hf'))),
  };
}

/** examples/neural-server: $TS23D_SERVER_DIR, else this checkout's (not in the npm package). */
export function serverDir(host: Host): string | undefined {
  const own = fileURLToPath(new URL('../../examples/neural-server/', import.meta.url));
  const dir = host.env['TS23D_SERVER_DIR'] ? resolve(expand(host.env['TS23D_SERVER_DIR'])) : own;
  return host.exists(join(dir, 'server.py')) ? dir : undefined;
}

export const serverDirFix =
  'the reference server is not in the npm package: `git clone --depth 1 https://github.com/developerz-ai/ts23d` and `export TS23D_SERVER_DIR=$PWD/ts23d/examples/neural-server`';

/** stdout+stderr of a command that exited 0; undefined when missing or failing. */
export async function probe(
  host: Host,
  exe: string,
  args: readonly string[],
  timeoutMs = 30_000,
): Promise<string | undefined> {
  const p = await host.exec(exe, args, { timeoutMs, maxBytes: 1 << 16 });
  return p.code === 0 && !p.missing ? `${p.stdout}\n${p.stderr}` : undefined;
}

/** The first of `candidates` that runs `args` and prints a match of `re` → [exe, capture]. */
export async function firstTool(
  host: Host,
  candidates: readonly string[],
  args: readonly string[],
  re: RegExp,
): Promise<{ exe: string; version: string } | undefined> {
  for (const exe of candidates) {
    if (exe.includes('/') && !host.exists(exe)) continue;
    const out = await probe(host, exe, args);
    const m = out === undefined ? null : re.exec(out);
    if (m?.[1]) return { exe, version: m[1].trim() };
  }
  return undefined;
}

export interface Gpu {
  readonly name: string;
  readonly vramMb: number;
  readonly driver: string;
  /** Highest CUDA the driver runs ("CUDA Version" in nvidia-smi). */
  readonly cuda?: string;
}

/** `nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader,nounits` → GPUs. */
export function parseGpus(csv: string): Gpu[] {
  const out: Gpu[] = [];
  for (const line of csv.split('\n')) {
    const [name, mem, driver] = line.split(',').map((s) => s.trim());
    const vramMb = Number(mem);
    if (name && driver && Number.isFinite(vramMb) && vramMb > 0) out.push({ name, vramMb, driver });
  }
  return out;
}

/** The biggest NVIDIA GPU, or undefined (no nvidia-smi, no driver, no card). */
export async function biggestGpu(host: Host): Promise<Gpu | undefined> {
  const q = ['--query-gpu=name,memory.total,driver_version', '--format=csv,noheader,nounits'];
  const csv = await probe(host, 'nvidia-smi', q);
  const gpus = csv === undefined ? [] : parseGpus(csv);
  const best = gpus.sort((a, b) => b.vramMb - a.vramMb)[0];
  if (!best) return undefined;
  const cuda = /CUDA (?:UMD )?Version:\s*([\d.]+)/.exec(
    (await probe(host, 'nvidia-smi', [])) ?? '',
  )?.[1];
  return cuda ? { ...best, cuda } : best;
}

export const gb = (mb: number): string => `${(mb / 1024).toFixed(1)} GB`;

/**
 * Why `profile` cannot be set up here, or undefined when it can. A card counts as N GB when it
 * reports at least N × 1000 MiB (a "24 GB" RTX 3090 reports 24 576 MiB, a "8 GB" card ~8 192).
 */
export function refusal(profile: SetupProfile, platform: string, gpu?: Gpu): string | undefined {
  if (platform !== 'linux')
    return `t3d setup runs on Linux (and WSL2) today; ${platform} is planned (21-tier-setup.md: macOS gets 'tools' only)`;
  const need = PROFILES[profile].minGb;
  if (need === 0) return undefined;
  if (!gpu) return `${profile} needs an NVIDIA GPU with ≥ ${need} GB; nvidia-smi found none`;
  if (gpu.vramMb < need * 1000)
    return `${profile} needs ≥ ${need} GB of VRAM; nvidia-smi reports ${gpu.name} with ${gb(gpu.vramMb)}`;
  const major = Number(gpu.driver.split('.')[0]);
  if (major < 550)
    return `${profile} uses CUDA 12.4 wheels, which need driver ≥ 550; this one is ${gpu.driver}`;
  return undefined;
}

/** What to do instead when a GPU profile is refused. */
export function refusalFix(profile: SetupProfile, gpu?: Gpu): string {
  const kubeez =
    'image task without a GPU: kubeezAdapter({ apiKey: process.env.KUBEEZ_API_KEY }) (kubeez.com, partner)';
  if (profile === 'gpu-full' && gpu && gpu.vramMb >= PROFILES['gpu-min'].minGb * 1000)
    return `run \`t3d setup gpu-min\` (≥ 8 GB) instead; ${kubeez}`;
  return `the CPU tier needs no GPU; \`t3d setup tools\` adds Blender/Godot/basisu/gltfpack; ${kubeez}`;
}
