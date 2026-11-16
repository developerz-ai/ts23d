// `t3d setup <tools|gpu-min|gpu-full> [--dry-run] [--json]`: installs one optional-tier profile into
// $TS23D_HOME (default ~/.ts23d; uninstall = delete it). No sudo, nothing system-wide. Order: refuse
// what cannot run here (OS, no GPU, too little VRAM, old driver) with the reason and what to do
// instead · uv (PATH, else the pinned installer into $TS23D_HOME/bin) · examples/neural-server/
// install.py with profiles/install-<profile>.toml, whose `@t3d {json}` progress lines are parsed
// here · for GPU profiles, a t3d.config.ts pointing at the local server when the project has none.
// Every step checks real state first, so a re-run is a no-op and an interrupted run resumes.
// --dry-run prints the exact plan and changes nothing. HF_TOKEN stays in the environment.

import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Ts23dError } from '../core/index.ts';
import { CONFIG_FILE } from './config.ts';
import { usage } from './flags.ts';
import { envelope, printError } from './report.ts';
import {
  type LineRunner,
  type Progress,
  parseProgress,
  sayPlan,
  saySteps,
  spawnLines,
} from './setup-progress.ts';
import {
  biggestGpu,
  type Host,
  isSetupProfile,
  PROFILES,
  probe,
  realHost,
  refusal,
  refusalFix,
  SERVER_PORT,
  type SetupProfile,
  serverDir,
  serverDirFix,
  type TierPaths,
  tierPaths,
} from './tier-probe.ts';

export const UV_VERSION = '0.13.8';

export const uvInstallCmd = (p: TierPaths): string[] => [
  'sh',
  '-c',
  `curl -LsSf https://astral.sh/uv/${UV_VERSION}/install.sh | env UV_INSTALL_DIR='${p.bin}' UV_NO_MODIFY_PATH=1 sh`,
];

async function findUv(host: Host, p: TierPaths): Promise<string | undefined> {
  for (const exe of [join(p.bin, 'uv'), 'uv'])
    if ((!exe.includes('/') || host.exists(exe)) && (await probe(host, exe, ['--version'])))
      return exe;
  return undefined;
}

export const configText = (profile: SetupProfile): string => {
  const url = `http://127.0.0.1:${SERVER_PORT}`;
  const tasks =
    profile === 'gpu-full'
      ? `    mesh: http('${url}', 'trellis2', { jobTimeoutMs: 1_800_000 }),\n    score: http('${url}', 'dinov2'),`
      : `    score: http('${url}', 'dinov2'),\n    // image: kubeezAdapter({ apiKey: process.env.KUBEEZ_API_KEY }), // kubeez.com (partner)`;
  return `// Written by \`t3d setup ${profile}\`: the local reference server (\`t3d server start\`).
// Only \`t3d neural run\` talks to it; builds read the committed cache (ADR 014).
import { defineConfig, http${profile === 'gpu-full' ? '' : ', kubeezAdapter'} } from '@developerz.ai/ts23d';

export const config = defineConfig({
  neural: {
${tasks}
  },
});
`;
};

export interface SetupResult {
  readonly profile: SetupProfile;
  readonly home: string;
  readonly dryRun: boolean;
  readonly uv: {
    readonly exe: string;
    readonly installed: boolean;
    readonly cmd?: readonly string[];
  };
  readonly plan?: Extract<Progress, { event: 'plan' }>;
  readonly steps: readonly Extract<Progress, { event: 'step' }>[];
  readonly end?: Extract<Progress, { event: 'end' }>;
  readonly config?: { readonly file: string; readonly written: boolean; readonly text: string };
}

export interface SetupOptions {
  readonly dryRun: boolean;
  readonly cwd: string;
  readonly run?: LineRunner;
  /** Human progress; silent under --json. */
  readonly say?: (line: string) => void;
}

