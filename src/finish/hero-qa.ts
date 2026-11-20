// Hero bake QA (ADR 012): the bake fails the build (`T3D_BAKE_FAILED`) when
//   rays miss   — ≥ 1 % of a field-backed part's texels found no surface inside the cage,
//   density drifts — a part's texels per metre is off the atlas's by more than ±20 % (a chart
//                    that fell back to box projection on a slope, or a squashed LSCM chart),
//   size exceeds   — the bake is larger than `budget.heroTextures.size`.
// Every finding names the part, the measured value and the fix.

export interface HeroPartStat {
  readonly name: string;
  /** Texels the part covers in the atlas. */
  readonly texels: number;
  /** Surface area of the part, m². */
  readonly area: number;
  /** Hits ÷ covered texels; null = no field to bake from (vertex colour only). */
  readonly hitRate: number | null;
}

export interface HeroFinding {
  readonly code: 'T3D_BAKE_FAILED';
  readonly part?: string;
  readonly message: string;
  readonly fix: string;
}

export interface HeroQaInput {
  readonly size: number;
  readonly texelsPerMetre: number;
  readonly parts: readonly HeroPartStat[];
  /** Declared `budget.heroTextures.size`, when the asset declares one. */
  readonly cap?: number;
  readonly cage: number;
}

/** Allowed ray-miss share and texel-density drift. */
export const HERO_MISS_MAX = 0.01;
export const HERO_DENSITY_TOL = 0.2;
/** Parts smaller than this many expected texels are too small to measure a density on. */
const MIN_TEXELS = 400;

/** Measured texel density of a part ÷ the atlas's (1 = on target). */
export const densityRatio = (p: HeroPartStat, tpm: number): number =>
  p.area > 0 ? Math.sqrt(p.texels / (p.area * tpm * tpm)) : 1;

export function checkHero(q: HeroQaInput): HeroFinding[] {
  const out: HeroFinding[] = [];
  if (q.cap !== undefined && q.size > q.cap)
    out.push({
      code: 'T3D_BAKE_FAILED',
      message: `hero bake is ${q.size}² but budget.heroTextures.size is ${q.cap}`,
      fix: `bake at ${q.cap} or raise budget.heroTextures.size with a measured reason`,
    });
  for (const p of q.parts) {
    if (p.hitRate !== null && 1 - p.hitRate >= HERO_MISS_MAX)
      out.push({
        code: 'T3D_BAKE_FAILED',
        part: p.name,
        message: `${((1 - p.hitRate) * 100).toFixed(2)}% of rays missed the field within a ${(q.cage * 1000).toFixed(1)} mm cage (max ${HERO_MISS_MAX * 100}%)`,
        fix: 'widen the cage (hero cage), or fix the LOD0 surface where it drifts from the field (a coarser cell than the field supports)',
      });
    if (p.area * (q.texelsPerMetre * q.texelsPerMetre) < MIN_TEXELS) continue;
    const r = densityRatio(p, q.texelsPerMetre);
    if (Math.abs(r - 1) > HERO_DENSITY_TOL)
      out.push({
        code: 'T3D_BAKE_FAILED',
        part: p.name,
        message: `texel density ${(r * 100).toFixed(0)}% of the atlas's ${q.texelsPerMetre.toFixed(0)} texels/m (±${HERO_DENSITY_TOL * 100}%)`,
        fix: 'unwrap that part with LSCM (its charts fell back to box projection or are squashed): split it at its ridges, or lower the chart stretch',
      });
  }
  return out;
}
