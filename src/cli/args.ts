// argv → Args for `t3d`. No dependency, no magic: flags are few and documented in HELP.
// Bad render flags (--size/--az/--el/--fov) throw T3D_RENDER_OPTIONS with the fix.

import { Ts23dError } from '../core/index.ts';
import { type ExportProfile, profileSettings } from '../export/index.ts';
import { checkBeautyOptions, parseSize } from '../render/index.ts';

export interface Args {
  readonly cmd: string;
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

export interface FinishArgs {
  readonly model: 'mock' | 'http';
  readonly endpoint?: string;
  readonly prompt?: string;
  readonly negative?: string;
  readonly views?: number;
  readonly atlas?: number;
  /** Write the finished GLB even when finish QA rejects it (provenance records why). */
  readonly force: boolean;
}

export const HELP = `usage: t3d <command> <recipe.ts…> [flags]
  build   GLB × 3 LODs + hero + contact sheet + manifest.json per asset; exit 1 on any QA finding
  shot    contact sheet + manifest.json only (fast look)
  hero    beauty render only → <out>/<asset>/hero.png (3/4 product shot, textured, shadowed)
  review  AI review pack → <out>/<asset>/review/: hero, sheet, close-ups, LOD strip, review.md
  critique  scored-review pack → <out>/<asset>/critique/: hero + sheet (= committed out/), raking light, LOD0|LOD2, refs.md, rubric.md, critique.template.json → commit out/<asset>/critique.json
          (checklist prompt for a vision agent) and review.json (image metrics + warnings)
  blueprint  measured drawing → <out>/<asset>/blueprint.png: side/front/top on a metre grid at one
          scale, L×W×H dimensions, every real.measures entry (green in tolerance, red out), joints
          (green fit, red not) and a 1.8 m figure for scale
  gaps    slit QA made visible → <out>/<asset>/gaps/{overlay.png, zoom_<i>.png, gaps.json}: undeclared slits red, declared blue
  icon    UI art → <out>/<asset>/icon.png (256², unit icon) · portrait.png (512², close-up on art.focal
          or the top) · rts.png (64², 58° strategy camera); one fixed 3/4 high camera and studio
          light for every asset; warns when a 'team' paint slot covers < 8% of the RTS view
  tune    fit the asset's tune.params to its objectives (docs/idea/20-tuning.md) → tune.json,
          tune-report.md, tune-strip.png beside the recipe; --evals N (120) --seed s (1)
          --method cmaes|coordinate; same seed + evals = same tune.json
  finish  AI finish layer → <out>/<asset>/finish/: control maps (depth, normals, part ids, UVs,
          albedo, beauty per view), the model's images, the atlas textures, compare.png (before |
          after), <asset>_finish.glb (LOD0 on its own finish material, LOD1/2 on the trim sheet),
          finish.json (provenance + QA). --model mock|http --endpoint URL --prompt "…"
          --negative "…" --views 8 --atlas 1024 --seed s --force; results cached in .ts23d/finish/
  list    the assets each module exports
flags:
  --out <dir>     output root (default: out) → <dir>/<asset>/{lod0,lod1,lod2}.glb hero.png sheet.png manifest.json
  --no-animations skip the baked 'run' clip (default: baked, so viewers can play it)
  --no-shot       build without rendering hero.png and the contact sheet
  --size WxH      beauty render size (default 1600x900) · --az <deg> camera azimuth from the
                  front, default -35 (front-left 3/4) · --el <deg> elevation, default 18 · --fov <deg> 30
  --sheet <mode>  external (default): one shared trim_sheet_{albedo,normal,orm}.png in <out>/,
                  referenced by every GLB · embed: self-contained GLBs · none: vertex colour only
  --sheet-size n  512 | 1024 | 2048 (default, ~5 s) | 4096 (final exports, ~18 s)
  --lods <list>   which detail levels to build: 0,1,2 (default) · 0 = hero only · 0,2 = near + far
  --lods <mode>   how they are written: both (default) = lod0/1/2.glb + <asset>.glb · split = lodN.glb
                  only · single = <asset>.glb only (LOD0 in the scene, LOD1/2 as MSFT_lod alternates
                  with screen-coverage switch hints; viewers without MSFT_lod show LOD0 only)
  --variant <name> render that livery (an asset's \`variants\`) → hero_<name>.png, sheet_<name>.png;
                  GLBs are unchanged (they carry every variant). Assets without it render as usual
  --profile <p>   engine defaults: unreal | unity | godot (split LODs, 4096 sheet; unreal/godot
                  name colliders UCX_ / -convcolonly with --physics) · rt (no baked AO texture) ·
                  web (one MSFT_lod file, 2048 sheet). Explicit --lods/--sheet-size win
  --physics      rigid body + fitted colliders + mass (KHR_physics_rigid_bodies / KHR_implicit_shapes, Khronos drafts)
  --no-sounds    skip <clip>.wav files and KHR_audio_emitter for assets with sounds (default: written beside the GLB)
  --json          machine-readable output`;

export function parseArgs(argv: readonly string[]): Args {
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
    if (a === '--json') json = true;
    else if (a === '--no-animations') animations = false;
    else if (a === '--animations') animations = true;
    else if (a === '--no-shot') shot = false;
    else if (a === '--physics') physics = true;
    else if (a === '--no-sounds') sounds = false;
    else if (a === '--profile') profile = profileSettings(argv[++i] ?? '').name;
    else if (a === '--out') out = argv[++i] ?? out;
    else if (a === '--evals') tuning.evals = whole(a, argv[++i], 1);
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
    } else if (a === '--sheet') {
      const m = argv[++i];
      sheet = m === 'embed' || m === 'none' ? m : 'external';
    } else if (a === '--lods' && /^(split|single|both)$/.test(argv[i + 1] ?? '')) {
      lodFiles = argv[++i] as Args['lodFiles'];
      lodFilesSet = true;
    } else if (a === '--lods') {
      const picked = (argv[++i] ?? '')
        .split(',')
        .map(Number)
        .filter((n): n is 0 | 1 | 2 => n === 0 || n === 1 || n === 2);
      lods = picked.length ? [...new Set(picked)].sort() : lods;
    } else if (a === '--sheet-size') {
      const n = Number(argv[++i]);
      sheetSize = n === 512 || n === 1024 || n === 4096 ? n : 2048;
      sheetSizeSet = true;
    } else if (a === '--size') Object.assign(render, parseSize(argv[++i] ?? ''));
    else if (a === '--az') render.azDeg = num(a, argv[++i]);
    else if (a === '--el') render.elDeg = num(a, argv[++i]);
    else if (a === '--fov') render.fovDeg = num(a, argv[++i]);
    else if (FINISH_FLAGS.includes(a)) finishFlag(finish, a, argv[++i]);
    else if (a === '--force') finish.force = true;
    else files.push(a);
  }
  checkBeautyOptions(render);
  const p = profile ? profileSettings(profile) : undefined;
  if (p && !lodFilesSet) lodFiles = p.lodFiles;
  if (p && !sheetSizeSet) sheetSize = p.sheetSize;
  return {
    cmd: argv[0] ?? 'help',
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
    ...(argv[0] === 'finish' ? { finish } : {}),
    render,
  };
}

