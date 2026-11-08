// A parametric bust torso, shared by the human, elf and goblin busts: neck (a column leaning
// forward from the chest into the skull, the sternocleidomastoid V from behind each ear to the
// sternal notch, the larynx), trapezius sloping from the skull base to the shoulders, deltoids,
// chest and upper back, cut as a classical bust (flat base, flanks narrowing to the socle). Sizes
// in metres from the head height H and a `mass` knob (0 bony … 1 brute). `checkNeck` holds the
// neck to measured ratios (width vs head width, length visible above the collar) with declared
// stylisation. `garment()` turns any body field into cloth: the body pushed out inside a region.

import { type Field, type SculptEdit, Ts23dError } from '@developerz.ai/ts23d';
import type { Landmarks } from './head.ts';
import { ball, chain, cone2, ell, scrape, spline, taper, type V } from './kit.ts';

export interface TorsoSpec {
  /** Shoulder half-span (acromion), metres. */
  readonly shoulders: number;
  /** 0 bony … 1 brute. */
  readonly mass: number;
  /** Neck radius at its base, metres (the column; the sternocleidomastoids add to it). */
  readonly neck: number;
  /** Larynx (Adam's apple) prominence: 0 none … 1 adult male. */
  readonly larynx?: number;
  /** Bust cut height (base of the bust, on the plinth), metres. */
  readonly cutZ: number;
}

export function torsoEdits(l: Landmarks, t: TorsoSpec): SculptEdit[] {
  const { H } = l;
  const m = t.mass;
  const sh = t.shoulders;
  const chestZ = l.mz - 0.75 * H;
  const { base: neckBase, top: neckTop } = neckAxis(l);
  const body: SculptEdit[] = [
    // Rib cage and upper back.
    ell([l.back + 0.45 * H, 0, chestZ], [0.42 * H * (0.9 + 0.2 * m), sh * 0.82, 0.5 * H]),
    ell([l.back + 0.3 * H, 0, chestZ + 0.25 * H], [0.3 * H, sh * 0.8, 0.3 * H], {
      blend: 0.12 * H,
    }),
    // Pectorals.
    ell(
      [l.gx - 0.12 * H, sh * 0.38, chestZ + 0.1 * H],
      [0.16 * H, sh * 0.42, 0.2 * H * (0.8 + 0.4 * m)],
      {
        blend: 0.1 * H,
        rotate: [-10, 8, -6],
      },
    ),
    // Sternum: fills the valley where the mirrored pectorals meet (a furrow through the shirt).
    ell([l.gx - 0.16 * H, 0, chestZ + 0.1 * H], [0.08 * H, sh * 0.2, 0.22 * H], { blend: 0.1 * H }),
    // Deltoids and arm stubs.
    // (Blended wide into the pectoral: a tight blend left a deltopectoral fold through the cloth.)
    ball([l.back + 0.45 * H, sh, chestZ + 0.26 * H], 0.26 * H * (0.85 + 0.35 * m), {
      blend: 0.18 * H,
    }),
    cone2(
      [l.back + 0.45 * H, sh, chestZ + 0.26 * H],
      [l.back + 0.44 * H, sh * 1.03, chestZ - 0.25 * H],
      0.22 * H * (0.85 + 0.3 * m),
      0.2 * H * (0.85 + 0.3 * m),
      { blend: 0.1 * H },
    ),
    // The back's plane.
    scrape([l.back + 0.02 * H, 0, chestZ], [-1, 0, 0.12], 1, 0.12 * H),
    // The bust cut: base and narrowing flanks.
    {
      // The base sits 4 mm into the plinth top: seated, and its rim folds out of sight.
      field: bustCut(baseZ(t), 0.3 * H, 0.26 * H),
      bounds: [
        [-2, -2, -1],
        [2, 2, 3],
      ],
      op: 'intersect',
      // Soft socle facets: the flanks roll onto the cut instead of folding at a knife edge.
      blend: 0.06 * H,
    },
  ];
  const out: SculptEdit[] = [{ group: body }];
  // Neck: a column leaning forward from the chest into the skull.
  out.push(cone2(neckBase, neckTop, t.neck, t.neck * NECK_TAPER, { blend: 0.12 * H }));
  // Sternocleidomastoid: from the mastoid behind the ear down and forward to the sternal notch —
  // the V that frames the throat. Broad and low, blended deep: a plane change, not a rope.
  const notch: V = [neckBase[0] + t.neck * 0.75, t.neck * 0.18, l.mz - 0.36 * H];
  const mastoid: V = [l.ear[0] - 0.06 * H, l.ear[1] * 0.72, l.ear[2] - 0.04 * H];
  const scm = spline([mastoid, lerpV(mastoid, notch, 0.5, [0, t.neck * 0.25, 0]), notch], 7);
  out.push(chain(scm, taper(7, t.neck * 0.34, t.neck * 0.26), { blend: 0.1 * H }));
  // Larynx: a soft wedge on the throat's midline a third of the way down.
  const lx = t.larynx ?? 0;
  if (lx > 0)
    out.push(
      ell([neckBase[0] + t.neck * 0.78, 0, l.mz - 0.12 * H], [0.035 * H * lx, 0.04 * H, 0.06 * H], {
        blend: 0.05 * H,
        mirror: false,
      }),
    );
  // Trapezius: from the skull base, sloping out over the neck to the shoulder.
  const trap = spline(
    [
      [l.back + 0.2 * H, 0, l.mz + 0.08 * H],
      [l.back + 0.27 * H, sh * 0.42, l.mz - 0.24 * H],
      [l.back + 0.4 * H, sh * 0.92, chestZ + 0.42 * H],
    ],
    6,
  );
  out.push(
    chain(trap, taper(6, 0.11 * H * (0.6 + 0.6 * m), 0.13 * H * (0.6 + 0.6 * m), 0.05 * H), {
      blend: 0.16 * H,
    }),
  );
  return out;
}

