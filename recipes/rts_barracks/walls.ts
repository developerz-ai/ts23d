// Warden Hall walls from the cell plan: LOD0 lays every block (running bond, bevelled, tone
// jitter), LOD1 merges each column's runs into one box, LOD2 one box per bay up to its top. Holes
// and ragged tops come from the plan, so all three LODs agree on what is standing. Plus the
// plinth, pilasters between bays and amber window slits. Blocks are dressed stone (`concrete`
// grain per block at LOD0; the `stone` strip's coursing stands in for them at LOD1/2).

import {
  box,
  type GrimeZone,
  grime,
  type Lod,
  type Mesh,
  merge,
  type Rng,
  type StripId,
  type Vec3,
} from '@developerz.ai/ts23d';
import { BONE, BONE_DARK, GLOW, pebble, SLATE } from '../_lib/rts/style.ts';
import {
  type Bay,
  bayTop,
  COLS,
  COURSE,
  HALF_X,
  HALF_Y,
  PLINTH,
  PLINTH_OUT,
  WALL_T,
} from './plan.ts';

/** An axis-aligned block: `t0..t1` along the bay, rows r0..r1, full wall thickness. */
function block(
  b: Bay,
  t0: number,
  t1: number,
  r0: number,
  r1: number,
  color: Vec3,
  bevel: number,
  strip: StripId = 'concrete',
): Mesh {
  const mid = (t0 + t1) / 2;
  const at: Vec3 = [
    b.origin[0] + b.dir[0] * mid,
    b.origin[1] + b.dir[1] * mid,
    b.origin[2] + r0 * COURSE,
  ];
  const along = t1 - t0;
  const size: Vec3 =
    b.dir[0] !== 0 ? [along, WALL_T, (r1 - r0) * COURSE] : [WALL_T, along, (r1 - r0) * COURSE];
  return box({ size, at, color, strip, bevel });
}

const has = (b: Bay, r: number, c: number): boolean => b.cells[r]?.[c] === true;

/** LOD0: every block in running bond (odd rows offset half a block). */
function blocks(b: Bay, rng: Rng): Mesh[] {
  const w = b.len / COLS;
  const out: Mesh[] = [];
  const tone = (): Vec3 => {
    const k = rng.range(0.9, 1.06);
    return [BONE[0] * k, BONE[1] * k, BONE[2] * k];
  };
  b.cells.forEach((row, r) => {
    if (r % 2 === 0) {
      row.forEach((on, c) => {
        if (on) out.push(block(b, c * w, (c + 1) * w, r, r + 1, tone(), 0.035));
      });
      return;
    }
    // Odd row: half block, then blocks straddling two cells, then half block.
    if (has(b, r, 0)) out.push(block(b, 0, w / 2, r, r + 1, tone(), 0.035));
    for (let c = 0; c < COLS - 1; c++)
      if (has(b, r, c) && has(b, r, c + 1))
        out.push(block(b, (c + 0.5) * w, (c + 1.5) * w, r, r + 1, tone(), 0.035));
      else if (has(b, r, c))
        out.push(block(b, (c + 0.5) * w, (c + 1) * w, r, r + 1, tone(), 0.035));
      else if (has(b, r, c + 1))
        out.push(block(b, (c + 1) * w, (c + 1.5) * w, r, r + 1, tone(), 0.035));
    if (has(b, r, COLS - 1))
      out.push(block(b, (COLS - 0.5) * w, COLS * w, r, r + 1, tone(), 0.035));
  });
  return out;
}

/** LOD1: each column's vertical runs as one box. */
function columns(b: Bay): Mesh[] {
  const w = b.len / COLS;
  const out: Mesh[] = [];
  for (let c = 0; c < COLS; c++) {
    let r = 0;
    while (r < b.cells.length) {
      if (!has(b, r, c)) {
        r++;
        continue;
      }
      const r0 = r;
      while (has(b, r, c)) r++;
      out.push(block(b, c * w, (c + 1) * w, r0, r, BONE, 0, 'stone'));
    }
  }
  return out;
}

