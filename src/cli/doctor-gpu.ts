// `t3d doctor`'s GPU-tier checks: the NVIDIA driver and card, the model venv (torch, its CUDA, the
// compiled extensions), the local CUDA toolkit matching torch's CUDA, the gcc shim, each model's
// weights in the Hugging Face cache and whether it fits the card, and gated licences (only with
// HF_TOKEN in the environment; the token goes into one request header, never into output).

import { homedir } from 'node:os';
import { join } from 'node:path';
import { type Check, type Gpu, gb, type Host, probe, type TierPaths } from './tier-probe.ts';

interface Model {
  readonly plugin: string;
  readonly repo: string;
  /** Whole-card peak measured on an RTX 3090 (examples/neural-server/README.md). */
  readonly vramGb: number;
  readonly profile: 'gpu-min' | 'gpu-full';
}

const MODELS: readonly Model[] = [
  { plugin: 'pixal3d', repo: 'TencentARC/Pixal3D', vramGb: 18.7, profile: 'gpu-full' },
  { plugin: 'trellis2', repo: 'microsoft/TRELLIS.2-4B', vramGb: 23, profile: 'gpu-full' },
  { plugin: 'dinov2', repo: 'facebook/dinov2-base', vramGb: 1, profile: 'gpu-min' },
  { plugin: 'trellis2-gguf', repo: 'Aero-Ex/Trellis2-GGUF', vramGb: 8, profile: 'gpu-min' },
];

/** Gated on Hugging Face; every one is optional (setup uses an open mirror or replacement). */
const GATED: readonly { readonly repo: string; readonly why: string }[] = [
  { repo: 'briaai/RMBG-2.0', why: 'original background remover (CC BY-NC 4.0; BiRefNet is used)' },
  {
    repo: 'facebook/dinov3-vitl16-pretrain-lvd1689m',
    why: 'original DINOv3 (the camenduru mirror is used)',
  },
  { repo: 'facebook/sam3', why: 'HairDeck (optional) segments hair with SAM 3' },
];

const VENV_PROBE = `import json, sys, importlib.util as u
r = {"python": "%d.%d.%d" % sys.version_info[:3]}
try:
    import torch
    r.update(torch=torch.__version__, torchCuda=torch.version.cuda, cudaOk=torch.cuda.is_available())
except Exception as e:
    r["torchError"] = str(e)[:300]
r["mods"] = {m: u.find_spec(m) is not None for m in ${JSON.stringify(['fastapi', 'uvicorn', 'huggingface_hub', 'flash_attn', 'nvdiffrast', 'cumesh', 'flex_gemm', 'o_voxel', 'natten', 'mediapipe'])}}
print(json.dumps(r))`;

interface VenvReport {
  readonly python?: string;
  readonly torch?: string;
  readonly torchCuda?: string | null;
  readonly cudaOk?: boolean;
  readonly torchError?: string;
  readonly mods?: Readonly<Record<string, boolean>>;
}

/** The setup that fits this card, or what to do when none does. */
const setupFix = (gpu?: Gpu): string =>
  gpu && gpu.vramMb >= 24_000
    ? 't3d setup gpu-full'
    : gpu && gpu.vramMb >= 8000
      ? 't3d setup gpu-min'
      : 'no GPU profile fits this card (< 8 GB): stay on the CPU tier, use kubeez.com for images, or a remote server via http(…)';

export async function gpuChecks(host: Host, p: TierPaths, gpu?: Gpu): Promise<Check[]> {
  const out: Check[] = [];
  const add = (c: Omit<Check, 'group'>): void => {
    out.push({ group: 'gpu', ...c });
  };
  if (!gpu) {
    add({
      id: 'nvidia',
      status: 'info',
      detail:
        'no NVIDIA GPU (nvidia-smi not found or no card): mesh/rig/motion stay on the CPU tier',
      fix: 'nothing to do for the CPU tier; for images use kubeez.com (see hosted), or point http(…) at your own GPU server',
    });
    return out;
  }
  const driverOk = Number(gpu.driver.split('.')[0]) >= 550;
  add({
    id: 'nvidia',
    status: driverOk ? 'ok' : 'missing',
    detail: `${gpu.name}, ${gb(gpu.vramMb)}, driver ${gpu.driver}${gpu.cuda ? ` (CUDA ≤ ${gpu.cuda})` : ''}`,
    ...(driverOk ? {} : { fix: 'update the NVIDIA driver to ≥ 550 (CUDA 12.4 wheels)' }),
  });
  const report = await venvReport(host, p);
  if (!report) {
    add({
      id: 'venv',
      status: gpu.vramMb >= 8000 ? 'missing' : 'info',
      detail: `no model venv at ${p.venv}`,
      fix:
        gpu.vramMb >= 8000
          ? `${setupFix(gpu)} (or export TS23D_NEURAL_VENV=<an existing venv>)`
          : setupFix(gpu),
    });
  } else {
    const mods = report.mods ?? {};
    const lacking = Object.entries(mods)
      .filter(([m, has]) => !has && m !== 'mediapipe')
      .map(([m]) => m);
    const torchOk = report.torch !== undefined && report.cudaOk === true;
    add({
      id: 'venv',
      status: torchOk && lacking.length === 0 ? 'ok' : torchOk ? 'warn' : 'missing',
      detail: `${p.venv}: Python ${report.python ?? '?'}, torch ${report.torch ?? `not importable (${report.torchError ?? '?'})`}${report.torchCuda ? ` (CUDA ${report.torchCuda})` : ''}${report.cudaOk === false ? ', CUDA not available' : ''}${lacking.length ? `; missing: ${lacking.join(', ')}` : ''}`,
      ...(torchOk && lacking.length === 0 ? {} : { fix: `${setupFix(gpu)} (resumes)` }),
    });
    out.push(await toolkitCheck(host, p, report.torchCuda ?? undefined, gpu));
  }
  out.push(...modelChecks(host, p, gpu), ...(await gatedChecks(host)));
  return out;
}

