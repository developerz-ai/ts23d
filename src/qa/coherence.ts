// Set coherence: do these assets look like one game? Each member is measured (coherence-metrics)
// and compared two ways. Against the style bible: palette share below MIN_PALETTE_SHARE, wear or
// bevel outside the declared range, texel density off the target by more than TEXEL_TOLERANCE, a
// value key further than its spread. Against the set: a robust z-score (median and MAD, 0.6745 ×
// (x − median) / MAD) above the style's `outlierZ` on any metric, so the odd one out is named even
// when the bible is silent. Every finding is T3D_STYLE_OUTLIER with the metric, value and fix.

import type { CompiledAsset, Style } from '../core/index.ts';
import { hexOf } from './coherence-colour.ts';
import { type StyleMetrics, styleMetrics } from './coherence-metrics.ts';
import type { Finding } from './types.ts';

export { type StyleMetrics, styleMetrics } from './coherence-metrics.ts';

/** An asset belongs to the palette when at least this share of its surface does. */
export const MIN_PALETTE_SHARE = 0.75;
/** Allowed relative distance of an asset's texel density from the style's target. */
export const TEXEL_TOLERANCE = 0.5;
/** Robust z is only meaningful with this many members. */
export const MIN_SET_FOR_Z = 4;

type Metric = 'palette' | 'texelDensity' | 'bevel' | 'wear' | 'valueMean' | 'valueSpread';

/** Per metric: the smallest MAD that counts (so a set of identical values can't make a tiny
 *  difference an outlier), in the metric's own unit. */
const MAD_FLOOR: Readonly<Record<Metric, (median: number) => number>> = {
  palette: () => 0.05,
  texelDensity: (m) => Math.max(0.15 * m, 8),
  bevel: (m) => Math.max(0.25 * m, 0.003),
  wear: () => 0.05,
  valueMean: () => 0.06,
  valueSpread: () => 0.04,
};

const FIX: Readonly<Record<Metric, string>> = {
  palette: 'recolour it from the style palette (roles), or move it to a set whose palette it uses',
  texelDensity:
    'use the set’s strips at their true scale (strip `metres`) instead of stretching one',
  bevel: 'use the set’s bevel size on hard edges (the style `bevel` range)',
  wear: 'weather it like the rest of the set (`weather(ctx, …)` amounts in the style `wear` range)',
  valueMean: 'shift its values toward the set’s key: darker or lighter palette roles',
  valueSpread: 'match the set’s contrast: fewer extremes, or more value separation',
};

const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] ?? 0) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
};

/** Robust z of every value (0.6745 (x − median) / MAD), MAD floored at `floor`. */
export function robustZ(xs: readonly number[], floor = 0): number[] {
  const med = median(xs);
  const mad = Math.max(median(xs.map((x) => Math.abs(x - med))), floor, 1e-12);
  return xs.map((x) => (0.6745 * (x - med)) / mad);
}

const finding = (name: string, message: string, fix: string): Finding => ({
  gate: 'coherence',
  code: 'T3D_STYLE_OUTLIER',
  part: name,
  message: `T3D_STYLE_OUTLIER ${message}`,
  fix,
});

function againstStyle(style: Style, m: StyleMetrics): Finding[] {
  const out: Finding[] = [];
  const at = `'${m.name}' in set '${style.name}':`;
  if (m.palette < MIN_PALETTE_SHARE) {
    const c = m.offColour ? `; most-used off-palette colour ${hexOf(m.offColour.rgb)}` : '';
    out.push(
      finding(
        m.name,
        `${at} palette ${(m.palette * 100).toFixed(0)}% of the surface within ΔE2000 ${style.paletteDeltaE} (needs ${MIN_PALETTE_SHARE * 100}%)${c}`,
        FIX.palette,
      ),
    );
  }
  if (style.texelDensity && Math.abs(m.texelDensity / style.texelDensity - 1) > TEXEL_TOLERANCE)
    out.push(
      finding(
        m.name,
        `${at} texel density ${m.texelDensity.toFixed(0)} px/m vs the style's ${style.texelDensity} (±${TEXEL_TOLERANCE * 100}%)`,
        FIX.texelDensity,
      ),
    );
  if (style.wear && (m.wear < style.wear[0] - 0.02 || m.wear > style.wear[1] + 0.02))
    out.push(
      finding(m.name, `${at} wear ${m.wear.toFixed(2)} outside ${style.wear.join('..')}`, FIX.wear),
    );
  if (style.bevel && m.bevel > 0 && (m.bevel < style.bevel[0] / 2 || m.bevel > style.bevel[1] * 2))
    out.push(
      finding(
        m.name,
        `${at} bevel ${(m.bevel * 1000).toFixed(1)} mm outside ${style.bevel.map((b) => b * 1000).join('..')} mm (×2 slack)`,
        FIX.bevel,
      ),
    );
  if (style.valueKey && Math.abs(m.valueMean - style.valueKey.mean) > style.valueKey.spread)
    out.push(
      finding(
        m.name,
        `${at} value mean ${m.valueMean.toFixed(2)} vs the key ${style.valueKey.mean} ± ${style.valueKey.spread}`,
        FIX.valueMean,
      ),
    );
  return out;
}

/** Findings for a measured set; empty = coherent. */
export function coherenceFindings(style: Style, set: readonly StyleMetrics[]): Finding[] {
  const out = set.flatMap((m) => againstStyle(style, m));
  if (set.length < MIN_SET_FOR_Z) return out;
  for (const metric of Object.keys(MAD_FLOOR) as Metric[]) {
    const xs = set.map((m) => m[metric]);
    const z = robustZ(xs, MAD_FLOOR[metric](median(xs)));
    z.forEach((v, i) => {
      const m = set[i];
      if (!m || Math.abs(v) <= style.outlierZ) return;
      out.push(
        finding(
          m.name,
          `'${m.name}' in set '${style.name}': ${metric} ${xs[i]?.toFixed(3)} vs set median ${median(xs).toFixed(3)} (robust z ${v.toFixed(1)}, limit ${style.outlierZ})`,
          FIX[metric],
        ),
      );
    });
  }
  return out;
}

/** Measure and judge a set of compiled assets (compile them at one LOD, LOD1 is the norm). */
export function coherence(style: Style, assets: readonly CompiledAsset[]): Finding[] {
  return coherenceFindings(
    style,
    assets.map((a) => styleMetrics(a, style)),
  );
}
