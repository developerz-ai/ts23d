// Size, distance and joint-fit assertions for a recipe's own tests: "the knight is 1.7–1.9 m
// tall", "the sword is in the hand", "every joint fits". Each compiles the asset, measures with
// the QA ruler and throws T3D_QA_FAILED with the numbers and a fix — or returns the measurement.

import { type Asset, jointFit, type Lod } from '../core/index.ts';
import { type Finding, ruler, type Size } from '../qa/index.ts';
import { compileLods, failOn, type LodOptions } from './compiled.ts';

export type Range = readonly [min: number, max: number];

const fmt = (r: Range): string => `[${r[0]}, ${r[1]}] m`;
const out = (v: number, r: Range): boolean => v < r[0] || v > r[1];
const top = (asset: Asset, lod: Lod = 0) => {
  const [a] = compileLods(asset, { lods: [lod] });
  if (!a) throw new RangeError('compileLods returned nothing');
  return a;
};

/** Overall L × W × H (X, Y, Z) within the given ranges, at LOD0. Returns the size. */
export function assertSize(
  asset: Asset,
  want: { readonly length?: Range; readonly width?: Range; readonly height?: Range },
  o: { lod?: Lod } = {},
): Size {
  const size = ruler(top(asset, o.lod)).size() ?? { length: 0, width: 0, height: 0 };
  const found = (['length', 'width', 'height'] as const).flatMap((k) => {
    const r = want[k];
    if (!r || !out(size[k], r)) return [];
    const finding: Finding = {
      gate: 'size',
      message: `${k} ${size[k].toFixed(3)} m, want ${fmt(r)}`,
      fix: `rescale along ${k === 'length' ? 'X' : k === 'width' ? 'Y' : 'Z'} from the source numbers`,
    };
    return [{ finding }];
  });
  failOn(`${asset.name} size`, found);
  return size;
}

/** Distance between two parts in range: centre to centre (default) or surface to surface. */
export function assertBetween(
  asset: Asset,
  a: string,
  b: string,
  range: Range,
  o: { lod?: Lod; mode?: 'centre' | 'closest' } = {},
): number {
  const mode = o.mode ?? 'centre';
  const d = ruler(top(asset, o.lod)).between(a, b, mode);
  const bad = d === null || out(d, range);
  failOn(
    `${asset.name} between`,
    bad
      ? [
          {
            finding: {
              gate: 'between',
              message:
                d === null
                  ? `no part matches '${a}' or '${b}'`
                  : `${a} ↔ ${b} (${mode}) ${d.toFixed(3)} m, want ${fmt(range)}`,
              fix:
                d === null
                  ? 'name the parts (exact, prefix or glob) — t3d build lists them'
                  : `move ${b} ${(d < range[0] ? range[0] - d : d - range[1]).toFixed(3)} m ${d < range[0] ? 'away from' : 'towards'} ${a}`,
            },
          },
        ]
      : [],
  );
  return d ?? Number.NaN;
}

/** Every `ctx.joint` fits (QA `joints`) at every LOD checked. */
export function assertJointsFit(asset: Asset, o: LodOptions = {}): void {
  failOn(
    `${asset.name} joints`,
    compileLods(asset, o).flatMap((a) =>
      (a.joints ?? []).flatMap((j) =>
        jointFit(a, j).findings.map((finding) => ({ finding, lod: a.lod })),
      ),
    ),
  );
}
