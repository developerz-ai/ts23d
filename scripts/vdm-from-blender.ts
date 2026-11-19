// Extract VDM brushes from a user's Blender asset library into `.vdm.bin` stamps (slice 19's
// format, scripts/vdm-import.ts): Blender (or a Python with bpy) runs examples/blender's
// `vdm_extract` task on the .blend, which writes each vector-displacement brush as a 16-bit PNG
// plus vdm.json with its asset metadata; each PNG becomes a stamp with its licence recorded.
//   bun scripts/vdm-from-blender.ts <library.blend> <out-dir> [--blender exe | --bpy python]
//                                   [--res 33] [--commit] [--allow-nc]
// The asset's licence must be a known SPDX id with an author (checkLicence); `--commit` (outputs
// that go into this repository) also refuses licences that may not be redistributed
// (publishableLicence). Refused brushes are listed with the reason; any refusal exits 1.

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { isTs23dError, Ts23dError } from '../src/core/index.ts';
import { decodePng } from '../src/material/index.ts';
import {
  blenderJobArgs,
  checkLicence,
  defaultScripts,
  type ImportCredit,
  nodeExec,
  publishableLicence,
  runTool,
  sha256Hex,
  type ToolExec,
} from '../src/neural/index.ts';
import { encodeVdmBin, mapToStamp } from './vdm-import.ts';

export interface VdmBrush {
  readonly brush: string;
  readonly png: string;
  readonly amp: number;
  readonly license: string;
  readonly author: string;
  readonly copyright?: string;
}

/** Blender's free-text licence field → an SPDX id where the spelling is unambiguous. */
export function spdxOf(licence: string): string {
  const l = licence.trim();
  if (/^cc[- ]?0( ?1\.0)?$|^public domain$/i.test(l)) return 'CC0-1.0';
  if (/^cc[- ]by[- ]4\.0$/i.test(l)) return 'CC-BY-4.0';
  return l;
}

/** One brush → its credit, or the reason it is refused (`commit`: this repo's outputs). */
export function creditOf(
  b: VdmBrush,
  library: string,
  commit: boolean,
  allowNc: boolean,
): { credit: ImportCredit; line: string } | { refused: string } {
  const credit: ImportCredit = {
    license: spdxOf(b.license),
    author: b.author || b.copyright || '',
    url: `blender-asset:${library}#${b.brush}`,
  };
  try {
    const v = checkLicence(credit, allowNc);
    if (commit && !publishableLicence(credit.license))
      return {
        refused: `licence '${credit.license}' may not be redistributed from this repository`,
      };
    return { credit, line: v.credit };
  } catch (e) {
    return { refused: isTs23dError(e) ? `${e.message} (fix: ${e.fix})` : String(e) };
  }
}

const flag = (argv: readonly string[], name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

export async function main(argv: readonly string[], exec: ToolExec = nodeExec): Promise<number> {
  const [lib, out] = argv;
  if (!lib || !out || lib.startsWith('--') || out.startsWith('--')) {
    console.error(
      'usage: bun scripts/vdm-from-blender.ts <library.blend> <out-dir> [--blender exe | --bpy python] [--res 33] [--commit] [--allow-nc]',
    );
    return 1;
  }
  const bpy = flag(argv, 'bpy');
  const mode = bpy ? 'bpy' : 'blender';
  const exe = bpy ?? flag(argv, 'blender') ?? 'blender';
  const res = Number(flag(argv, 'res') ?? 33);
  const bytes = new Uint8Array(await readFile(lib));
  const work = await mkdtemp(join(tmpdir(), 't3d-vdm-'));
  try {
    const sha = sha256Hex(bytes);
    await writeFile(join(work, 'library.blend'), bytes);
    const job = {
      contract: 't3d-blender/1',
      task: 'vdm_extract',
      request: { library: { sha256: sha, mime: 'application/x-blender' } },
      inputs: { [sha]: 'library.blend' },
    };
    await writeFile(join(work, 'job.json'), JSON.stringify(job));
    const entry = join(await defaultScripts(), 'ts23d_job.py');
    const args = blenderJobArgs(mode, entry, join(work, 'job.json'));
    await runTool({
      tool: 'blender',
      exe,
      args,
      exec,
      cwd: work,
      timeoutMs: 600_000,
      maxBytes: 1 << 20,
    });
    const found = JSON.parse(await readFile(join(work, 'vdm.json'), 'utf8')) as {
      brushes?: VdmBrush[];
    };
    await mkdir(out, { recursive: true });
    let refused = 0;
    for (const b of found.brushes ?? []) {
      const c = creditOf(b, basename(lib), argv.includes('--commit'), argv.includes('--allow-nc'));
      if ('refused' in c) {
        refused++;
        console.error(`refused ${b.brush}: ${c.refused}`);
        continue;
      }
      const png = new Uint8Array(await readFile(join(work, basename(b.png))));
      const img = decodePng(png, (cause) => {
        throw new Ts23dError('T3D_RECIPE_INVALID', {
          cause: `${b.png}: ${cause}`,
          fix: 're-run the extract',
        });
      });
      const stamp = mapToStamp(img, b.amp, res);
      const file = resolve(out, `${basename(b.png, '.png')}.vdm.bin`);
      await writeFile(file, encodeVdmBin(stamp, c.credit, sha256Hex(png), c.line));
      console.log(`${file}  ${stamp.size}² texels  ${c.line}`);
    }
    if (!found.brushes?.length) console.error(`${lib}: no vector-displacement brushes found`);
    return refused || !found.brushes?.length ? 1 : 0;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
