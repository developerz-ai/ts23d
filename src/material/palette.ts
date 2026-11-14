// Colour lives in vertex colour (linear RGB), multiplied over the greyscale trim sheet: a palette
// swap is a recipe edit, never a new texture.

import { Ts23dError, type Vec3 } from '../core/index.ts';

export type Palette = Readonly<Record<string, Vec3>>;

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** True for the colours `hex` accepts: `#rgb` or `#rrggbb`, either case. */
export const isHex = (value: string): boolean => HEX.test(value);

/** sRGB hex (`#rgb` or `#rrggbb`) → linear RGB, the space glTF vertex colours are in. */
export function hex(value: string): Vec3 {
  const m = HEX.exec(value);
  if (!m?.[1])
    throw new Ts23dError('T3D_MATERIAL_INVALID', {
      cause: `'${value}' is not a hex colour`,
      fix: 'use #rrggbb (or #rgb); alpha is not supported on palette colours',
    });
  const digits = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1];
  const n = Number.parseInt(digits, 16);
  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)];
}

/** Vertex colour for material strips that carry their own colour (oak, brass, rubber…). */
export const NATURAL: Vec3 = [1, 1, 1];

export function definePalette(entries: Readonly<Record<string, string>>): Palette {
  return Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, hex(v)]));
}

/** Era/region palettes ship as data; recipes extend them with object spread. */
export const palettes = {
  victorianRail: definePalette({
    paint: '#2f4a3a',
    trim: '#b08d57',
    iron: '#2b2b2e',
    brass: '#c9a24a',
    red: '#7a2a22',
  }),
  artDeco: definePalette({
    limestone: '#d8cfbd',
    steel: '#9aa3ad',
    glass: '#4a6a80',
    bronze: '#8a6a3c',
  }),
  modernGlass: definePalette({
    glass: '#6f8fa8',
    aluminium: '#c4c9cf',
    concrete: '#a7a39b',
  }),
  harbour: definePalette({ hull: '#1f2f45', deck: '#8a6f4e', white: '#e8e6df', red: '#a1302a' }),
} as const;