type MutableFinish = { -readonly [K in keyof FinishArgs]: FinishArgs[K] };
const FINISH_FLAGS = ['--model', '--endpoint', '--prompt', '--negative', '--views', '--atlas'];

function finishFlag(f: MutableFinish, flag: string, v: string | undefined): void {
  const bad = (fix: string): never => {
    throw new Ts23dError('T3D_FINISH_INVALID', {
      cause: `${flag} got ${v === undefined ? 'nothing' : `"${v}"`}`,
      fix,
    });
  };
  if (v === undefined) bad(`pass a value after ${flag}`);
  const text = v ?? '';
  if (flag === '--model') {
    if (text !== 'mock' && text !== 'http')
      bad('--model mock (procedural, offline) or http (--endpoint)');
    f.model = text === 'http' ? 'http' : 'mock';
  } else if (flag === '--endpoint') f.endpoint = text;
  else if (flag === '--prompt') f.prompt = text;
  else if (flag === '--negative') f.negative = text;
  else {
    const n = Number(text);
    const [lo, hi] = flag === '--views' ? [1, 24] : [256, 4096];
    if (!Number.isInteger(n) || n < lo || n > hi)
      bad(`${flag} takes a whole number in ${lo}…${hi}`);
    if (flag === '--views') f.views = n;
    else f.atlas = n;
  }
}