/** LOD2: one stack per bay to its top row (a door bay keeps only its lintel). */
function stack(b: Bay): Mesh[] {
  const top = bayTop(b);
  if (top === 0) return [];
  let r0 = 0;
  while (r0 < top && !b.cells[r0]?.some(Boolean)) r0++;
  return [block(b, 0, b.len, r0, top, BONE, 0, 'stone')];
}

export interface WallMeshes {
  readonly walls: Mesh | null;
  readonly trim: Mesh | null;
  readonly windows: Mesh | null;
  /** Window sill centres: where rain streaks start (weather fasteners). */
  readonly sills: readonly Vec3[];
}

/** Walls, pilasters and windows for this LOD, scorched round `scorch` zones. */
export function walls(
  lod: Lod,
  list: readonly Bay[],
  rng: Rng,
  scorch: readonly GrimeZone[],
): WallMeshes {
  const ms = list.flatMap((b) => (lod === 0 ? blocks(b, rng) : lod === 1 ? columns(b) : stack(b)));
  const trim: Mesh[] = [];
  const glow: Mesh[] = [];
  const sills: Vec3[] = [];
  if (lod < 2)
    for (const b of list) {
      const top = bayTop(b);
      // Pilaster at the bay's start, as tall as the wall there.
      if (top >= 2 && !b.door) {
        const at: Vec3 = [
          b.origin[0] + b.out[0] * (WALL_T / 2),
          b.origin[1] + b.out[1] * (WALL_T / 2),
          PLINTH,
        ];
        const size: Vec3 = b.dir[0] !== 0 ? [0.42, 0.36, top * COURSE] : [0.36, 0.42, top * COURSE];
        trim.push(pebble(lod, size, at, BONE_DARK));
      }
      // Window slit mid-bay where rows 4–6 stand.
      if (!b.door && [4, 5, 6].every((r) => b.cells[r]?.every(Boolean))) {
        const t = b.len / 2;
        const at: Vec3 = [
          b.origin[0] + b.dir[0] * t + b.out[0] * (WALL_T / 2),
          b.origin[1] + b.dir[1] * t + b.out[1] * (WALL_T / 2),
          PLINTH + 4.1 * COURSE,
        ];
        const size: Vec3 = b.dir[0] !== 0 ? [0.28, 0.08, 1.1] : [0.08, 0.28, 1.1];
        glow.push(box({ size, at, color: GLOW }));
        sills.push([at[0] + b.out[0] * 0.05, at[1] + b.out[1] * 0.05, at[2] - 0.02]);
      }
    }
  // Scorch only: ground damp, moss and streaks are measured wear (weather() in the hall).
  const zones = [...scorch];
  const walls = ms.length ? grime(merge(ms), { zones }) : null;
  return {
    walls,
    trim: trim.length ? grime(merge(trim), { zones }) : null,
    windows: glow.length ? merge(glow) : null,
    sills,
  };
}

/** The slate plinth the hall stands on (every stage). */
export function plinth(lod: Lod, scorch: readonly GrimeZone[] = []): Mesh {
  const size: Vec3 = [(HALF_X + PLINTH_OUT) * 2, (HALF_Y + PLINTH_OUT) * 2, PLINTH];
  const slab = box({
    size,
    at: [0, 0, 0],
    color: SLATE,
    strip: 'stone',
    bevel: lod === 2 ? 0 : 0.06,
    omit: ['bottom'],
  });
  if (lod === 2) return grime(slab, { zones: scorch });
  // Front steps up to the door.
  const steps = [1, 2].map((i) =>
    box({
      size: [0.4, 4.6, PLINTH - i * 0.2],
      at: [HALF_X + PLINTH_OUT + 0.4 * i - 0.2, 0, 0],
      color: SLATE,
      strip: 'stone',
    }),
  );
  return grime(merge([slab, ...steps]), { zones: scorch });
}
