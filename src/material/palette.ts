// Colour lives in vertex colour (linear RGB), multiplied over the greyscale trim sheet: a palette
// swap is a recipe edit, never a new texture.

import type { Vec3 } from '../core/index.ts';

export type Palette = Readonly<Record<string, Vec3>>;

/** sRGB hex → linear RGB, the space glTF vertex colours are in. */
export function hex(value: string): Vec3 {
  const n = Number.parseInt(value.replace('#', ''), 16);
  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)];
}

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
