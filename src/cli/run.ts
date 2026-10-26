// Command dispatch for `t3d`. Pure function of argv → exit code, so it is testable in-process.

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { compile, type Lod, Ts23dError } from '../core/index.ts';
import { toGlb } from '../export/index.ts';
import { type Finding, runQa } from '../qa/index.ts';
import { contactSheet } from '../render/index.ts';
import { loadAssets } from './load.ts';

interface Args {
  readonly cmd: string;
  readonly files: string[];
  readonly out: string;
  readonly json: boolean;
}

function parse(argv: readonly string[]): Args {
  const files: string[] = [];
  let out = 'out';
  let json = false;
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i] ?? '';
    if (a === '--json') json = true;
    else if (a === '--out') out = argv[++i] ?? out;
    else files.push(a);
  }
  return { cmd: argv[0] ?? 'help', files, out, json };
}

const LODS: readonly Lod[] = [0, 1, 2];
const HELP = 'usage: t3d <build|shot|list> <recipe.ts…> [--out dir] [--json]';

export async function run(argv: readonly string[]): Promise<number> {
  const args = parse(argv);
  const results: { asset: string; file?: string; findings?: Finding[]; triangles?: number[] }[] =
    [];
  try {
    if (!['build', 'shot', 'list'].includes(args.cmd) || args.files.length === 0) {
      console.log(HELP);
      return args.cmd === 'help' ? 0 : 2;
    }
    await mkdir(args.out, { recursive: true });
    for (const file of args.files) {
      for (const asset of await loadAssets(file)) {
        if (args.cmd === 'list') {
          results.push({ asset: asset.name });
          continue;
        }
        if (args.cmd === 'shot') {
          const png = contactSheet(compile(asset, { lod: 0 }), { far: compile(asset, { lod: 2 }) });
          const path = join(args.out, `${asset.name}.png`);
          await Bun.write(path, png);
          results.push({ asset: asset.name, file: path });
          continue;
        }
        const findings: Finding[] = [];
        const triangles: number[] = [];
        for (const lod of LODS) {
          const compiled = compile(asset, { lod });
          findings.push(
            ...runQa(compiled).map((f) => ({ ...f, message: `LOD${lod}: ${f.message}` })),
          );
          triangles.push(
            compiled.parts.reduce((s, p) => s + (p.mesh ? p.mesh.indices.length / 3 : 0), 0),
          );
          await Bun.write(join(args.out, `${asset.name}.lod${lod}.glb`), toGlb(compiled));
        }
        results.push({ asset: asset.name, findings, triangles });
      }
    }
  } catch (e) {
    if (e instanceof Ts23dError) {
      console.error(
        args.json
          ? JSON.stringify({ ok: false, error: e.toJSON() })
          : `${e.message}\n  fix: ${e.fix}`,
      );
      return 1;
    }
    throw e;
  }
  const failed = results.some((r) => (r.findings?.length ?? 0) > 0);
  if (args.json) console.log(JSON.stringify({ ok: !failed, data: results }));
  else {
    for (const r of results) {
      const status = r.findings ? (r.findings.length ? 'QA FAIL' : 'QA PASS') : '';
      console.log(
        [r.asset, status, r.triangles ? `tris ${r.triangles.join('/')}` : '', r.file ?? '']
          .filter(Boolean)
          .join('  '),
      );
      for (const f of r.findings ?? [])
        console.log(
          `  ✗ ${f.gate}${f.part ? ` [${f.part}]` : ''}: ${f.message}\n    fix: ${f.fix}`,
        );
    }
  }
  return failed ? 1 : 0;
}
