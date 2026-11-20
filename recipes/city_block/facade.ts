// Facade pieces of a West Village block, each authored in edge-local space (x out of the wall,
// y along the edge from its start, z up from the building's base) and placed by the caller:
// sash windows set in a frame that straddles the wall plane, cast-iron shopfronts with a sign
// band and canvas awning, brownstone stoops with iron rails up to a panelled door, and
// tenement fire escapes (platforms, rails, stair runs, brackets) floor by floor.

import {
  beam,
  box,
  cell,
  hex,
  type Lod,
  type Mesh,
  merge,
  place,
  prism,
  type Vec3,
} from '@developerz.ai/ts23d';

export const IRON_BLACK = hex('#23211f');
const GLASS = hex('#2a3540');
const BULKHEAD = hex('#3a302a');
const CANVAS = [hex('#7a1f1f'), hex('#1f4a33'), hex('#23324d'), hex('#5a4a2a')] as const;
const SIGN = [hex('#1d1d1d'), hex('#5c1a14'), hex('#163a2c'), hex('#c8b98f')] as const;
const BROWNSTONE = hex('#6b4a3c');
const LINTEL = hex('#bdb3a2');
const DOOR = [hex('#2a1d16'), hex('#1d2a22'), hex('#3b1612')] as const;

/**
 * One sash window, `w` × `h`, bottom centre at the local origin: the window_sash decal on a frame
 * standing 1.5 cm proud of the wall with its reveal 1.5 cm into it (LOD0); far, the decal alone,
 * 1 cm proud. A stone sill under it and a stone lintel over it at LOD0 when `sill`.
 */
export function sashWindow(
  w: number,
  h: number,
  trim: Vec3,
  lod: Lod,
  sill: boolean,
  flat = false,
): Mesh {
  if (lod > 0 || flat)
    return cell({
      // Up close (a side or rear wall at LOD0) the decal sits 2 mm proud, seated on the brick.
      origin: [flat && lod === 0 ? 0.002 : 0.01, -w / 2, 0],
      u: [0, w, 0],
      v: [0, 0, h],
      color: trim,
      cell: 'window_sash',
    });
  const out: Mesh[] = [
    cell({
      origin: [-0.015, -w / 2, 0],
      u: [0, w, 0],
      v: [0, 0, h],
      color: trim,
      cell: 'window_sash',
      inset: -0.03,
      revealColor: trim,
    }),
  ];
  if (sill)
    out.push(
      box({
        size: [0.1, w + 0.14, 0.06],
        at: [0.03, 0, -0.06],
        color: LINTEL,
        strip: 'stone',
        // Top and nose only: its 6 cm ends are lost against the reveal.
        omit: ['back', 'bottom', 'left', 'right'],
      }),
      // Lintel: a 15 cm stone (or brownstone) head 8 cm proud, its ends lost against the wall.
      box({
        size: [0.08, w + 0.2, 0.15],
        at: [0.025, 0, h],
        color: LINTEL,
        strip: 'stone',
        // Top and face: the soffit is seen only from the sidewalk, against the dark glass.
        omit: ['back', 'bottom', 'left', 'right'],
      }),
    );
  return merge(out);
}

/** Shopfront along [0, len] of a storey `fh` tall: bulkhead, glazing, mullions, a panelled shop
 *  door at LOD0, the sign band and (three in four) a canvas awning. */
export function shopfront(len: number, fh: number, pick: number, lod: Lod): Mesh {
  const mid = len / 2;
  const glassTop = Math.min(2.8, fh - 0.75);
  const out: Mesh[] = [
    box({ size: [0.14, len, 0.5], at: [0, mid, 0], color: BULKHEAD, strip: 'wood_painted' }),
    box({
      size: [0.1, len - 0.1, glassTop - 0.5],
      at: [0, mid, 0.5],
      color: GLASS,
      strip: 'glass',
    }),
    box({
      size: [0.22, len + 0.1, 0.55],
      at: [0.02, mid, glassTop],
      color: SIGN[pick % SIGN.length] ?? IRON_BLACK,
      strip: 'wood_painted',
    }),
  ];
  if (lod === 0) {
    const bays = Math.max(1, Math.round(len / 2.4));
    for (let i = 0; i <= bays; i++)
      out.push(
        box({
          size: [0.14, 0.07, glassTop - 0.5],
          at: [0.01, 0.05 + ((len - 0.1) * i) / bays, 0.5],
          color: BULKHEAD,
          strip: 'wood_painted',
        }),
      );
  }
  if (lod === 0 && len > 2.4) {
    // Shop door: a panelled leaf over the bulkhead and glazing, a third of the way along.
    const y = Math.max(0.7, len * 0.3);
    out.push(
      cell({
        origin: [0.085, y - 0.55, 0],
        u: [0, 1.1, 0],
        v: [0, 0, Math.min(2.3, glassTop - 0.05)],
        color: DOOR[pick % DOOR.length] ?? BULKHEAD,
        cell: 'door_panel',
      }),
    );
  }
  if (pick % 4 !== 3) {
    // Canvas awning: a sloped slab from the sign band with a short valance at its front.
    const top = glassTop + 0.3;
    out.push(
      prism({
        profile: [
          [-0.02, top],
          [1.4, top - 0.55],
          [1.4, top - 0.8],
          [1.36, top - 0.8],
          [1.36, top - 0.6],
          [-0.02, top - 0.12],
        ],
        depth: len - 0.3,
        plane: 'xz',
        centred: false,
        color: CANVAS[pick % CANVAS.length] ?? IRON_BLACK,
        strip: 'canvas',
      }),
    );
    // prism 'xz' extrudes along +Y from 0: start it 0.15 m in.
    const a = out.pop();
    if (a) out.push(place(a, { at: [0, 0.15, 0] }));
  }
  return merge(out);
}

