// `t3d concept` argument parsing: `<recipe.ts|brief.md>… [--variants n] [--out dir] [--json]`
// → conceptMain (concept-cmd.ts). Kept apart so concept-cmd.ts stays the command, not the flags.

import { isTs23dError, Ts23dError } from '../core/index.ts';
import { conceptMain } from './concept-cmd.ts';

export interface ConceptArgs {
  readonly files: readonly string[];
  readonly variants?: number;
  readonly out?: string;
}

export function parseConceptArgs(argv: readonly string[]): ConceptArgs {
  const files: string[] = [];
  let variants: number | undefined;
  let out: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? '';
    if (a === '--json') continue;
    if (a === '--variants') {
      const v = Number(argv[++i]);
      if (!Number.isInteger(v) || v < 1 || v > 64)
        throw new Ts23dError('T3D_CLI_USAGE', {
          cause: `--variants needs a whole number from 1 to 64, got "${argv[i] ?? ''}"`,
          fix: 'pass e.g. --variants 6',
        });
      variants = v;
    } else if (a === '--out') {
      const v = argv[++i];
      if (v === undefined || v.startsWith('-'))
        throw new Ts23dError('T3D_CLI_USAGE', {
          cause: '--out needs a directory',
          fix: 'pass e.g. --out concepts',
        });
      out = v;
    } else if (a.startsWith('-'))
      throw new Ts23dError('T3D_CLI_USAGE', {
        cause: `unknown flag ${a} for t3d concept`,
        fix: 't3d concept <recipe.ts|brief.md> [--variants n] [--out dir] [--json]',
      });
    else files.push(a);
  }
  return {
    files,
    ...(variants === undefined ? {} : { variants }),
    ...(out === undefined ? {} : { out }),
  };
}

/** Parses, then runs `t3d concept`; a usage error prints its code and fix and exits 2. */
export async function conceptCli(argv: readonly string[], json: boolean): Promise<number> {
  let args: ConceptArgs;
  try {
    args = parseConceptArgs(argv);
  } catch (e) {
    if (!isTs23dError(e)) throw e;
    if (json)
      console.log(JSON.stringify({ ok: false, error: { code: e.code, message: e.message } }));
    else console.error(e.message);
    return 2;
  }
  return conceptMain(args.files, { json, ...args });
}
