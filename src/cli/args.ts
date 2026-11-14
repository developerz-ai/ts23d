// argv → Args for `t3d`. No dependency, no magic: flags are few and documented in help.ts.
// Strict: an unknown command or flag, a `--sheet` / `--sheet-size` / `--lods` value outside its
// set, a missing `--out` value or no files is T3D_CLI_USAGE (exit 2). Flags owned by a module
// keep that module's code (exit 1): render flags (--size/--az/--el/--fov) T3D_RENDER_OPTIONS,
// `--variant` / `--profile` T3D_RECIPE_INVALID, tune and finish flags their own codes.
// `--help` / `-h` / `help [cmd]` → cmd 'help' (topic = the command); `--version` → 'version'.

import { Ts23dError } from '../core/index.ts';
import { type ExportProfile, profileSettings } from '../export/index.ts';
import { checkBeautyOptions, parseSize } from '../render/index.ts';
import {
  FINISH_FLAGS,
  type FinishArgs,
  finishFlag,
  lodList,
  type MutableFinish,
  oneOf,
  SWITCHES,
  usage,
  VALUED,
} from './flags.ts';
import { COMMANDS, closest } from './help.ts';

export type { FinishArgs } from './flags.ts';

export interface Args {
  /** A command from COMMANDS, or 'help' / 'version'. */
  readonly cmd: string;
  /** `help`: the command whose help to print; unset = all of it. */
  readonly topic?: string;
  readonly files: string[];
  readonly out: string;
  readonly json: boolean;
  readonly animations: boolean;
  /** `build` also renders the contact sheet unless --no-shot. */
  readonly shot: boolean;
  /** Trim-sheet textures: shared files in <out>/ (default), embedded per GLB, or none. */
  readonly sheet: 'external' | 'embed' | 'none';
  readonly sheetSize: 512 | 1024 | 2048 | 4096;
  /** Which detail levels to build: all three by default, or e.g. only the hero mesh. */
  readonly lods: readonly (0 | 1 | 2)[];
  /**
   * How LODs land on disk: `split` lodN.glb per level · `single` one <asset>.glb with MSFT_lod
   * alternates · `both` (default): split files import everywhere, the single file is for
   * MSFT_lod-aware loaders and one-file pipelines.
   */
  readonly lodFiles: 'split' | 'single' | 'both';
  /** Write a rigid body, fitted colliders and mass (KHR_physics_rigid_bodies, Khronos drafts). */
  readonly physics: boolean;
  /** Write `<clip>.wav` + KHR_audio_emitter for assets with sounds (default on; --no-sounds). */
  readonly sounds: boolean;
  /**
   * Engine profile (unreal|unity|godot|rt|web): sets the defaults of --lods mode, --sheet-size,
   * AO binding and collider naming (export/profile.ts). Explicit flags still win.
   */
  readonly profile?: ExportProfile;
  /** Render this paint variant (KHR_materials_variants livery) instead of the default paint. */
  readonly variant?: string;
  /** `tune`: evaluation budget, optimiser seed, method (cmaes | coordinate). */
  readonly evals?: number;
  readonly seed?: number;
  readonly method?: 'cmaes' | 'coordinate';
  /** `finish`: the AI finish layer's model and request (docs/idea/22-ai-finish.md). */
  readonly finish?: FinishArgs;
  /** Beauty-render camera and size (hero, review, and build's hero.png); unset = defaults. */
  readonly render: {
    readonly width?: number;
    readonly height?: number;
    readonly azDeg?: number;
    readonly elDeg?: number;
    readonly fovDeg?: number;
  };
}

/** `help`, `--help`, `-h`, no argv → help; `--version` → version; else null. */
function meta(argv: readonly string[]): { cmd: string; topic?: string } | null {
  if (argv.includes('--version')) return { cmd: 'version' };
  const first = argv[0];
  const topic = first === 'help' ? argv[1] : first;
  const wantsHelp =
    first === undefined || first === 'help' || argv.some((a) => a === '--help' || a === '-h');
  if (!wantsHelp) return null;
  return topic !== undefined && COMMANDS.includes(topic) ? { cmd: 'help', topic } : { cmd: 'help' };
}

/** Help/version Args: defaults everywhere else. */
const metaArgs = (m: { cmd: string; topic?: string }, json: boolean): Args => ({
  ...m,
  files: [],
  out: 'out',
  json,
  animations: true,
  shot: true,
  sheet: 'external',
  sheetSize: 2048,
  lods: [0, 1, 2],
  lodFiles: 'both',
  physics: false,
  sounds: true,
  render: {},
});

