// The critique calibration's golden set (docs/idea/16-art-as-text.md, "Calibrated score"):
//   bun scripts/golden.ts fetch                 CC0 Poly Haven assets → .ts23d/golden/*.glb
//   bun scripts/golden.ts measure [ph|anchors]  variants + in-house anchors → metric vectors in
//                                               src/qa/critique-golden.json, blind panel sheets
//                                               in .ts23d/golden/panel/
//   bun scripts/golden.ts panel <review.json>…  median of the reviews → panel scores
//   bun scripts/golden.ts brief <recipe.ts>      blind panel pack + brief.md for 3 agent reviewers
//   bun scripts/golden.ts attest <recipe.ts>     3 reviews → critique.json (reviewer 'agent-panel')
//   bun scripts/golden.ts check                 leave-one-asset-out Spearman (≥ 0.7) + monotone
//   bun scripts/golden.ts baseline [name…]      calibrated score per recipe asset, ratcheted into
//                                               recipes/critique-baseline.json (never lowered)
// Meshes and images stay in the gitignored .ts23d/golden/; only vectors and scores are committed.

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { measureCalibrated, vectorImage } from '../src/cli/critique-cmd.ts';
import { loadAssets } from '../src/cli/load.ts';
import { loadTextureCache } from '../src/cli/texture-cache.ts';
import {
  type Asset,
  type CompiledAsset,
  compile,
  defineAsset,
  type Mesh,
} from '../src/core/index.ts';
import { provideTextures } from '../src/material/index.ts';
import { importGlb, onSheet } from '../src/neural/index.ts';
import {
  type GoldenRow,
  type GoldenSet,
  leaveOneGroupOut,
  PANEL_CRITERIA,
} from '../src/qa/critique-calibrate.ts';
import { metricVector, type VectorImage } from '../src/qa/critique-vector.ts';
import { attest, brief } from './golden-brief.ts';
import { degrade, VARIANTS } from './golden-degrade.ts';
import { fetchGolden, GOLDEN_DIR, GOLDEN_IDS, type GoldenSource } from './golden-fetch.ts';
import { panelMedians, panelSheet, type Review, shuffleFor, type Tile } from './golden-panel.ts';
import { BASELINE_FILE, FLAGSHIP_FLOOR, FLAGSHIPS, ratchet, readBaseline } from './lib/critique.ts';
import { recipeFolders } from './lib/files.ts';
import { sha256 } from './textures-snippet.ts';

export const GOLDEN_JSON = 'src/qa/critique-golden.json';
const PANEL_DIR = join(GOLDEN_DIR, 'panel');
/** In-house recipes scored by the same blind panel: anchors for the procedural, vertex-colour look. */
export const ANCHORS = [
  'human_head',
  'elf_head',
  'goblin_head',
  'orc_head',
  'wolf',
  'amur_tiger',
  'dragon',
  't34',
  'loco_440',
  'roadster_v10',
  'oak',
  'rts_tank',
] as const;
/** Spearman the leave-one-asset-out predictions must reach. */
export const MIN_SPEARMAN = 0.7;

interface GoldenFile extends GoldenSet {
  readonly note: string;
  readonly sources: readonly (GoldenSource | { id: string; url: string; license: string })[];
}

const readGolden = async (): Promise<GoldenFile> =>
  (await Bun.file(GOLDEN_JSON).json()) as GoldenFile;
const writeJson = (path: string, v: unknown): Promise<number> =>
  Bun.write(path, `${JSON.stringify(v, null, 2)}\n`);

/** A plain imported mesh as a one-part asset (no LODs: golden assets are judged at LOD0). */
export function meshAsset(name: string, mesh: Mesh, url: string): Asset {
  return defineAsset({
    name,
    kind: 'prop',
    description: `golden-set calibration asset (${url})`,
    tags: ['golden'],
    license: 'CC0-1.0',
    sources: [url],
    budget: { triangles: [4_000_000, 4_000_000, 4_000_000] },
    build(ctx) {
      ctx.part('body', onSheet(mesh, 'plain'));
    },
  });
}

