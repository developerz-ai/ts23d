// Validate beauty-render options up front: a bad size or angle fails with a code and the exact
// fix instead of a blank or giant image. The CLI's --size/--az/--el/--fov flags land here too.

import { Ts23dError } from '../core/index.ts';

export interface CheckedBeauty {
  readonly width: number;
  readonly height: number;
  readonly azDeg: number;
  readonly elDeg: number;
  readonly fovDeg: number;
  readonly supersample: number;
}

interface Raw {
  readonly width?: number;
  readonly height?: number;
  readonly azDeg?: number;
  readonly elDeg?: number;
  readonly fovDeg?: number;
  readonly supersample?: number;
  readonly window?: { readonly x: number; readonly y: number; readonly zoom: number };
}

function need(ok: boolean, cause: string, fix: string): void {
  if (!ok) throw new Ts23dError('T3D_RENDER_OPTIONS', { cause, fix });
}

export function checkBeautyOptions(o: Raw): CheckedBeauty {
  const v = {
    width: o.width ?? 1600,
    height: o.height ?? 900,
    azDeg: o.azDeg ?? -35,
    elDeg: o.elDeg ?? 18,
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
    Number.isFinite(v.elDeg) && v.elDeg >= -10 && v.elDeg <= 89,
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
  return v;
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
