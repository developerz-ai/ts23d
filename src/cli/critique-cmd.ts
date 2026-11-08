// `t3d critique`: the scored-review pack a vision agent judges before an asset counts as done.
//   <out>/<asset>/critique/{hero,sheet,raking,raking_detail,lods}.png refs.md rubric.md
//   {silhouette,value,detail}.png (measured art metrics) critique.template.json
// hero.png and sheet.png are byte-identical to what `bun run shots` commits, so the hashes the
// agent copies into critique.json bind its scores to the images that ship.

import { mkdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { type Asset, type CompiledAsset, compile, encodePng, type Lod } from '../core/index.ts';
import type { PaintedSheet } from '../material/index.ts';
import {
  ART_RENDER,
  type ArtMetrics,
  BOUND_RENDERS,
  critiqueTemplate,
  detailHeatmap,
  measureArt,
  type RgbaImage,
  referenceLinks,
  refsMarkdown,
  rubricMarkdown,
  runLodQa,
  runQa,
  silhouetteStrip,
  valueMap,
} from '../qa/index.ts';
import {
  type BeautyOptions,
  cameraFor,
  contactSheet,
  detailWindows,
  lodStrip,
  renderBeauty,
} from '../render/index.ts';
import type { Args } from './args.ts';
import type { RenderResult } from './render-cmds.ts';

export const sha256 = (b: Uint8Array): string =>
  new Bun.CryptoHasher('sha256').update(b).digest('hex');

const tris = (a: CompiledAsset): number =>
  a.parts.reduce((s, p) => s + (p.mesh ? p.mesh.indices.length / 3 : 0), 0);

/**
 * Raking light without a light override: the studio key sits 50° camera-left at 55° elevation, so
 * a camera at −115° (behind-left, low) puts the sun at −165°, 15° off the plane of the −Y side —
 * grazing it at ~81° incidence, the angle that turns rivets, seams and plates into shadow lines.
 */
export const RAKING = { azDeg: -115, elDeg: 8 } as const;

/** Measured art metrics + their pictures (the same numbers `assertArt` reports). */
export function artImages(
  asset: Asset,
  lod0: CompiledAsset,
  lod2: CompiledAsset,
  o: BeautyOptions,
): { metrics: ArtMetrics; images: [string, Uint8Array][] } {
  // The full 3/4 shot at the fixed metrics size: no zoom window, whatever the pack was asked for.
  const { window: _zoom, ...full } = o;
  const bo: BeautyOptions = { ...full, ...ART_RENDER };
  const { metrics, maps } = measureArt({
    lod0,
    lod2,
    beauty: renderBeauty(lod0, bo),
    camera: cameraFor(lod0, bo),
    ...(asset.art ? { art: asset.art } : {}),
  });
  const png = (i: RgbaImage): Uint8Array => encodePng(i.width, i.height, i.rgba);
  return {
    metrics,
    images: [
      ['silhouette.png', png(silhouetteStrip(maps))],
      ['value.png', png(valueMap(maps, metrics.focal.declared))],
      ['detail.png', png(detailHeatmap(maps))],
    ],
  };
}

/** Images of the pack, name → PNG bytes. hero/sheet match the committed out/ byte for byte. */
export function critiqueImages(
  asset: Asset,
  o: BeautyOptions,
): { images: Map<string, Uint8Array>; lods: CompiledAsset[]; metrics: ArtMetrics } {
  const lods = ([0, 1, 2] as Lod[]).map((lod) => compile(asset, { lod }));
  const lod0 = lods[0] ?? compile(asset);
  const lod2 = lods[2] ?? lod0;
  const images = new Map<string, Uint8Array>();
  const hero = renderBeauty(lod0, o);
  images.set('hero.png', encodePng(hero.width, hero.height, hero.rgba));
  images.set('sheet.png', contactSheet(lod0, { far: lod2 }));
  const rake = { ...o, ...RAKING };
  const raking = renderBeauty(lod0, rake);
  images.set('raking.png', encodePng(raking.width, raking.height, raking.rgba));
  const w = detailWindows(raking.detail)[0];
  if (w) {
    const r = renderBeauty(lod0, { ...rake, window: { ...w, zoom: 2.5 } });
    images.set('raking_detail.png', encodePng(r.width, r.height, r.rgba));
  }
  const k = Math.min(1, (o.width ?? 1600) / 800);
  images.set(
    'lods.png',
    lodStrip([lod0, lod2], {
      ...o,
      width: Math.max(16, Math.round(800 * k)),
      height: Math.max(16, Math.round(600 * k)),
    }),
  );
  const art = artImages(asset, lod0, lod2, o);
  for (const [n, b] of art.images) images.set(n, b);
  return { images, lods, metrics: art.metrics };
}

/** sha256 of the committed bound renders in recipes/<name>/out/<asset>/ (absent files omitted). */
export async function committedHashes(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const f of BOUND_RENDERS) {
    const file = Bun.file(join(dir, f));
    if (await file.exists()) out[f] = sha256(new Uint8Array(await file.arrayBuffer()));
  }
  return out;
}

export async function critiqueOne(
  asset: Asset,
  recipe: string,
  args: Args,
  sheet: PaintedSheet,
): Promise<RenderResult> {
  const dir = join(args.out, asset.name, 'critique');
  await mkdir(dir, { recursive: true });
  const { images, lods, metrics } = critiqueImages(asset, { ...args.render, sheet });
  const renders = Object.fromEntries([...images].map(([n, b]) => [n, sha256(b)]));
  const dossier = join(dirname(resolve(recipe)), 'README.md');
  const hasDossier = await Bun.file(dossier).exists();
  const links = hasDossier ? referenceLinks(await Bun.file(dossier).text()) : [];
  const committed = await committedHashes(join(dirname(resolve(recipe)), 'out', asset.name));
  const drift = BOUND_RENDERS.filter((f) => committed[f] !== renders[f]);
  const qa = [
    ...lods.flatMap((a) => runQa(a).map((f) => `LOD${a.lod} ${f.gate}: ${f.message}`)),
    ...runLodQa(lods).map((f) => `${f.gate}: ${f.message}`),
  ];
  const text: [string, string][] = [
    [
      'refs.md',
      refsMarkdown(asset.name, links, hasDossier ? relative(process.cwd(), dossier) : undefined),
    ],
    [
      'rubric.md',
      rubricMarkdown({
        asset: asset.name,
        renders,
        refs: links,
        triangles: lods.map(tris),
        qa,
        drift,
        metrics,
      }),
    ],
    ['critique.template.json', critiqueTemplate(asset.name, renders, metrics)],
  ];
  const files: string[] = [];
  for (const [name, bytes] of [...images, ...text]) {
    const path = join(dir, name);
    await Bun.write(path, bytes);
    files.push(path);
  }
  const warnings = drift.map((f) => ({
    code: 'critique-drift',
    message: `${f} differs from the committed out/${asset.name}/${f}`,
    fix: `bun run shots ${relative('recipes', dirname(resolve(recipe)))} first, then critique what ships`,
  }));
  return { name: asset.name, files, warnings };
}