export async function setup(
  profile: SetupProfile,
  o: SetupOptions,
  host: Host = realHost(),
): Promise<SetupResult> {
  const p = tierPaths(host.env);
  const say = o.say ?? (() => {});
  const run = o.run ?? spawnLines;
  const gpu = PROFILES[profile].minGb > 0 ? await biggestGpu(host) : undefined;
  const why = refusal(profile, host.platform, gpu);
  if (why)
    throw new Ts23dError('T3D_NEURAL_FAILED', {
      cause: `t3d setup ${profile} refused: ${why}`,
      fix: refusalFix(profile, gpu),
    });
  const dir = serverDir(host);
  if (!dir)
    throw new Ts23dError('T3D_NEURAL_FAILED', {
      cause: 'examples/neural-server (install.py) not found',
      fix: serverDirFix,
    });
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(host.env)) if (v !== undefined) env[k] = v;
  let uv = await findUv(host, p);
  const uvCmd = uvInstallCmd(p);
  const installed = uv === undefined;
  if (!uv) {
    say(`${o.dryRun ? 'would install' : 'installing'} uv ${UV_VERSION} → ${p.bin}`);
    if (o.dryRun) uv = join(p.bin, 'uv');
    else {
      const code = await run(uvCmd, env, say);
      uv = join(p.bin, 'uv');
      if (code !== 0 || !host.exists(uv))
        throw new Ts23dError('T3D_NEURAL_FAILED', {
          cause: `uv install exited ${code}`,
          fix: `install uv by hand (https://docs.astral.sh/uv/) and rerun; or run: ${uvCmd.join(' ')}`,
        });
    }
  }
  const cmd = [
    uv,
    'run',
    '--no-project',
    '--python',
    '3.12',
    join(dir, 'install.py'),
    '--profile',
    join(dir, 'profiles', `install-${profile}.toml`),
    '--home',
    p.home,
    '--uv',
    uv,
    ...(o.dryRun ? ['--dry-run'] : []),
  ];
  let plan: SetupResult['plan'];
  let end: SetupResult['end'];
  const steps: Extract<Progress, { event: 'step' }>[] = [];
  const code =
    installed && o.dryRun
      ? 0
      : await run(cmd, env, (line) => {
          const ev = parseProgress(line);
          if (ev?.event === 'plan') {
            plan = ev;
            sayPlan(ev, o.dryRun, say);
          } else if (ev?.event === 'step') {
            steps.push(ev);
            saySteps(ev, say);
          } else if (ev?.event === 'end') end = ev;
        });
  if (installed && o.dryRun)
    say(`then: ${cmd.join(' ')}  (the step list comes from install.py once uv is there)`);
  else if (code !== 0 || (!o.dryRun && !end?.ok)) {
    const bad = steps.find((s) => s.status === 'fail');
    throw new Ts23dError('T3D_NEURAL_FAILED', {
      cause: `t3d setup ${profile}: ${bad ? `step ${bad.id} failed: ${bad.detail ?? ''}` : `installer exited ${code}`}`,
      fix: bad?.fix ?? `rerun \`t3d setup ${profile}\` (it resumes); log: ${plan?.log ?? p.home}`,
    });
  }
  const config = profile === 'tools' ? undefined : writeConfig(profile, o, say);
  return {
    profile,
    home: p.home,
    dryRun: o.dryRun,
    uv: { exe: uv, installed, ...(installed ? { cmd: uvCmd } : {}) },
    ...(plan ? { plan } : {}),
    steps,
    ...(end ? { end } : {}),
    ...(config ? { config } : {}),
  };
}

function writeConfig(
  profile: SetupProfile,
  o: SetupOptions,
  say: (l: string) => void,
): SetupResult['config'] {
  const file = join(o.cwd, CONFIG_FILE);
  const text = configText(profile);
  if (existsSync(file)) {
    say(`${CONFIG_FILE} exists, left as is; the local server's adapters:\n${text}`);
    return { file, written: false, text };
  }
  if (o.dryRun) {
    say(`would write ${file} (local server adapters)`);
    return { file, written: false, text };
  }
  writeFileSync(file, text);
  say(`wrote ${file}`);
  return { file, written: true, text };
}

export async function setupMain(
  argv: readonly string[],
  json: boolean,
  host = realHost(),
): Promise<number> {
  try {
    const rest = argv.filter((a) => a !== '--json' && a !== '--dry-run');
    const [profile, extra] = rest;
    if (!isSetupProfile(profile) || extra !== undefined)
      throw usage(
        `t3d setup takes one profile (${Object.keys(PROFILES).join(' | ')}), got '${rest.join(' ')}'`,
        't3d setup tools --dry-run',
      );
    const say = json ? undefined : (l: string): void => console.log(l);
    const r = await setup(
      profile,
      { dryRun: argv.includes('--dry-run'), cwd: process.cwd(), ...(say ? { say } : {}) },
      host,
    );
    if (json) envelope(true, r);
    else if (!r.dryRun)
      say?.(
        `done: ${r.end?.done ?? 0} installed, ${r.end?.skipped ?? 0} already there · check: t3d doctor`,
      );
    return 0;
  } catch (e) {
    if (e instanceof Ts23dError) return printError(e, json);
    throw e;
  }
}
