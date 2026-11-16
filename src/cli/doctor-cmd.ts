// `t3d doctor [--json]`: what of the optional tier is here, what is missing, and the exact fix for
// each missing piece. CPU tier (Bun) always passes; nothing else is required to build assets, so
// doctor exits 0 whatever it finds. Checks: $TS23D_HOME and free disk · uv · Blender (bpy in the
// setup venv or a `blender` executable), Godot, basisu, gltfpack, Material Maker · GPU tier
// (doctor-gpu.ts) · the reference server (found, answering) · no GPU → kubeez.com for `image`
// (partner, disclosed in docs/idea/08). Read-only: it never installs or writes.

import { statfsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Ts23dError } from '../core/index.ts';
import { gpuChecks } from './doctor-gpu.ts';
import { usage } from './flags.ts';
import { envelope, printError } from './report.ts';
import { serverStatus } from './server-cmd.ts';
import {
  biggestGpu,
  type Check,
  firstTool,
  type Gpu,
  type Host,
  PROFILES,
  realHost,
  refusal,
  type SetupProfile,
  serverDir,
  serverDirFix,
  type TierPaths,
  tierPaths,
} from './tier-probe.ts';

export interface DoctorReport {
  readonly home: string;
  readonly checks: readonly Check[];
  /** Each setup profile: can it be installed here, and if not, why. */
  readonly profiles: Readonly<
    Record<SetupProfile, { readonly fits: boolean; readonly reason?: string }>
  >;
}

const freeGb = (path: string): number | undefined => {
  for (let p = path; ; p = dirname(p)) {
    try {
      const s = statfsSync(p);
      return (s.bavail * s.bsize) / 1e9;
    } catch {
      if (dirname(p) === p) return undefined;
    }
  }
};

const TOOLS_FIX = 't3d setup tools';

async function toolChecks(host: Host, p: TierPaths): Promise<Check[]> {
  const bin = (n: string): string[] => [join(p.toolsBin, n), n];
  const [uv, bpy, blender, godot, basisu, gltfpack] = await Promise.all([
    firstTool(host, [join(p.bin, 'uv'), 'uv'], ['--version'], /uv (\d+\.\d+\.\d+)/),
    firstTool(
      host,
      [p.bpyPython],
      ['-c', 'import bpy; print("bpy", bpy.app.version_string)'],
      /bpy (.+)/,
    ),
    firstTool(host, ['blender'], ['--version'], /Blender (\d+\.\d+(?:\.\d+)?)/),
    firstTool(host, bin('godot'), ['--headless', '--version'], /^(\d+\.\d+(?:\.\d+)?\S*)/m),
    firstTool(host, bin('basisu'), ['-version'], /Basis Universal[^\n]*?v(\d+\.\d+(?:\.\d+)?)/),
    firstTool(host, bin('gltfpack'), ['-v'], /gltfpack (\d+\.\d+(?:\.\d+)?)/),
  ]);
  const tool = (
    id: string,
    found: { exe: string; version: string } | undefined,
    what: string,
    optional = false,
  ): Check =>
    found
      ? { id, group: 'tools', status: 'ok', detail: `${what} ${found.version} (${found.exe})` }
      : {
          id,
          group: 'tools',
          status: optional ? 'info' : 'missing',
          detail: `${what} not found (${p.toolsBin} or PATH)`,
          fix: TOOLS_FIX,
        };
  const blenderCheck: Check =
    bpy || blender
      ? {
          id: 'blender',
          group: 'tools',
          status: 'ok',
          detail: [
            bpy && `bpy ${bpy.version} (${bpy.exe})`,
            blender && `Blender ${blender.version} (${blender.exe})`,
          ]
            .filter(Boolean)
            .join(' · '),
        }
      : {
          id: 'blender',
          group: 'tools',
          status: 'missing',
          detail: 'no bpy venv and no `blender` on PATH',
          fix: TOOLS_FIX,
        };
  const mm = host.exists(join(p.materialMaker, 'material_maker.x86_64'));
  return [
    uv
      ? { id: 'uv', group: 'tools', status: 'ok', detail: `uv ${uv.version} (${uv.exe})` }
      : {
          id: 'uv',
          group: 'tools',
          status: 'missing',
          detail: 'uv not found: setup needs it for every Python env',
          fix: `${TOOLS_FIX} (installs uv into ${p.bin} first)`,
        },
    blenderCheck,
    tool('godot', godot, 'Godot'),
    tool('basisu', basisu, 'basisu'),
    tool('gltfpack', gltfpack, 'gltfpack'),
    mm
      ? {
          id: 'material-maker',
          group: 'tools',
          status: 'ok',
          detail: `Material Maker (${p.materialMaker})`,
        }
      : tool('material-maker', undefined, 'Material Maker (optional)', true),
  ];
}

