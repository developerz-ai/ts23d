// The manifest's `weather` block: what `weather(ctx, …)` measured at LOD0, per effect.

import type { CompiledAsset, WeatherCoverage } from '../core/index.ts';

export interface WeatherSummary {
  readonly target: number;
  readonly actual: number;
  readonly eligible: string;
  readonly area: number;
  readonly count?: number;
  readonly by?: Readonly<Record<string, { target: number; actual: number; area: number }>>;
}

const r4 = (x: number): number => Math.round(x * 1e4) / 1e4;

/** Coverage effects aggregate area-weighted; shape effects (dents, sag, warp) take the max. */
export function weatherOf(top: CompiledAsset | undefined): {
  weather?: Record<string, WeatherSummary>;
} {
  const all = top?.weather ?? [];
  if (!all.length) return {};
  const byEffect = new Map<string, WeatherCoverage[]>();
  for (const w of all) byEffect.set(w.effect, [...(byEffect.get(w.effect) ?? []), w]);
  const out: Record<string, WeatherSummary> = {};
  for (const [effect, ws] of byEffect) {
    const area = ws.reduce((t, w) => t + w.area, 0);
    const shape = effect === 'dents' || effect === 'sag' || effect === 'warp';
    const mean = (k: 'amount' | 'actual'): number =>
      area > 0 ? ws.reduce((t, w) => t + w[k] * w.area, 0) / area : 0;
    out[effect] = {
      target: r4(shape ? Math.max(...ws.map((w) => w.amount)) : mean('amount')),
      actual: r4(shape ? Math.max(...ws.map((w) => w.actual)) : mean('actual')),
      eligible: [...new Set(ws.map((w) => w.where))].join(' ; '),
      area: r4(area),
      ...(effect === 'dents' ? { count: ws.reduce((t, w) => t + (w.count ?? 0), 0) } : {}),
      ...(ws.length > 1
        ? {
            by: Object.fromEntries(
              ws.map((w) => [
                w.target,
                { target: w.amount, actual: r4(w.actual), area: r4(w.area) },
              ]),
            ),
          }
        : {}),
    };
  }
  return { weather: out };
}