async function fetchAll(): Promise<void> {
  await mkdir(GOLDEN_DIR, { recursive: true });
  const sources: GoldenSource[] = [];
  for (const id of GOLDEN_IDS) {
    const { glb, source } = await fetchGolden(id, fetch);
    await Bun.write(join(GOLDEN_DIR, `${id}.glb`), glb);
    sources.push(source);
    console.log(`  ${id}  ${glb.byteLength} B  ${source.sha256.slice(0, 12)}`);
  }
  await writeJson(join(GOLDEN_DIR, 'sources.json'), sources);
}

/** `scope` 'ph' or 'anchors' re-measures only that half; the other half's rows are kept. */
async function measure(scope: 'all' | 'ph' | 'anchors'): Promise<void> {
  provideTextures(await loadTextureCache());
  await mkdir(PANEL_DIR, { recursive: true });
  const old = await readGolden();
  const before = new Map(old.rows.map((r) => [r.id, r]));
  const sources = (await Bun.file(join(GOLDEN_DIR, 'sources.json')).json()) as GoldenSource[];
  const keyFile = Bun.file(join(PANEL_DIR, 'key.json'));
  const oldKeys = (await keyFile.exists())
    ? ((await keyFile.json()) as Record<string, string[]>)
    : {};
  const doPh = scope !== 'anchors';
  const doAnchors = scope !== 'ph';
  const keep = (g: string): boolean => (g.startsWith('ph:') ? !doPh : !doAnchors);
  const rows: GoldenRow[] = old.rows.filter((r) => keep(r.group));
  const keys: Record<string, string[]> = Object.fromEntries(
    Object.entries(oldKeys).filter(([g]) => keep(g)),
  );
  const add = (group: string, variant: string, lod0: CompiledAsset, img: VectorImage): void => {
    const id = `${group}:${variant}`;
    const image = sha256(img.rgba);
    const prev = before.get(id);
    // Panel scores belong to the image the panel saw: a changed render needs a new panel.
    const panel = prev?.image === image ? prev.panel : undefined;
    rows.push({
      id,
      group,
      variant,
      vector: metricVector(lod0, img),
      image,
      ...(panel ? { panel } : {}),
    });
  };
  for (const s of doPh ? sources : []) {
    const bytes = new Uint8Array(await Bun.file(join(GOLDEN_DIR, `${s.id}.glb`)).arrayBuffer());
    const mesh = importGlb({ path: `${s.id}.glb`, ...s, bytes }).mesh;
    const group = `ph:${s.id}`;
    const order = shuffleFor(group, VARIANTS.length).map((k) => VARIANTS[k] ?? 'original');
    const tiles: Tile[] = [];
    for (const variant of order) {
      const lod0 = compile(meshAsset(`g_${s.id.toLowerCase()}`, degrade(mesh, variant), s.url));
      const img = vectorImage(lod0);
      add(group, variant, lod0, img);
      tiles.push(img);
    }
    keys[group] = order;
    await Bun.write(join(PANEL_DIR, `${group.replace(':', '_')}.png`), panelSheet(tiles));
    console.log(`  ${group}`);
  }
  const { folders } = await recipeFolders();
  for (const name of doAnchors ? ANCHORS : []) {
    const entry = folders.find((f) => f.dir === `recipes/${name}`);
    const asset = entry && (await loadAssets(entry.file)).find((a) => a.name === name);
    if (!asset) throw new Error(`golden: anchor recipe '${name}' not found`);
    const lod0 = compile(asset, { lod: 0 });
    const img = vectorImage(lod0);
    const group = `ts23d:${name}`;
    add(group, 'original', lod0, img);
    keys[group] = ['original'];
    await Bun.write(join(PANEL_DIR, `${group.replace(':', '_')}.png`), panelSheet([img]));
    console.log(`  ${group}`);
  }
  await writeJson(join(PANEL_DIR, 'key.json'), keys);
  await writeJson(GOLDEN_JSON, {
    reviewer: 'agent-panel',
    note: old.note,
    sources: [
      ...sources,
      ...ANCHORS.map((id) => ({ id, url: `recipes/${id}/${id}.ts`, license: 'CC0-1.0' })),
    ],
    rows,
  });
}

