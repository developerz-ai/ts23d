// argv → Args for `t3d`. No dependency, no magic: flags are few and documented in HELP.

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
}

export const HELP = `usage: t3d <command> <recipe.ts…> [flags]
  build   GLB × 3 LODs + contact sheet + manifest.json per asset; exit 1 on any QA finding
  shot    contact sheet + manifest.json only (fast look)
  list    the assets each module exports
flags:
  --out <dir>     output root (default: out) → <dir>/<asset>/{lod0,lod1,lod2}.glb sheet.png manifest.json
  --no-animations skip the baked 'run' clip (default: baked, so viewers can play it)
  --no-shot       build without rendering the contact sheet
  --sheet <mode>  external (default): one shared trim_sheet_{albedo,normal,orm}.png in <out>/,
                  referenced by every GLB · embed: self-contained GLBs · none: vertex colour only
  --sheet-size n  512 | 1024 (default) | 2048
  --json          machine-readable output`;

export function parseArgs(argv: readonly string[]): Args {
  const files: string[] = [];
  let out = 'out';
  let json = false;
  let animations = true;
  let shot = true;
  let sheet: Args['sheet'] = 'external';
  let sheetSize: Args['sheetSize'] = 1024;
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
    } else if (a === '--sheet-size') {
      const n = Number(argv[++i]);
      sheetSize = n === 512 || n === 2048 ? n : 1024;
    } else files.push(a);
  }
  return { cmd: argv[0] ?? 'help', files, out, json, animations, shot, sheet, sheetSize };
}
