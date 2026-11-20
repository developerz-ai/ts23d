// Validate beauty-render options up front: a bad size or angle fails with a code and the exact
// fix instead of a blank or giant image. The CLI's --size/--az/--el/--fov flags land here too.
// Also where an asset's own `hero` view (core HeroView) slides in under the caller's options.

import { dmath, type HeroView, heroViewFault, Ts23dError, type Vec3 } from '../core/index.ts';

export interface CheckedBeauty {
  readonly width: number;
  readonly height: number;
  readonly azDeg: number;
  readonly elDeg: number;
  readonly fovDeg: number;
  readonly supersample: number;
  /** A fixed viewpoint (both set, or neither): azDeg / elDeg are then its direction. */
  readonly eye?: Vec3;
  readonly target?: Vec3;
}

interface Raw {
  readonly width?: number;
  readonly height?: number;
  readonly azDeg?: number;
  readonly elDeg?: number;
  readonly fovDeg?: number;
  readonly supersample?: number;
  readonly window?: { readonly x: number; readonly y: number; readonly zoom: number };
  readonly eye?: Vec3;
  readonly target?: Vec3;
}

/**
 * `o` over the asset's `hero` view: an option the caller set wins field by field, and an orbit
 * angle replaces a hinted viewpoint (a viewpoint replaces hinted angles). No hint: `o` itself.
 */
export function withHeroView<T extends Raw>(hero: HeroView | undefined, o: T): T {
  if (!hero) return o;
  const fov = o.fovDeg ?? hero.fovDeg;
  const base = { ...o, ...(fov !== undefined ? { fovDeg: fov } : {}) };
  if (o.eye !== undefined || o.target !== undefined) return base;
  if (hero.eye && hero.target && o.azDeg === undefined && o.elDeg === undefined)
    return { ...base, eye: hero.eye, target: hero.target };
  const az = o.azDeg ?? hero.azDeg;
  const el = o.elDeg ?? hero.elDeg;
  return {
    ...base,
    ...(az !== undefined ? { azDeg: az } : {}),
    ...(el !== undefined ? { elDeg: el } : {}),
  };
}

function need(ok: boolean, cause: string, fix: string): void {
  if (!ok) throw new Ts23dError('T3D_RENDER_OPTIONS', { cause, fix });
}

export function checkBeautyOptions(o: Raw): CheckedBeauty {
  const fixed = o.eye !== undefined || o.target !== undefined;
  if (fixed) {
    const bad = heroViewFault({
      ...(o.eye ? { eye: o.eye } : {}),
      ...(o.target ? { target: o.target } : {}),
      ...(o.azDeg !== undefined ? { azDeg: o.azDeg } : {}),
      ...(o.elDeg !== undefined ? { elDeg: o.elDeg } : {}),
    });
    need(bad === null, bad?.[0] ?? '', bad?.[1] ?? '');
  }
  // A fixed viewpoint's direction, as the orbit angles the studio rig is placed by.
  const [dx, dy, dz] = [0, 1, 2].map((k) => (o.eye?.[k] ?? 0) - (o.target?.[k] ?? 0));
  const deg = (rad: number): number => (rad * 180) / Math.PI;
  const v = {
    width: o.width ?? 1600,
    height: o.height ?? 900,
    azDeg: fixed ? deg(dmath.atan2(dy ?? 0, dx ?? 0)) : (o.azDeg ?? -35),
    elDeg: fixed ? deg(dmath.atan2(dz ?? 0, dmath.hypot(dx ?? 0, dy ?? 0))) : (o.elDeg ?? 18),
    fovDeg: o.fovDeg ?? 30,
    supersample: o.supersample ?? 2,
  };
  for (const k of ['width', 'height'] as const)
    need(
      Number.isInteger(v[k]) && v[k] >= 16 && v[k] <= 8192,
      `${k} ${v[k]} is not an integer in 16…8192 pixels`,
      'pass a size like 1600x900 (--size WxH), each side 16–8192',
    );
  need(
    Number.isFinite(v.azDeg),
    `azimuth ${v.azDeg} is not a number`,
    'pass degrees, e.g. --az -35',
  );
  need(
    fixed || (Number.isFinite(v.elDeg) && v.elDeg >= -10 && v.elDeg <= 89),
    `elevation ${v.elDeg} is outside −10…89°`,
    'pass degrees above the horizon, e.g. --el 18 (89 = straight down)',
  );
  need(
    Number.isFinite(v.fovDeg) && v.fovDeg >= 5 && v.fovDeg <= 120,
    `field of view ${v.fovDeg} is outside 5…120°`,
    'pass a vertical FOV in degrees, e.g. --fov 30',
  );
  need(
    Number.isInteger(v.supersample) && v.supersample >= 1 && v.supersample <= 4,
    `supersample ${v.supersample} is not 1, 2, 3 or 4`,
    'use supersample: 2 (4 samples per pixel)',
  );
  if (o.window)
    need(
      Number.isFinite(o.window.zoom) && o.window.zoom >= 1 && o.window.zoom <= 64,
      `window zoom ${o.window.zoom} is outside 1…64`,
      'zoom into the shot with window: { x, y, zoom } and 1 ≤ zoom ≤ 64',
    );
  return o.eye && o.target ? { ...v, eye: o.eye, target: o.target } : v;
}

/** Parse a `WxH` size flag ("1600x900"). */
export function parseSize(text: string): { width: number; height: number } {
  const m = /^(\d+)[x×](\d+)$/i.exec(text.trim());
  need(m !== null, `size "${text}" is not WIDTHxHEIGHT`, 'pass --size 1600x900');
  const width = Number(m?.[1]);
  const height = Number(m?.[2]);
  checkBeautyOptions({ width, height });
  return { width, height };
}
