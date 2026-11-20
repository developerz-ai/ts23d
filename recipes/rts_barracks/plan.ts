// Warden Hall plan: footprint, storey numbers and the wall as a grid of block cells per bay. Build
// stage and damage are both just which cells exist: a stage caps the courses (ragged at the top
// while building), damage knocks holes and tops off, rubble leaves stubs. One seeded rng per
// feature (ctx.rng.fork), so a hole never moves when another feature changes.

import type { Rng, Vec2, Vec3 } from '@developerz.ai/ts23d';
import { dmath } from '@developerz.ai/ts23d';

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
/** Door: rows below this are open across the gate's 4 m (|y| < GATE_HALF) on the front. */
export const DOOR_ROWS = 7;
export const GATE_HALF = 2;
/** Bays that take a shell hole when damaged: on the faces a 3/4 front-right camera sees. */
export const HOLES = ['front_1', 'right_1', 'right_3'] as const;
export const TOWER = { x: -HALF_X, y: HALF_Y, r: 1.8, height: 7.2 } as const;

const PX = HALF_X + PLINTH_OUT;
const PY = HALF_Y + PLINTH_OUT;
/** Plan outline of the plinth with its front-right corner blown off (a raided site), CCW. */
export const BROKEN_PLINTH: readonly Vec2[] = [
  [-PX, -PY],
  [PX - 2.6, -PY],
  [PX - 2.2, -PY + 0.5],
  [PX - 1.5, -PY + 0.35],
  [PX - 1.1, -PY + 1.1],
  [PX - 0.45, -PY + 1.35],
  [PX - 0.25, -PY + 2.2],
  [PX, -PY + 2.5],
  [PX, PY],
  [-PX, PY],
];

/** Distance from (x, y) to segment a–b. */
function segDist(x: number, y: number, a: Vec2, b: Vec2): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
  return dmath.hypot(x - a[0] - dx * t, y - a[1] - dy * t);
}

/**
 * The plan rect x0..x1 × y0..y1 lies inside `poly` with at least `margin` to spare: its corners
 * are inside and that far from every edge, and no outline corner pokes into the rect grown by it.
 */
export function rectInside(
  poly: readonly Vec2[],
  r: { x0: number; x1: number; y0: number; y1: number },
  margin: number,
): boolean {
  const inside = (x: number, y: number): boolean => {
    let odd = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [a, b] = [poly[i] ?? [0, 0], poly[j] ?? [0, 0]];
      if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0])
        odd = !odd;
    }
    return odd;
  };
  const corners: Vec2[] = [
    [r.x0, r.y0],
    [r.x1, r.y0],
    [r.x1, r.y1],
    [r.x0, r.y1],
  ];
  const clear = (x: number, y: number): boolean =>
    poly.every((a, i) => segDist(x, y, a, poly[(i + 1) % poly.length] ?? a) >= margin - 1e-9);
  if (!corners.every(([x, y]) => inside(x, y) && clear(x, y))) return false;
  return !poly.some(
    ([x, y]) => x > r.x0 - margin && x < r.x1 + margin && y > r.y0 - margin && y < r.y1 + margin,
  );
}

export interface Bay {
  readonly id: string;
  /** Wall centreline start, at plinth top. */
  readonly origin: Vec3;
  /** Unit direction along the wall. */
  readonly dir: Vec3;
  /** Outward normal. */
  readonly out: Vec3;
  readonly len: number;
  /** The bay touches the gate opening (no window, no pilaster inside the opening). */
  readonly door: boolean;
  /** Per column: the cell lies in the gate opening (open below DOOR_ROWS). */
  readonly doorCols: readonly boolean[];
  /** cells[row][col]: block present. */
  readonly cells: boolean[][];
}

/** The 24 bays round the hall: front (+X) and back span the full width, sides fit between. */
export function bays(): Bay[] {
  const out: Bay[] = [];
  const sideLen = HALF_X * 2 - WALL_T;
  const run = (id: string, origin: Vec3, dir: Vec3, normal: Vec3, len: number, gate: boolean) => {
    const n = Math.round(len / BAY);
    for (let i = 0; i < n; i++) {
      const o: Vec3 = [
        origin[0] + dir[0] * (len / n) * i,
        origin[1] + dir[1] * (len / n) * i,
        PLINTH,
      ];
      const cells = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => true));
      // A cell is in the gate when its centre lies inside the 4 m opening (front only).
      const doorCols = Array.from({ length: COLS }, (_, c) => {
        const t = (len / n) * (i + (c + 0.5) / COLS);
        return gate && Math.abs(origin[1] + dir[1] * t) < GATE_HALF;
      });
      out.push({
        id: `${id}_${i}`,
        origin: o,
        dir,
        out: normal,
        len: len / n,
        door: doorCols.some(Boolean),
        doorCols,
        cells,
      });
    }
  };
  run('front', [HALF_X, -HALF_Y, 0], [0, 1, 0], [1, 0, 0], HALF_Y * 2, true);
  run('back', [-HALF_X, HALF_Y, 0], [0, -1, 0], [-1, 0, 0], HALF_Y * 2, false);
  run('left', [-HALF_X + WALL_T / 2, HALF_Y, 0], [1, 0, 0], [0, 1, 0], sideLen, false);
  run('right', [HALF_X - WALL_T / 2, -HALF_Y, 0], [-1, 0, 0], [0, -1, 0], sideLen, false);
  return out;
}

/** Cap every bay at `rows` (ragged by ±1 when `ragged`), and open the door bays. */
function cap(list: Bay[], rows: (b: Bay, i: number) => number): void {
  list.forEach((b, i) => {
    const h = rows(b, i);
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const row = b.cells[r];
        if (row) row[c] = r < h && !(b.doorCols[c] === true && r < DOOR_ROWS);
      }
  });
}

/** Knock a ragged hole of radius ~`size` cells round (row, col) of a bay. */
function hole(b: Bay, row: number, col: number, size: number, rng: Rng): void {
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const d = dmath.hypot(r - row, (c - col) * 1.6);
      const cells = b.cells[r];
      if (cells && d < size + rng.range(-0.4, 0.4)) cells[c] = false;
    }
}

/** Rows left standing per column at the ruin's corner (front_0 col 0 and right_0 col 0 meet). */
const CORNER: Readonly<Record<string, readonly number[]>> = {
  front_0: [7, 6],
  front_1: [4, 3],
  right_0: [7, 5],
  right_1: [3, 2],
};

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
  // A ruin keeps one corner standing (front-right, toward the camera), stepped down both walls,
  // so it still has a vertical and reads as a building that was.
  if (damage === 'rubble' && stage !== 'foundation')
    for (const [id, cols] of Object.entries(CORNER)) {
      const b = list.find((x) => x.id === id);
      if (b)
        cols.forEach((h, c) => {
          for (let r = 0; r < Math.min(h, top); r++) {
            const row = b.cells[r];
            if (row) row[c] = true;
          }
        });
    }
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
