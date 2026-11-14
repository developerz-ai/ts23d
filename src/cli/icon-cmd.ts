// `t3d icon`: UI art per asset → <out>/<asset>/icon.png (256², whole unit) · portrait.png (512²,
// close-up on `art.focal`, else the top of the asset) · rts.png (64², the high strategy camera).
// An asset with a `team` paint slot and ≥ 2 variants also gets its team colour measured from the
// RTS camera; under MIN_TEAM_SHARE of the silhouette is a warning with a fix.

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { type Asset, compile, type ErrorCode, type Lod } from '../core/index.ts';
import type { PaintedSheet } from '../material/index.ts';
import { icon, portrait, type ReviewWarning, rtsView, teamCoverage } from '../render/index.ts';
import type { Args } from './args.ts';
import { type RenderResult, variantOf } from './render-cmds.ts';

/** Team colour must cover at least this share of the 64-px RTS silhouette. */
export const MIN_TEAM_SHARE = 0.08;

/** `art.focal` as part-name prefixes (globs lose their `*`). */
const focusOf = (asset: Asset): string[] | undefined => {
  const f = asset.art?.focal;
  if (f === undefined) return undefined;
  return (typeof f === 'string' ? [f] : [...f]).map((s) => s.replace(/\*.*$/, ''));
};

/** Two team liveries to diff: red and blue when declared, else the first two (declaration order). */
function teamPair(asset: Asset): [string, string] | undefined {
  const names = Object.keys(asset.variants ?? {}).filter(
    (v) => asset.variants?.[v]?.['team'] !== undefined,
  );
  if (!asset.paint || !('team' in asset.paint) || names.length < 2) return undefined;
  const [a, b] = names.includes('red') && names.includes('blue') ? ['red', 'blue'] : names;
  return a && b ? [a, b] : undefined;
}

export async function iconOne(
  asset: Asset,
  args: Args,
  sheet: PaintedSheet,
): Promise<RenderResult> {
  const dir = join(args.out, asset.name);
  await mkdir(dir, { recursive: true });
  const variant = variantOf(asset, args);
  const lod: Lod = 0;
  const lod0 = compile(asset, { lod, ...(variant ? { variant } : {}) });
  const png = (n: string): string => join(dir, variant ? `${n}_${variant}.png` : `${n}.png`);
  const focus = focusOf(asset);
  const files: [string, Uint8Array][] = [
    [png('icon'), icon(lod0, { sheet })],
    [png('portrait'), portrait(lod0, { sheet, ...(focus ? { focus } : {}) })],
    [png('rts'), rtsView(lod0, { sheet })],
  ];
  for (const [path, bytes] of files) await Bun.write(path, bytes);
  const warnings: ReviewWarning[] = [];
  const pair = teamPair(asset);
  if (pair) {
    const c = teamCoverage(
      compile(asset, { lod: 2, variant: pair[0] }),
      compile(asset, { lod: 2, variant: pair[1] }),
      { sheet },
    );
    if (c.share < MIN_TEAM_SHARE)
      warnings.push({
        code: 'T3D_TEAM_COLOUR_HIDDEN' satisfies ErrorCode,
        message: `team colour covers ${(c.share * 100).toFixed(1)}% of the LOD2 silhouette from the RTS camera (58°, 64 px), under ${MIN_TEAM_SHARE * 100}%`,
        fix: "put paint: 'team' on large top-facing parts (roof, shoulder plates, turret top, banners) and keep them at LOD2",
      });
  }
  return { name: asset.name, files: files.map(([p]) => p), warnings };
}
