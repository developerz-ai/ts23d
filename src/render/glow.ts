// Which parts emit light in the beauty renders, from the asset's `glow` rules: the same parts and
// the same radiance (colour × strength, linear) the GLB's emissive materials carry, so the hero
// shows the lamp lit as an engine will. One row per rule; a part takes the first rule it matches.

import type { CompiledAsset } from '../core/index.ts';

/** Defaults of a `glow` rule, as the GLB writer applies them (export/materials.ts). */
const WARM_WHITE = [1, 0.85, 0.6] as const;
const STRENGTH = 4;

/** `*` / `?` glob → anchored RegExp (render cannot import /export: same tier). */
const globRe = (pattern: string): RegExp =>
  new RegExp(
    `^${pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replaceAll('*', '.*')
      .replaceAll('?', '.')}$`,
  );

export interface GlowTable {
  /** Emitted radiance per rule, linear RGB, 3 floats each (same scale as albedo × light). */
  readonly radiance: Float32Array;
  /** Part name → rule index + 1 (absent: the part does not glow). */
  readonly byPart: ReadonlyMap<string, number>;
}

export function glowTable(asset: CompiledAsset): GlowTable {
  const rules = asset.glow ?? [];
  const radiance = new Float32Array(rules.length * 3);
  rules.forEach((r, i) => {
    const k = r.strength ?? STRENGTH;
    (r.color ?? WARM_WHITE).forEach((c, ch) => {
      radiance[i * 3 + ch] = c * k;
    });
  });
  const res = rules.map((r) => r.parts.map(globRe));
  const byPart = new Map<string, number>();
  for (const p of asset.parts) {
    const i = res.findIndex((rs) => rs.some((re) => re.test(p.name)));
    if (i >= 0) byPart.set(p.name, i + 1);
  }
  return { radiance, byPart };
}
