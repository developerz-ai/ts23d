// The station's own strips. Brick: the house bond with a wider per-brick spread and a tone per
// course (each kiln batch laid in runs, as on the Toddington walls), so the wall is not one red.
// Canopy: roll-top felt over boarding, a raised batten every 0.45 m down the slope, lighter on
// its crown. Name board: the far LOD's running-in board as one quad, "TODDINGTON" painted white
// on black in a 5 × 7 block face, so the board keeps its lettering for two triangles.

import { defineMaterial, type MaterialPainter } from '@developerz.ai/ts23d';

/** Brick course height, metres (the house bond's). */
const COURSE = 0.075;

const courseTone: MaterialPainter = (s, kit) => {
  kit.each((i, _xm, ym) => {
    const k = Math.floor(ym / COURSE);
    // A tone per course, and now and then a darker over-burnt run of three courses.
    const t = 1 + 0.3 * (kit.hash(k, 3) - 0.5) - (kit.hash(Math.floor(k / 3), 11) < 0.2 ? 0.16 : 0);
    s.tone[i] = (s.tone[i] ?? 1) * t;
  });
};

export const BRICK = defineMaterial({
  id: 'station_brick',
  kind: 'bond',
  scaleMetres: 0.45,
  roughness: 0.85,
  params: { grime: 0.2, variation: 0.8 },
  paint: courseTone,
  description: 'GWR red facing brick: per-brick spread and a tone per course (kiln batches).',
});

/** Batten pitch down the canopy slope, metres. */
const BATTEN = 0.45;

const rollTop: MaterialPainter = (s, kit) => {
  kit.each((i, xm, ym) => {
    // d: 0 on a batten's centre line, 1 midway between two; crown 0 on the batten, 1 off it.
    const d = Math.abs((xm % BATTEN) - BATTEN / 2) / (BATTEN / 2);
    const crown = kit.smooth(0.08, 0.16, d);
    s.height[i] = (s.height[i] ?? 0) + 0.02 * (1 - crown);
    const streak = 0.06 * kit.noise(xm, ym, 0.4, 2.5, 5, 2);
    s.tone[i] = (s.tone[i] ?? 1) * (crown < 1 ? 1.3 - 0.3 * crown : 0.92 + streak);
  });
};

export const CANOPY = defineMaterial({
  id: 'station_canopy_felt',
  kind: 'noise',
  scaleMetres: 1,
  spanMetres: 4.5,
  roughness: 0.8,
  paint: rollTop,
  row: 9,
  description: 'Roll-top roofing felt on boarding: a raised batten every 0.45 m, lighter crowns.',
});

/** 5 × 7 glyphs, rows top to bottom, '#' = paint. */
const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  N: ['#...#', '##..#', '#.#.#', '#.#.#', '#..##', '#...#', '#...#'],
  G: ['.####', '#....', '#....', '#.###', '#...#', '#...#', '.###.'],
};

/** The running-in board's name, as painted. */
export const BOARD_NAME = 'TODDINGTON';
/** Board face the strip spans: 4.6 m of lettering along U, one 0.55 m band. */
export const BOARD_SPAN = 4.6;

const lettering: MaterialPainter = (s) => {
  const n = BOARD_NAME.length;
  const cellU = BOARD_SPAN / n;
  s.colours = null;
  const rgba = new Uint8Array(s.w * s.h * 4);
  for (let y = 0; y < s.h; y++) {
    // Row y grows with world up: glyph row 0 is the top.
    const gv = (1 - (y + 0.5) / s.h - 0.12) / 0.76;
    for (let x = 0; x < s.w; x++) {
      const um = ((x + 0.5) / s.w) * s.metresU;
      const k = Math.floor(um / cellU);
      const gu = ((um - k * cellU) / cellU - 0.1) / 0.8;
      const g = GLYPHS[BOARD_NAME[k] ?? ''] ?? [];
      const row = g[Math.floor(gv * 7)] ?? '';
      const on = gv >= 0 && gv < 1 && gu >= 0 && gu < 1 && row[Math.floor(gu * 5)] === '#';
      const v = on ? 236 : 22;
      rgba.set([v, v, v, 255], (y * s.w + x) * 4);
    }
  }
  s.rgba = rgba;
};

export const BOARD = defineMaterial({
  id: 'station_board_name',
  kind: 'flat',
  scaleMetres: 0.55,
  spanMetres: BOARD_SPAN,
  roughness: 0.6,
  paint: lettering,
  row: 10,
  description: `The running-in board lettering "${BOARD_NAME}" (white block capitals on black), one quad.`,
});
