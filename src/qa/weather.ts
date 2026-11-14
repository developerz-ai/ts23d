// QA `weather`: runs when a recipe weathered something (`weather(ctx, …)` recorded coverage).
// Holds every effect to its declared % and to physics:
//   T3D_WEATHER_COVERAGE   measured coverage outside amount ± tolerance
//   T3D_WEATHER_NO_SURFACE an effect with amount > 0 found no eligible surface
//   T3D_WEATHER_MISPLACED  dust/bleach under an overhang, moss on a dry underside, mud up high
//   T3D_WEATHER_STREAK_UP  a rust streak segment rises
//   T3D_WEATHER_SHAPE      a dent deeper than declared, a sag/warp past its max, a dent count
//                          outside its range, or any deformation at LOD2

import type { CompiledAsset, WeatherCoverage } from '../core/index.ts';
import type { Finding } from './types.ts';

const SHAPES = new Set(['dents', 'sag', 'warp']);

const f = (w: WeatherCoverage, code: string, message: string, fix: string): Finding => ({
  gate: 'weather',
  code,
  message: `${code}: ${w.target} ${w.effect} (${w.where}) ${message}`,
  fix,
});

const empty = (w: WeatherCoverage): Finding =>
  f(
    w,
    'T3D_WEATHER_NO_SURFACE',
    'found no eligible surface',
    'check the selector against the geometry (fasteners/touched declared? panels big enough? spans ≥ 0.6 m?) or drop the effect',
  );

function shape(w: WeatherCoverage): Finding[] {
  // LOD2 never deforms, so only LOD0/1 must find somewhere to dent or sag.
  if (w.lod < 2 && w.amount > 0 && w.area <= 0) return [empty(w)];
  const out: Finding[] = [];
  if (w.lod === 2 && (w.actual > 0 || (w.count ?? 0) > 0))
    out.push(
      f(
        w,
        'T3D_WEATHER_SHAPE',
        'deforms LOD2',
        'deform only at LOD0/1 — weather() does this; do not hand-deform LOD2',
      ),
    );
  if (w.actual > w.amount * 1.0001 + 1e-6)
    out.push(
      f(
        w,
        'T3D_WEATHER_SHAPE',
        `moves ${(w.actual * 1000).toFixed(1)} mm, declared max ${(w.amount * 1000).toFixed(1)} mm`,
        'lower the deformation or raise the declared depth/max with a reason',
      ),
    );
  const [lo, hi] = w.countRange ?? [0, Infinity];
  if (
    w.effect === 'dents' &&
    w.lod < 2 &&
    w.area > 0 &&
    ((w.count ?? 0) < lo || (w.count ?? 0) > hi)
  )
    out.push(
      f(
        w,
        'T3D_WEATHER_SHAPE',
        `pressed ${w.count} dents, declared ${lo}..${hi}`,
        'widen the panels or the count range',
      ),
    );
  return out;
}

function cover(w: WeatherCoverage): Finding[] {
  const out: Finding[] = [];
  if (w.amount > 0 && w.area <= 0) return [empty(w)];
  if (Math.abs(w.actual - w.amount) > w.tolerance)
    out.push(
      f(
        w,
        'T3D_WEATHER_COVERAGE',
        `covers ${(w.actual * 100).toFixed(1)}%, declared ${(w.amount * 100).toFixed(1)}% ± ${(w.tolerance * 100).toFixed(1)}`,
        'raise the tessellation (resolution) so the eligible area has enough vertices, or widen `where`',
      ),
    );
  if ((w.misplaced ?? 0) > 0.005)
    out.push(
      f(
        w,
        'T3D_WEATHER_MISPLACED',
        `puts ${((w.misplaced ?? 0) * 100).toFixed(1)}% of itself where physics cannot`,
        `restrict \`where\`: dust/bleach '… & up-facing', moss '… & (wet | ground-near)', mud 'ground-near'`,
      ),
    );
  if ((w.upward ?? 0) > 0)
    out.push(
      f(
        w,
        'T3D_WEATHER_STREAK_UP',
        `has ${w.upward} rising streak segments`,
        'streaks follow gravity — report this as a weather() bug',
      ),
    );
  return out;
}

export function weatherGate(asset: CompiledAsset): Finding[] {
  return (asset.weather ?? []).flatMap((w) => (SHAPES.has(w.effect) ? shape(w) : cover(w)));
}