const lerpV = (a: V, b: V, k: number, d: V): V => [
  a[0] + (b[0] - a[0]) * k + d[0],
  a[1] + (b[1] - a[1]) * k + d[1],
  a[2] + (b[2] - a[2]) * k + d[2],
];

/** Neck top radius ÷ base radius. */
const NECK_TAPER = 0.92;

/** The neck column's axis: base in the chest, top inside the skull, leaning forward ~12°. */
export function neckAxis(l: Landmarks): { base: V; top: V } {
  const { H } = l;
  return {
    base: [l.back + 0.36 * H, 0, l.mz - 0.45 * H],
    top: [l.back + 0.5 * H, 0, l.mz + 0.22 * H],
  };
}

/** The neck against the head: `width` = column diameter half-way up its visible length ÷ cranium
 *  width (front view); `length` = menton height above the collar seam on the neck axis ÷ H. */
export function neckRatios(l: Landmarks, t: TorsoSpec): { width: number; length: number } {
  const { base, top } = neckAxis(l);
  const seam = neckSeam(l);
  // Seam height where the neck axis crosses it (the seam plane z falls 0.3 per metre forward).
  const k =
    (seam.at[2] - base[2] - 0.3 * (base[0] - seam.at[0])) /
    (top[2] - base[2] + 0.3 * (top[0] - base[0]));
  const seamZ = base[2] + (top[2] - base[2]) * k;
  const midZ = (seamZ + l.mz) / 2;
  const f = (midZ - base[2]) / (top[2] - base[2]);
  const r = t.neck * (1 + (NECK_TAPER - 1) * f);
  return { width: (2 * r) / (2 * l.cranium.r[1]), length: (l.mz - seamZ) / l.H };
}

/** Human male neck (docs/research/head-analysis.md, anthropometry): column ≈ 0.7–0.8 × the head's
 *  width, chin ≈ 0.25–0.35 H above the collar line. A stylised race declares its own range. */
export const NECK_HUMAN: NeckRange = { width: [0.7, 0.8], length: [0.25, 0.35] };

/** Declared neck ratio ranges: width × head width, length × H above the collar. */
export interface NeckRange {
  readonly width: readonly [number, number];
  readonly length: readonly [number, number];
}

/**
 * Throws T3D_RECIPE_INVALID when the neck is outside the declared ratio range (default: human).
 * A goblin declares e.g. `{ width: [0.45, 0.6], length: [0.2, 0.35] }` — skinny, but still a neck.
 */
export function checkNeck(
  l: Landmarks,
  t: TorsoSpec,
  declared: {
    readonly width: readonly [number, number];
    readonly length: readonly [number, number];
  } = NECK_HUMAN,
  name = 'bust',
): { width: number; length: number } {
  const got = neckRatios(l, t);
  for (const key of ['width', 'length'] as const) {
    const [lo, hi] = declared[key];
    if (got[key] < lo || got[key] > hi)
      throw new Ts23dError('T3D_RECIPE_INVALID', {
        cause: `${name}: neck ${key} ${got[key].toFixed(3)} is outside the declared ${lo}…${hi} (${key === 'width' ? '× head width' : '× H above the collar'})`,
        fix:
          key === 'width'
            ? `set torso.neck to ≈ ${(((lo + hi) / 2) * l.cranium.r[1] * 1.04).toFixed(3)} m (human neck ≈ 0.7–0.8 × head width)`
            : 'move the neck seam / collar, or the head, so the chin sits 0.25–0.35 H above the collar',
      });
  }
  return got;
}

/** The neck seam: a plane round the neck base (higher at the back), where a collar, ruff or
 *  necklace sits and a bust may split into a fine-celled head and a coarser torso. ≥ 0 = head. */
export function neckSeam(l: Landmarks): { field: Field; at: V; n: V } {
  const at: V = [l.back + 0.45 * l.H, 0, l.mz - 0.3 * l.H];
  const n: V = [0.3, 0, 1];
  const k = Math.hypot(n[0], n[1], n[2]);
  return {
    at,
    n,
    field: (p) => ((p[0] - at[0]) * n[0] + (p[1] - at[1]) * n[1] + (p[2] - at[2]) * n[2]) / k,
  };
}

/** The bust cut: keep z ≥ cutZ and flanks within half-widths that grow with height. */
export function bustCut(cutZ: number, halfY: number, halfX: number): Field {
  return (p) => {
    const h = p[2] - cutZ;
    const side = (Math.abs(p[1]) - (halfY + h * 1.6)) / Math.hypot(1, 1.6);
    const front = (Math.abs(p[0] - 0) - (halfX + h * 0.8)) / Math.hypot(1, 0.8);
    return Math.max(-h, side, front);
  };
}

/** Cloth over a body: the body pushed out by `thick`, kept where `region` ≤ 0 and above `floor`
 *  (the bust's cut: cloth pushed out under the flat base made a step across it). */
export function garment(body: Field, thick: number, region: Field, floor = -Infinity): Field {
  return (p) => Math.max(body(p) - thick, region(p), floor - p[2]);
}

/** The bust's flat base height (the cut, seated 4 mm into the plinth top). */
export const baseZ = (t: TorsoSpec): number => t.cutZ - 0.004;