export function parseArgs(argv: readonly string[]): Args {
  const m = meta(argv);
  if (m) return metaArgs(m, argv.includes('--json'));
  const cmd = argv[0] ?? '';
  if (!COMMANDS.includes(cmd))
    throw usage(
      `unknown command "${cmd}"`,
      `did you mean \`t3d ${closest(cmd, COMMANDS)}\`? (t3d --help lists: ${COMMANDS.join(', ')})`,
    );
  const files: string[] = [];
  let out = 'out';
  let json = false;
  let animations = true;
  let shot = true;
  let sheet: Args['sheet'] = 'external';
  let sheetSize: Args['sheetSize'] = 2048;
  let lods: Args['lods'] = [0, 1, 2];
  let lodFiles: Args['lodFiles'] = 'both';
  let variant: string | undefined;
  const tuning: { evals?: number; seed?: number; method?: 'cmaes' | 'coordinate' } = {};
  const whole = (flag: string, v: string | undefined, min: number): number => {
    const n = Number(v);
    if (v === undefined || !Number.isInteger(n) || n < min)
      throw new Ts23dError('T3D_TUNE_INVALID', {
        cause: `${flag} needs a whole number ≥ ${min}, got ${v === undefined ? 'nothing' : `"${v}"`}`,
        fix: `pass e.g. ${flag} ${flag === '--evals' ? 120 : 1}`,
      });
    return n;
  };
  let physics = false;
  let sounds = true;
  let profile: ExportProfile | undefined;
  let lodFilesSet = false;
  let sheetSizeSet = false;
  const finish: MutableFinish = { model: 'mock', force: false };
  const render: {
    width?: number;
    height?: number;
    azDeg?: number;
    elDeg?: number;
    fovDeg?: number;
  } = {};
  const num = (flag: string, v: string | undefined): number => {
    const n = Number(v);
    if (v === undefined || v.trim() === '' || !Number.isFinite(n))
      throw new Ts23dError('T3D_RENDER_OPTIONS', {
        cause: `${flag} needs a number of degrees, got ${v === undefined ? 'nothing' : `"${v}"`}`,
        fix: `pass e.g. ${flag} ${flag === '--fov' ? 30 : flag === '--el' ? 18 : -35}`,
      });
    return n;
  };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i] ?? '';
    if (a.startsWith('-') && !SWITCHES.includes(a) && !VALUED.includes(a))
      throw usage(
        `unknown flag ${a}`,
        `did you mean ${closest(a, [...SWITCHES, ...VALUED])}? (t3d ${cmd} --help lists the flags)`,
      );
    if (a === '--json') json = true;
    else if (a === '--no-animations') animations = false;
    else if (a === '--animations') animations = true;
    else if (a === '--no-shot') shot = false;
    else if (a === '--physics') physics = true;
    else if (a === '--no-sounds') sounds = false;
    else if (a === '--profile') profile = profileSettings(argv[++i] ?? '').name;
    else if (a === '--out') {
      const v = argv[++i];
      if (v === undefined || v.startsWith('-'))
        throw usage(
          `--out needs a directory, got ${v === undefined ? 'nothing' : `"${v}"`}`,
          'pass --out <dir>, e.g. --out out',
        );
      out = v;
    } else if (a === '--evals') tuning.evals = whole(a, argv[++i], 1);
    else if (a === '--seed') tuning.seed = whole(a, argv[++i], 0);
    else if (a === '--method') {
      const m = argv[++i];
      if (m !== 'cmaes' && m !== 'coordinate')
        throw new Ts23dError('T3D_TUNE_INVALID', {
          cause: `--method needs cmaes or coordinate, got ${m === undefined ? 'nothing' : `"${m}"`}`,
          fix: 'pass --method cmaes (default) or --method coordinate',
        });
      tuning.method = m;
    } else if (a === '--variant') {
      const v = argv[++i];
      if (v === undefined || !/^[a-z][a-z0-9_]*$/.test(v))
        throw new Ts23dError('T3D_RECIPE_INVALID', {
          cause: `--variant needs a variant name, got ${v === undefined ? 'nothing' : `"${v}"`}`,
          fix: "pass one of the asset's `variants` keys, e.g. --variant oxide_red",
        });
      variant = v;
    } else if (a === '--sheet') sheet = oneOf(a, argv[++i], ['external', 'embed', 'none'] as const);
    else if (a === '--lods' && /^(split|single|both)$/.test(argv[i + 1] ?? '')) {
      lodFiles = argv[++i] as Args['lodFiles'];
      lodFilesSet = true;
    } else if (a === '--lods') lods = lodList(argv[++i]);
    else if (a === '--sheet-size') {
      sheetSize = Number(
        oneOf(a, argv[++i], ['512', '1024', '2048', '4096'] as const),
      ) as Args['sheetSize'];
      sheetSizeSet = true;
    } else if (a === '--size') Object.assign(render, parseSize(argv[++i] ?? ''));
    else if (a === '--az') render.azDeg = num(a, argv[++i]);
    else if (a === '--el') render.elDeg = num(a, argv[++i]);
    else if (a === '--fov') render.fovDeg = num(a, argv[++i]);
    else if (FINISH_FLAGS.includes(a)) finishFlag(finish, a, argv[++i]);
    else if (a === '--force') finish.force = true;
    else files.push(a);
  }
  if (files.length === 0)
    throw usage(
      `t3d ${cmd} needs at least one recipe file`,
      `pass one: t3d ${cmd} recipes/t34/t34.ts`,
    );
  checkBeautyOptions(render);
  const p = profile ? profileSettings(profile) : undefined;
  if (p && !lodFilesSet) lodFiles = p.lodFiles;
  if (p && !sheetSizeSet) sheetSize = p.sheetSize;
  return {
    cmd,
    files,
    out,
    json,
    animations,
    shot,
    sheet,
    sheetSize,
    lods,
    lodFiles,
    physics,
    sounds,
    ...(profile ? { profile } : {}),
    ...(variant ? { variant } : {}),
    ...tuning,
    ...(cmd === 'finish' ? { finish } : {}),
    render,
  };
}
