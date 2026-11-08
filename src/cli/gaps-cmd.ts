// `t3d gaps`: the `gaps` QA gate made visible, one folder per asset.
//   <out>/<asset>/gaps/overlay.png  six axis views, undeclared slits red + ringed, declared blue
//   <out>/<asset>/gaps/zoom_<i>.png one undeclared slit up close (worst first, up to 6)
//   <out>/<asset>/gaps/gaps.json    every slit: parts, width, length, depth, xyz, side, allowed
// Read the PNGs: a ring is a slot a viewer sees light (or the inside) through.

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { type Asset, compile } from '../core/index.ts';
import {
  describeGap,
  gapFinding,
  gapOverlay,
  gapZoom,
  scanGaps,
  worstPerPair,
} from '../qa/index.ts';
import type { Args } from './args.ts';
import type { RenderResult } from './render-cmds.ts';

const ZOOMS = 6;

export async function gapsOne(asset: Asset, args: Pick<Args, 'out'>): Promise<RenderResult> {
  const dir = join(args.out, asset.name, 'gaps');
  await mkdir(dir, { recursive: true });
  const scan = scanGaps(compile(asset, { lod: 0 }), { includeAllowed: true, overlayAll: true });
  const files = [join(dir, 'overlay.png')];
  await Bun.write(files[0] ?? '', gapOverlay(scan, 500));
  const open = worstPerPair(scan.gaps.filter((g) => !g.allowed));
  for (const [i, g] of open.slice(0, ZOOMS).entries()) {
    const path = join(dir, `zoom_${i}.png`);
    await Bun.write(path, gapZoom(scan, g, 400, Math.max(0.3, Math.min(2, g.length * 1.5))));
    files.push(path);
  }
  const json = join(dir, 'gaps.json');
  const rows = scan.gaps.map((g) => {
    const { pixels: _p, viewIndex: _v, ...row } = g;
    return { ...row, message: describeGap(g) };
  });
  await Bun.write(json, `${JSON.stringify({ asset: asset.name, gaps: rows }, null, 2)}\n`);
  files.push(json);
  return {
    name: asset.name,
    files,
    warnings: open.map((g) => {
      const f = gapFinding(g);
      return { code: 'gaps', message: f.message, fix: f.fix };
    }),
  };
}