async function venvReport(host: Host, p: TierPaths): Promise<VenvReport | undefined> {
  if (!host.exists(p.python)) return undefined;
  const raw = await probe(host, p.python, ['-c', VENV_PROBE], 120_000);
  const line = raw?.split('\n').find((l) => l.startsWith('{'));
  if (!line) return { torchError: 'the venv python failed to run' };
  return JSON.parse(line) as VenvReport;
}

async function toolkitCheck(
  host: Host,
  p: TierPaths,
  torchCuda: string | undefined,
  gpu: Gpu,
): Promise<Check> {
  const nvcc = join(p.cudaHome, 'bin', 'nvcc');
  const v = host.exists(nvcc)
    ? /release ([\d.]+)/.exec((await probe(host, nvcc, ['--version'])) ?? '')?.[1]
    : undefined;
  const gcc = host.exists(join(p.toolchain, 'gcc'))
    ? (await probe(host, join(p.toolchain, 'gcc'), ['-dumpversion']))?.trim()
    : undefined;
  const match = v !== undefined && torchCuda !== undefined && v === torchCuda;
  const gccOk = gcc !== undefined && Number(gcc.split('.')[0]) <= 13;
  return {
    id: 'cuda-toolkit',
    group: 'gpu',
    status: match && gccOk ? 'ok' : 'warn',
    detail: `${v ? `nvcc ${v} at ${p.cudaHome}` : `no local CUDA toolkit at ${p.cudaHome}`}${torchCuda ? ` (torch built for ${torchCuda})` : ''}; gcc shim ${gcc ?? 'missing'}${match && gccOk ? '' : ': only needed to (re)build CUDA extensions'}`,
    ...(match && gccOk
      ? {}
      : { fix: `${setupFix(gpu)} installs CUDA 12.4.1 + the gcc ≤ 13 shim beside the venv` }),
  };
}

const snapshotIn = (host: Host, hub: string, repo: string): boolean =>
  host.exists(join(hub, `models--${repo.replace('/', '--')}`, 'snapshots'));

function modelChecks(host: Host, p: TierPaths, gpu: Gpu): Check[] {
  const hub = host.env['HF_HUB_CACHE'] || join(p.hfHome, 'hub');
  const userHub = join(homedir(), '.cache', 'huggingface', 'hub');
  const big = gpu.vramMb >= 24_000;
  return MODELS.filter((m) => m.plugin === 'dinov2' || (m.profile === 'gpu-full') === big).map(
    (m) => {
      const fits = gpu.vramMb / 1024 >= m.vramGb;
      const cached = snapshotIn(host, hub, m.repo);
      const elsewhere = !cached && hub !== userHub && snapshotIn(host, userHub, m.repo);
      const vram = `${m.vramGb} GB peak ${fits ? 'fits' : 'does NOT fit'} ${gb(gpu.vramMb)}`;
      return {
        id: `model:${m.plugin}`,
        group: 'models',
        status: cached && fits ? 'ok' : 'warn',
        detail: `${m.repo}: ${cached ? 'weights cached' : elsewhere ? `weights in ${userHub}, not in ${hub}` : `no weights in ${hub}`}; ${vram}`,
        ...(cached && fits
          ? {}
          : {
              fix: !fits
                ? 'use the gpu-min ComfyUI workflow on this card'
                : elsewhere
                  ? `export HF_HOME=${join(homedir(), '.cache', 'huggingface')} (reuse them; setup and the server read HF_HOME)`
                  : `t3d setup ${m.profile}`,
            }),
      };
    },
  );
}

async function gatedChecks(host: Host): Promise<Check[]> {
  const token = host.env['HF_TOKEN'];
  if (!token)
    return [
      {
        id: 'gated',
        group: 'models',
        status: 'info',
        detail: `gated (optional): ${GATED.map((g) => g.repo).join(', ')}; HF_TOKEN not set, access not checked`,
        fix: 'export HF_TOKEN=… in this shell to check (never stored)',
      },
    ];
  return Promise.all(
    GATED.map(async (g): Promise<Check> => {
      const url = `https://huggingface.co/${g.repo}/resolve/main/config.json`;
      const status = await host
        .fetch(url, {
          method: 'HEAD',
          headers: { authorization: `Bearer ${token}` },
          redirect: 'manual',
          signal: AbortSignal.timeout(8000),
        })
        .then((r) => r.status)
        .catch(() => 0);
      const ok = status >= 200 && status < 400;
      return {
        id: `gated:${g.repo}`,
        group: 'models',
        status: ok ? 'ok' : 'info',
        detail: `${g.repo} ${ok ? 'licence accepted' : status === 0 ? 'not reachable' : `not accepted (HTTP ${status})`}: ${g.why}`,
        ...(ok ? {} : { fix: `optional: accept at https://huggingface.co/${g.repo}` }),
      };
    }),
  );
}