/** Brownstone stoop of six risers up to a door 1.2 m above the walk, centred on y = 0. */
export function stoop(trim: Vec3, lod: Lod): Mesh {
  const out: Mesh[] = [];
  const rise = 0.2;
  for (let k = 0; k < 6; k++) {
    const d = 1.0 + (5 - k) * 0.28;
    out.push(
      box({
        size: [d + 0.02, 1.7, rise],
        at: [d / 2 - 0.01, 0, k * rise],
        color: BROWNSTONE,
        strip: 'stone',
        // Each step's back and underside sit in the wall and on the step below.
        omit: ['back', 'bottom'],
      }),
    );
  }
  const foot = 1.0 + 5 * 0.28;
  for (const s of [-1, 1]) {
    // Cheek walls either side, their tops stepping down with the flight.
    out.push(
      prism({
        profile: [
          [-0.02, 0],
          [foot, 0],
          [foot, 0.45],
          [1.0, 1.35],
          [-0.02, 1.35],
        ],
        depth: 0.25,
        plane: 'xz',
        centred: false,
        color: BROWNSTONE,
        strip: 'stone',
      }),
    );
    const c = out.pop();
    if (c) out.push(place(c, { at: [0, s > 0 ? 0.85 : -1.1, 0] }));
    if (lod === 0) {
      // Iron newel on the cheek's foot and a handrail up to the wall.
      out.push(
        box({
          size: [0.06, 0.06, 0.9],
          at: [foot - 0.15, s * 0.975, 0.45],
          color: IRON_BLACK,
          strip: 'iron',
        }),
      );
      out.push(
        beam({
          from: [foot - 0.15, s * 0.975, 1.33],
          to: [-0.02, s * 0.975, 2.3],
          width: 0.04,
          color: IRON_BLACK,
          strip: 'iron',
        }),
      );
    }
  }
  // Door and its stone hood.
  out.push(
    cell({
      origin: [-0.015, -0.55, 1.2],
      u: [0, 1.1, 0],
      v: [0, 0, 2.3],
      color: trim,
      cell: 'door_panel',
      inset: -0.03,
      revealColor: trim,
    }),
  );
  out.push(box({ size: [0.2, 1.5, 0.22], at: [0.06, 0, 3.5], color: BROWNSTONE, strip: 'stone' }));
  return merge(out);
}

/** Fire escape `w` wide centred on y = 0, a platform at every floor above the first. */
export function fireEscape(w: number, floors: number, fh: number, lod: Lod): Mesh {
  const out: Mesh[] = [];
  const iron = (size: Vec3, at: Vec3, omit: readonly ('top' | 'bottom' | 'back')[] = []): void => {
    out.push(box({ size, at, color: IRON_BLACK, strip: 'steel_painted', omit }));
  };
  for (let f = 1; f < floors; f++) {
    const z = f * fh;
    iron([0.852, w, 0.05], [0.424, 0, z - 0.05], ['back']); // grating, its back 2 mm behind the wall face
    // Rails keep their undersides: the street looks up at them between the posts.
    iron([0.03, w, 0.03], [0.835, 0, z + 0.87]); // top rail
    for (const s of [-1, 1]) {
      iron([0.03, 0.03, 0.9], [0.835, s * (w / 2 - 0.015), z], ['top', 'bottom']); // corner posts (ends buried)
      iron([0.852, 0.03, 0.03], [0.424, s * (w / 2 - 0.015), z + 0.87]); // side rails, bearing on the wall
    }
    if (lod > 0) continue;
    if (f + 1 < floors)
      // Stair run from this platform up to the underside of the next.
      out.push(
        beam({
          from: [0.45, -w / 2 + 0.35, z - 0.03],
          to: [0.45, w / 2 - 0.35, z + fh - 0.02],
          width: 0.42,
          height: 0.04,
          color: IRON_BLACK,
          strip: 'steel_painted',
          up: [1, 0, 0],
        }),
      );
    // Knee brackets: triangular plates, the back edge flat on the wall, the top under the grating.
    for (const s of [-1, 1])
      out.push(
        place(
          prism({
            profile: [
              [-0.002, z - 0.7],
              [-0.002, z - 0.05],
              [0.8, z - 0.05],
            ],
            depth: 0.03,
            plane: 'xz',
            centred: false,
            color: IRON_BLACK,
            strip: 'steel_painted',
          }),
          { at: [0, s * (w / 2 - 0.25) - 0.015, 0] },
        ),
      );
  }
  return merge(out);
}