async function serverChecks(host: Host, p: TierPaths): Promise<Check[]> {
  const dir = serverDir(host);
  const s = await serverStatus(host, p);
  return [
    dir
      ? { id: 'server-code', group: 'server', status: 'ok', detail: `reference server at ${dir}` }
      : {
          id: 'server-code',
          group: 'server',
          status: 'info',
          detail: 'examples/neural-server not found',
          fix: serverDirFix,
        },
    s.running
      ? {
          id: 'server',
          group: 'server',
          status: 'ok',
          detail: `${s.url} answers${s.foreign ? ' (not started by t3d server)' : ` (pid ${s.pid})`}: ${(s.models ?? []).map((m) => m.id).join(', ')}`,
        }
      : {
          id: 'server',
          group: 'server',
          status: 'info',
          detail: `nothing answers on ${s.url}`,
          fix: 't3d server start',
        },
  ];
}

function hostedChecks(host: Host, gpu?: Gpu): Check[] {
  if (gpu && gpu.vramMb >= PROFILES['gpu-full'].minGb * 1000) return [];
  const key = host.env['KUBEEZ_API_KEY'] !== undefined && host.env['KUBEEZ_API_KEY'] !== '';
  const snippet =
    'neural: { image: kubeezAdapter({ apiKey: process.env.KUBEEZ_API_KEY }) } in t3d.config.ts';
  return [
    {
      id: 'kubeez',
      group: 'hosted',
      status: key ? 'ok' : 'info',
      detail: `${gpu ? 'no local image model under 24 GB' : 'no GPU'}: the image task can run on kubeez.com (ts23d partner, disclosed in docs/idea/08); KUBEEZ_API_KEY ${key ? 'is set' : 'not set'}`,
      fix: key
        ? snippet
        : `get a key at https://kubeez.com, export KUBEEZ_API_KEY=…, then ${snippet}`,
    },
  ];
}

export async function doctor(host: Host = realHost()): Promise<DoctorReport> {
  const p = tierPaths(host.env);
  const gpu = await biggestGpu(host);
  const free = freeGb(p.home);
  const disk = free === undefined ? 'free disk unknown' : `${free.toFixed(0)} GB free`;
  const low = free !== undefined && free < PROFILES['gpu-full'].diskGb;
  const cpu: Check[] = [
    {
      id: 'bun',
      group: 'cpu',
      status: 'ok',
      detail: `Bun ${typeof Bun === 'undefined' ? '?' : Bun.version}: build, shot, hero, QA need nothing else`,
    },
    {
      id: 'home',
      group: 'cpu',
      status: low ? 'warn' : 'ok',
      detail: `optional tier home ${p.home} (${host.exists(p.home) ? 'exists' : 'not created yet'}; $TS23D_HOME), ${disk}`,
      ...(low
        ? {
            fix: `gpu-full needs ~${PROFILES['gpu-full'].diskGb} GB: free space or export TS23D_HOME=<a bigger disk>`,
          }
        : {}),
    },
  ];
  const [tools, gpuTier, server] = await Promise.all([
    toolChecks(host, p),
    gpuChecks(host, p, gpu),
    serverChecks(host, p),
  ]);
  const profiles = {} as Record<SetupProfile, { fits: boolean; reason?: string }>;
  for (const name of Object.keys(PROFILES) as SetupProfile[]) {
    const reason = refusal(name, host.platform, gpu);
    profiles[name] = reason ? { fits: false, reason } : { fits: true };
  }
  return {
    home: p.home,
    checks: [...cpu, ...tools, ...gpuTier, ...server, ...hostedChecks(host, gpu)],
    profiles,
  };
}

const TITLES: Readonly<Record<Check['group'], string>> = {
  cpu: 'CPU tier',
  tools: 'Tools (t3d setup tools)',
  gpu: 'GPU tier (t3d setup gpu-min | gpu-full)',
  models: 'Models',
  server: 'Server (t3d server start)',
  hosted: 'Hosted',
};
const MARK: Readonly<Record<Check['status'], string>> = {
  ok: '✔',
  missing: '✘',
  warn: '!',
  info: '·',
};

export function printDoctor(r: DoctorReport): void {
  let group = '';
  for (const c of r.checks) {
    if (c.group !== group) {
      console.log(`${group ? '\n' : ''}${TITLES[c.group]}`);
      group = c.group;
    }
    console.log(
      `  ${MARK[c.status]} ${c.id.padEnd(16)} ${c.detail}${c.fix ? `\n      fix: ${c.fix}` : ''}`,
    );
  }
  console.log('\nProfiles');
  for (const [name, f] of Object.entries(r.profiles))
    console.log(
      `  ${f.fits ? '✔' : '✘'} ${name.padEnd(9)} ${f.reason ?? PROFILES[name as SetupProfile].summary}`,
    );
  const missing = r.checks.filter((c) => c.status === 'missing').length;
  console.log(
    `\n${missing === 0 ? 'nothing missing' : `${missing} missing`} · the CPU tier is ready either way`,
  );
}

export async function doctorMain(
  argv: readonly string[],
  json: boolean,
  host = realHost(),
): Promise<number> {
  try {
    const extra = argv.find((a) => a !== '--json');
    if (extra !== undefined)
      throw usage(`t3d doctor takes no argument '${extra}'`, 't3d doctor [--json]');
    const r = await doctor(host);
    if (json) envelope(true, r);
    else printDoctor(r);
    return 0;
  } catch (e) {
    if (e instanceof Ts23dError) return printError(e, json);
    throw e;
  }
}
