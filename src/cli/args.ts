// argv → Args for `t3d`. No dependency, no magic: flags are few and documented in HELP.
// Bad render flags (--size/--az/--el/--fov) throw T3D_RENDER_OPTIONS with the fix.

import { Ts23dError } from '../core/index.ts';
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
  readonly sheetSize: 512 | 1024 | 2048;
  /** Which detail levels to build: all three by default, or e.g. only the hero mesh. */
  readonly lods: readonly (0 | 1 | 2)[];
  /** Beauty-render camera and size (hero, review, and build's hero.png); unset = defaults. */
  readonly render: {
    readonly width?: number;
    readonly height?: number;
    readonly azDeg?: number;
    readonly elDeg?: number;
    readonly fovDeg?: number;
  };
}

export const HELP = `usage: t3d <command> <recipe.ts…> [flags]
  build   GLB × 3 LODs + hero + contact sheet + manifest.json per asset; exit 1 on any QA finding
  shot    contact sheet + manifest.json only (fast look)
  hero    beauty render only → <out>/<asset>/hero.png (3/4 product shot, textured, shadowed)
  review  AI review pack → <out>/<asset>/review/: hero, sheet, close-ups, LOD strip, review.md
          (checklist prompt for a vision agent) and review.json (image metrics + warnings)
  list    the assets each module exports
flags:
  --out <dir>     output root (default: out) → <dir>/<asset>/{lod0,lod1,lod2}.glb hero.png sheet.png manifest.json
  --no-animations skip the baked 'run' clip (default: baked, so viewers can play it)
  --no-shot       build without rendering hero.png and the contact sheet
  --size WxH      beauty render size (default 1600x900) · --az <deg> camera azimuth from the
                  front, default -35 (front-left 3/4) · --el <deg> elevation, default 18 · --fov <deg> 30
  --sheet <mode>  external (default): one shared trim_sheet_{albedo,normal,orm}.png in <out>/,
                  referenced by every GLB · embed: self-contained GLBs · none: vertex colour only
  --sheet-size n  512 | 1024 | 2048 (default)
  --lods <list>   which detail levels to build: 0,1,2 (default) · 0 = hero only · 0,2 = near + far
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
    else if (a === '--out') out = argv[++i] ?? out;
    else if (a === '--sheet') {
      const m = argv[++i];
      sheet = m === 'embed' || m === 'none' ? m : 'external';
    } else if (a === '--lods') {
      const picked = (argv[++i] ?? '')
        .split(',')
        .map(Number)
        .filter((n): n is 0 | 1 | 2 => n === 0 || n === 1 || n === 2);
      lods = picked.length ? [...new Set(picked)].sort() : lods;
    } else if (a === '--sheet-size') {
      const n = Number(argv[++i]);
      sheetSize = n === 512 || n === 1024 ? n : 2048;
    } else if (a === '--size') Object.assign(render, parseSize(argv[++i] ?? ''));
    else if (a === '--az') render.azDeg = num(a, argv[++i]);
    else if (a === '--el') render.elDeg = num(a, argv[++i]);
    else if (a === '--fov') render.fovDeg = num(a, argv[++i]);
    else files.push(a);
  }
  checkBeautyOptions(render);
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
    render,
  };
}