async function panel(files: readonly string[]): Promise<void> {
  const reviews = await Promise.all(files.map(async (f) => (await Bun.file(f).json()) as Review));
  const keys = (await Bun.file(join(PANEL_DIR, 'key.json')).json()) as Record<string, string[]>;
  const medians = panelMedians(reviews, keys, ['overall', ...PANEL_CRITERIA]);
  const g = await readGolden();
  const rows = g.rows.map((r) => {
    const p = medians[r.id];
    return p ? { ...r, panel: p } : r;
  });
  await writeJson(GOLDEN_JSON, { ...g, rows });
  console.log(`panel: ${Object.keys(medians).length} rows scored by ${reviews.length} reviews`);
}

/** LOO Spearman and the monotone check; non-zero exit when either fails. */
export function checkGolden(g: GoldenSet): { spearman: number; inversions: string[] } {
  const loo = leaveOneGroupOut(g);
  const byId = new Map(loo.rows.map((r) => [r.id, r.predicted]));
  const inversions: string[] = [];
  for (const r of g.rows) {
    if (r.variant === 'original' || !r.panel) continue;
    const orig = byId.get(`${r.group}:original`);
    const deg = byId.get(r.id);
    if (orig !== undefined && deg !== undefined && deg >= orig)
      inversions.push(`${r.id} ${deg.toFixed(2)} ≥ original ${orig.toFixed(2)}`);
  }
  return { spearman: loo.spearman, inversions };
}

async function check(): Promise<number> {
  const g = await readGolden();
  const { spearman, inversions } = checkGolden(g);
  const rows = g.rows.filter((r) => r.panel).length;
  console.log(`golden: ${rows} scored rows, leave-one-asset-out Spearman ${spearman.toFixed(3)}`);
  for (const i of inversions) console.log(`  not monotone: ${i}`);
  return spearman >= MIN_SPEARMAN && inversions.length === 0 ? 0 : 1;
}

/** A recipe that fails to load or build is reported and left at its recorded score (exit 1). */
async function baseline(names: readonly string[]): Promise<number> {
  provideTextures(await loadTextureCache());
  const today: Record<string, number> = {};
  const failed: string[] = [];
  for (const { dir, file } of (await recipeFolders()).folders) {
    if (names.length && !names.includes(dir.slice('recipes/'.length))) continue;
    try {
      for (const asset of await loadAssets(file)) {
        today[asset.name] = (
          await measureCalibrated(compile(asset, { lod: 0 }), dir)
        ).score.overall;
        console.log(`  ${asset.name.padEnd(24)} ${today[asset.name]}`);
      }
    } catch (e) {
      failed.push(file);
      console.error(`! ${file}: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
    }
  }
  await writeJson(BASELINE_FILE, {
    note: 'Calibrated critique scores (src/qa/critique-calibrate.ts). Ratchet: `bun scripts/golden.ts baseline` only raises them; the recipes gate fails a drop > 0.5 without a README "Critique why:" line.',
    flagships: FLAGSHIPS,
    floor: FLAGSHIP_FLOOR,
    scores: ratchet(await readBaseline(), today),
  });
  return failed.length ? 1 : 0;
}

export async function main(argv: readonly string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  if (cmd === 'fetch') await fetchAll();
  else if (
    cmd === 'measure' &&
    (rest[0] === undefined || rest[0] === 'ph' || rest[0] === 'anchors')
  )
    await measure(rest[0] ?? 'all');
  else if (cmd === 'panel' && rest.length) await panel(rest);
  else if (cmd === 'check') return check();
  else if (cmd === 'baseline') return baseline(rest);
  else if (cmd === 'brief' && rest[0]) return brief(rest[0]);
  else if (cmd === 'attest' && rest[0]) return attest(rest[0]);
  else {
    console.error(
      'usage: bun scripts/golden.ts fetch|measure [ph|anchors]|panel <review.json>…|brief <recipe>|attest <recipe>|check|baseline [name…]',
    );
    return 2;
  }
  return 0;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
