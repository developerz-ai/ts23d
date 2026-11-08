// Warden Hall plan: footprint, storey numbers and the wall as a grid of block cells per bay. Build
// stage and damage are both just which cells exist: a stage caps the courses (ragged at the top
// while building), damage knocks holes and tops off, rubble leaves stubs. One seeded rng per
// feature (ctx.rng.fork), so a hole never moves when another feature changes.

import type { Rng, Vec3 } from '@developerz.ai/ts23d';

export type Stage = 'foundation' | 'scaffold' | 'complete';
export type Damage = 'intact' | 'damaged' | 'rubble';

/** Hall: X front-back (front +X), Y across. Metres. */
export const HALF_X = 5;
export const HALF_Y = 7;
export const PLINTH = 0.6;
export const PLINTH_OUT = 0.5;
export const WALL_T = 0.5;
export const COURSE = 0.5;
export const ROWS = 9; // 4.5 m eaves above the plinth
export const EAVES = PLINTH + ROWS * COURSE;
export const BAY = 2;
export const COLS = 2; // 1 m blocks
/** Door: the two middle front bays, rows below this are open. */
export const DOOR_ROWS = 7;
/** Bays that take a shell hole when damaged: on the faces a 3/4 front-right camera sees. */
export const HOLES = ['front_1', 'right_1', 'right_3'] as const;
export const TOWER = { x: -HALF_X, y: HALF_Y, r: 1.8, height: 7.2 } as const;

export interface Bay {
  readonly id: string;
  /** Wall centreline start, at plinth top. */
  readonly origin: Vec3;
  /** Unit direction along the wall. */
  readonly dir: Vec3;
  /** Outward normal. */
  readonly out: Vec3;
  readonly len: number;
  readonly door: boolean;
  /** cells[row][col]: block present. */
  readonly cells: boolean[][];
}

/** The 24 bays round the hall: front (+X) and back span the full width, sides fit between. */
export function bays(): Bay[] {
  const out: Bay[] = [];
  const sideLen = HALF_X * 2 - WALL_T;
  const run = (
    id: string,
    origin: Vec3,
    dir: Vec3,
    normal: Vec3,
    len: number,
    door: (i: number, n: number) => boolean,
  ) => {
    const n = Math.round(len / BAY);
    for (let i = 0; i < n; i++) {
      const o: Vec3 = [
        origin[0] + dir[0] * (len / n) * i,
        origin[1] + dir[1] * (len / n) * i,
        PLINTH,
      ];
      const cells = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => true));
      out.push({
        id: `${id}_${i}`,
        origin: o,
        dir,
        out: normal,
        len: len / n,
        door: door(i, n),
        cells,
      });
    }
  };
  const none = (): boolean => false;
  run(
    'front',
    [HALF_X, -HALF_Y, 0],
    [0, 1, 0],
    [1, 0, 0],
    HALF_Y * 2,
    (i, n) => i === n / 2 - 1 || i === n / 2,
  );
  run('back', [-HALF_X, HALF_Y, 0], [0, -1, 0], [-1, 0, 0], HALF_Y * 2, none);
  run('left', [-HALF_X + WALL_T / 2, HALF_Y, 0], [1, 0, 0], [0, 1, 0], sideLen, none);
  run('right', [HALF_X - WALL_T / 2, -HALF_Y, 0], [-1, 0, 0], [0, -1, 0], sideLen, none);
  return out;
}

/** Cap every bay at `rows` (ragged by ±1 when `ragged`), and open the door bays. */
function cap(list: Bay[], rows: (b: Bay, i: number) => number): void {
  list.forEach((b, i) => {
    const h = rows(b, i);
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const row = b.cells[r];
        if (row) row[c] = r < h && !(b.door && r < DOOR_ROWS);
      }
  });
}

/** Knock a ragged hole of radius ~`size` cells round (row, col) of a bay. */
function hole(b: Bay, row: number, col: number, size: number, rng: Rng): void {
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const d = Math.hypot(r - row, (c - col) * 1.6);
      const cells = b.cells[r];
      if (cells && d < size + rng.range(-0.4, 0.4)) cells[c] = false;
    }
}

/** Which blocks exist for a stage × damage, seeded. */
export function wallCells(stage: Stage, damage: Damage, rng: Rng): Bay[] {
  const list = bays();
  const top = stage === 'complete' ? ROWS : stage === 'scaffold' ? 5 : 1;
  const ragged = rng.fork('ragged');
  cap(list, (_, i) => {
    // The first course going down; a raid on the site knocks some of it back off.
    if (stage === 'foundation')
      return i % 3 === 0 && !(damage === 'damaged' && ragged.next() < 0.5) ? 1 : 0;
    let h = stage === 'scaffold' ? top - ragged.int(0, 2) : top;
    if (damage === 'damaged' && ragged.next() < 0.3) h -= ragged.int(1, 3);
    if (damage === 'rubble') h = Math.min(h, ragged.int(0, 3));
    return Math.max(0, h);
  });
  if (damage === 'damaged' && stage !== 'foundation') {
    const holes = rng.fork('holes');
    for (const id of HOLES) {
      const b = list.find((x) => x.id === id);
      if (b)
        hole(b, Math.min(top - 2, holes.int(3, 5)), holes.int(0, 1), holes.range(1.4, 2), holes);
    }
  }
  return list;
}

/** Height of a bay's tallest standing column, in rows (for LOD2 stacks). */
export function bayTop(b: Bay): number {
  let top = 0;
  b.cells.forEach((row, r) => {
    if (row.some(Boolean)) top = r + 1;
  });
  return top;
}
