// Real-data fetchers: the only place ts23d touches the network for data. Each command writes a
// small pinned file (URL, sha256, licence) that a recipe commits and imports; compile never fetches.
//   bun run data wikidata <QID…> --out recipes/<name>/data     facts (CC0) → wikidata-<QID>.json
//   bun run data dem --centre <lat,lon> --size <m> [--cells 256] [--zoom 13] --name <id> --out <file>
//   bun run data verify <wikidata-*.json…>                    re-hash cached raw responses

import { demCommand } from './data-dem.ts';
import { type Fetch, verifyWikidata, wikidataCommand } from './data-wikidata.ts';

export async function run(argv: readonly string[], get: Fetch = fetch): Promise<string[]> {
  const [cmd, ...rest] = argv;
  if (cmd === 'wikidata') {
    const i = rest.indexOf('--out');
    const out = i >= 0 ? (rest[i + 1] ?? '.') : '.';
    const qids = rest.filter((a, k) => !a.startsWith('--') && rest[k - 1] !== '--out');
    return wikidataCommand(qids, out, get);
  }
  if (cmd === 'dem') return demCommand(rest, get);
  if (cmd === 'verify') {
    const lines: string[] = [];
    for (const f of rest) {
      const ok = await verifyWikidata(await Bun.file(f).json());
      lines.push(
        `${ok ? '✓' : '·'} ${f}${ok ? '' : ' (raw response not cached: nothing to re-hash)'}`,
      );
    }
    return lines;
  }
  return [
    'usage: bun run data wikidata <QID…> --out <dir> | dem --centre <lat,lon> --size <m> --name <id> --out <file> | verify <file…>',
  ];
}

if (import.meta.main) {
  try {
    for (const line of await run(process.argv.slice(2))) console.log(line);
  } catch (e) {
    const fix = (e as { fix?: string }).fix;
    console.error(`${(e as Error).message}${fix ? `\nfix: ${fix}` : ''}`);
    process.exitCode = 1;
  }
}
