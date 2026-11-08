// The roadster's colours (sRGB hex → linear via `hex`). Library strips (chrome, aluminium,
// rubber, leather, canvas) carry their own albedo, so they take NATURAL or a tint; painted and
// moulded parts (plastic strip) take the paint colour itself.

import { hex, NATURAL } from '@developerz.ai/ts23d';

/** Default livery chips (sRGB): the paint slots' defaults and the variants. */
export const LIVERY = {
  crimson: '#a5110f',
  cobalt: '#1d3f8f',
  white: '#eef0f0',
  sunYellow: '#e8b40c',
  black: '#0d0e10',
} as const;

export const C = {
  paint: hex(LIVERY.crimson),
  natural: NATURAL,
  /** Satin black trim: cowl, grilles, mirror arms, diffuser. */
  black: hex('#141516'),
  /** Textured black plastic: liners, under-tray, splash shields. */
  liner: hex('#1d1e20'),
  carbon: hex('#202326'),
  /** Engine castings. */
  alloyCast: hex('#9a9c9e'),
  ironDark: hex('#3a3a3c'),
  /** Wrinkle-red valve covers. */
  valveRed: hex('#8e1410'),
  hoseBlack: hex('#202020'),
  wireBlack: hex('#151515'),
  wireOrange: hex('#c4561b'),
  reservoir: hex('#d9d2b8'),
  capYellow: hex('#e2b21a'),
  capBlue: hex('#2a5bc0'),
  radiator: hex('#2b2d30'),
  /** Heat-blued / browned exhaust steel. */
  exhaust: hex('#8a7a6a'),
  heatShield: hex('#c9c9c4'),
  leather: hex('#2a2626'),
  leatherAccent: hex('#7a1714'),
  stitch: hex('#b8382f'),
  carpet: hex('#3a3a3c'),
  dash: hex('#1f1f21'),
  gaugeFace: hex('#101012'),
  gaugeGlow: hex('#ffb347'),
  glass: hex('#cfd9de'),
  lensClear: hex('#e9eef2'),
  lensRed: hex('#d8160e'),
  lensAmber: hex('#e8890c'),
  lampGlow: hex('#fff2d8'),
  tailGlow: hex('#ff2010'),
  rubber: NATURAL,
  tyreWall: hex('#c8c8c8'),
  caliperRed: hex('#b8150f'),
  caliperGrey: hex('#4a4d52'),
  disc: hex('#b9b4ad'),
  springRed: hex('#a01e18'),
  battery: hex('#2a2a2c'),
  steelZinc: hex('#cfc8a8'),
  frame: hex('#26282b'),
  badge: hex('#c9ccd0'),
} as const;
