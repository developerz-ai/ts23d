// Warden Hall walls from the cell plan: LOD0 lays every block (running bond, chamfered round its
// outward face only, tone jitter; faces buried against a neighbour are left out), LOD1 merges each
// column's runs into one box, LOD2 one box per course pair along each side, every other pair a
// shade darker so the coursing survives as 1 m value stripes. Holes, ragged tops and the gate
// opening come from the plan, so all three LODs agree on what is standing. Plus the plinth with
// its nosed steps, pilasters between bays and framed amber windows (stone jambs, head and sill, an
// iron mullion cross).

import {
  box,
  dmath,
  type Lod,
  type Mesh,
  MeshBuilder,
  merge,
  place,
  prism,
  type Rng,
  type StripId,
  stripRect,
  type Vec2,
  type Vec3,
} from '@developerz.ai/ts23d';
import { BONE, BONE_DARK, GLOW, IRON, pebble, SLATE, SOOT } from '../_lib/rts/style.ts';
import {
  type Bay,
  BROKEN_PLINTH,
  bayTop,
  COLS,
  COURSE,
  GATE_HALF,
  HALF_X,
  HALF_Y,
  PLINTH,
  PLINTH_OUT,
  WALL_T,
} from './plan.ts';
import { streak } from './surface.ts';

type Face = 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right';

/** The box faces that point along the bay (toward its start, toward its end). */
function ends(b: Bay): [Face, Face] {
  if (b.dir[0] > 0) return ['back', 'front'];
  if (b.dir[0] < 0) return ['front', 'back'];
  return b.dir[1] > 0 ? ['right', 'left'] : ['left', 'right'];
}

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
  omit: readonly Face[] = [],
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
  return box({ size, at, color, strip, bevel, omit });
}

/** The box face that looks out of the wall on bay b. */
function outward(b: Bay): Face {
  return b.out[0] > 0 ? 'front' : b.out[0] < 0 ? 'back' : b.out[1] > 0 ? 'left' : 'right';
}

const OPPOSITE: Record<Face, Face> = {
  front: 'back',
  back: 'front',
  left: 'right',
  right: 'left',
  top: 'bottom',
  bottom: 'top',
};
const opposite = (f: Face): Face => OPPOSITE[f];

/**
 * LOD0 dressed block: chamfered only round its outward face (the arrises the camera sees, where
 * neighbours meet in a V joint), flat everywhere else. A fully bevelled box keeps its 12 chamfers
 * even on faces buried in the wall: 36–44 triangles a block against 10–20 here, same silhouette.
 */
function dressed(
  b: Bay,
  t0: number,
  t1: number,
  r: number,
  color: Vec3,
  bev: number,
  omit: readonly Face[],
): Mesh {
  const keep = outward(b);
  const body = block(b, t0, t1, r, r + 1, color, 0, 'concrete', [...omit, keep]);
  // Pull the body's outward face back by the chamfer depth: the frustum below closes it.
  const o = b.out;
  const shift = (m: Mesh): Mesh => {
    const positions = new Float32Array(m.positions);
    const k = keep === 'front' || keep === 'left' ? 1 : -1;
    const axis = b.out[0] !== 0 ? 0 : 1;
    const face = (b.origin[axis] ?? 0) + (k * WALL_T) / 2;
    for (let i = axis; i < positions.length; i += 3)
      if (Math.abs((positions[i] ?? 0) - face) < 1e-5) positions[i] = face - k * bev;
    return { ...m, positions };
  };
  const z0 = (b.origin[2] ?? 0) + r * COURSE;
  const z1 = z0 + COURSE;
  const rect = stripRect('concrete');
  const P = (t: number, z: number, d: number): Vec3 => [
    b.origin[0] + b.dir[0] * t + o[0] * d,
    b.origin[1] + b.dir[1] * t + o[1] * d,
    z,
  ];
  const f = WALL_T / 2;
  const outer = [P(t0, z0, f - bev), P(t1, z0, f - bev), P(t1, z1, f - bev), P(t0, z1, f - bev)];
  const inner = [
    P(t0 + bev, z0 + bev, f),
    P(t1 - bev, z0 + bev, f),
    P(t1 - bev, z1 - bev, f),
    P(t0 + bev, z1 - bev, f),
  ];
  const tOf = [t0, t1, t1, t0, t0 + bev, t1 - bev, t1 - bev, t0 + bev];
  const zOf = [z0, z0, z1, z1, z0 + bev, z0 + bev, z1 - bev, z1 - bev];
  const all = [...outer, ...inner];
  const mb = new MeshBuilder();
  const quad = (ids: readonly number[]): void => {
    const [i0 = 0, i1 = 0, i2 = 0] = ids;
    const p0 = all[i0] ?? [0, 0, 0];
    const p1 = all[i1] ?? [0, 0, 0];
    const p2 = all[i2] ?? [0, 0, 0];
    const u: Vec3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const v: Vec3 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    let n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = dmath.hypot(n[0], n[1], n[2]) || 1;
    n = [n[0] / l, n[1] / l, n[2] / l];
    // Every face of the frustum looks out of the wall: flip the winding if this one does not.
    const flip = n[0] * o[0] + n[1] * o[1] < 0;
    if (flip) n = [-n[0], -n[1], -n[2]];
    const vs = ids.map((i) =>
      mb.vertex({
        p: all[i] ?? [0, 0, 0],
        n,
        uv: [
          rect.u0 + (((tOf[i] ?? 0) - t0) / rect.metres) * (rect.u1 - rect.u0),
          rect.v0 + (((zOf[i] ?? 0) - z0) / COURSE) * (rect.v1 - rect.v0),
        ],
        color,
      }),
    );
    const [w0 = 0, w1 = 0, w2 = 0, w3 = 0] = vs;
    if (flip) mb.quad(w0, w3, w2, w1);
    else mb.quad(w0, w1, w2, w3);
  };
  quad([4, 5, 6, 7]);
  quad([0, 1, 5, 4]);
  quad([1, 2, 6, 5]);
  quad([2, 3, 7, 6]);
  quad([3, 0, 4, 7]);
  return merge([shift(body), mb.build()]);
}

const has = (b: Bay, r: number, c: number): boolean => b.cells[r]?.[c] === true;

/** Is the cell holding position `t` along the bay present in row r? */
const at = (b: Bay, r: number, t: number): boolean =>
  t > 0 && t < b.len && has(b, r, Math.floor(t / (b.len / COLS)));

/** Every cell under t0..t1 present in row r (so a face against that row is buried). */
function covered(b: Bay, r: number, t0: number, t1: number): boolean {
  const w = b.len / COLS;
  for (let c = Math.floor(t0 / w + 1e-6); c < Math.ceil(t1 / w - 1e-6); c++)
    if (!has(b, r, c)) return false;
  return true;
}

/** LOD0: every block in running bond (odd rows offset half a block). */
function blocks(b: Bay, rng: Rng): Mesh[] {
  const w = b.len / COLS;
  const out: Mesh[] = [];
  const [start, end] = ends(b);
  const lay = (t0: number, t1: number, r: number): void => {
    // Dressed stone: every block its own value and warmth (±12%), one in ten from a darker bed.
    const k = rng.range(0.84, 1.08) * (rng.next() < 0.1 ? 0.8 : 1);
    const warm = rng.range(-0.05, 0.05);
    const omit: Face[] = [];
    // The bottom course sits on the plinth; any face against a neighbour is never seen.
    if (r === 0 || covered(b, r - 1, t0, t1)) omit.push('bottom');
    if (covered(b, r + 1, t0, t1) && r + 1 < b.cells.length) omit.push('top');
    if (at(b, r, t0 - 1e-3)) omit.push(start);
    if (at(b, r, t1 + 1e-3)) omit.push(end);
    const tone: Vec3 = [BONE[0] * k * (1 + warm), BONE[1] * k, BONE[2] * k * (1 - warm * 1.5)];
    out.push(dressed(b, t0, t1, r, tone, 0.035, omit));
  };
  b.cells.forEach((row, r) => {
    if (r % 2 === 0) {
      row.forEach((on, c) => {
        if (on) lay(c * w, (c + 1) * w, r);
      });
      return;
    }
    // Odd row: half block, then blocks straddling two cells, then half block.
    if (has(b, r, 0)) lay(0, w / 2, r);
    for (let c = 0; c < COLS - 1; c++)
      if (has(b, r, c) && has(b, r, c + 1)) lay((c + 0.5) * w, (c + 1.5) * w, r);
      else if (has(b, r, c)) lay((c + 0.5) * w, (c + 1) * w, r);
      else if (has(b, r, c + 1)) lay((c + 1) * w, (c + 1.5) * w, r);
    if (has(b, r, COLS - 1)) lay((COLS - 0.5) * w, COLS * w, r);
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
      out.push(block(b, c * w, (c + 1) * w, r0, r, BONE, 0, 'concrete'));
    }
  }
  return out;
}

/** Do the front/back wall cells at plan point `p` stand on every row r0..r1−1? */
function standing(list: readonly Bay[], p: Vec3, r0: number, r1: number): boolean {
  return list.some((b) => {
    if (b.dir[0] !== 0) return false;
    const [dx, dy] = [p[0] - b.origin[0], p[1] - b.origin[1]];
    const t = dx * b.dir[0] + dy * b.dir[1];
    const o = dx * b.out[0] + dy * b.out[1];
    if (Math.abs(o) > WALL_T / 2 || t < -1e-6 || t > b.len + 1e-6) return false;
    const c = Math.min(COLS - 1, Math.floor(t / (b.len / COLS)));
    for (let r = r0; r < r1; r++) if (!has(b, r, c)) return false;
    return true;
  });
}

/**
 * LOD2: each side's courses as runs of present cells (bays on one side are contiguous and equal),
 * paired into 1 m bands, every other band 9% darker: the coursing reads as value stripes on the
 * far mesh. Left out: inside faces under a roof (`roofed`; a roofless stage shows them from
 * above), tops under a standing course or a gable, and side-wall ends buried in a front or back
 * wall still standing on those rows.
 */
function courses(list: readonly Bay[], roofed: boolean): Mesh[] {
  const out: Mesh[] = [];
  const sides = new Map<string, Bay[]>();
  for (const b of list) {
    const side = b.id.split('_')[0] ?? b.id;
    sides.set(side, [...(sides.get(side) ?? []), b]);
  }
  for (const bays of sides.values()) {
    const first = bays[0];
    if (!first) continue;
    const w = first.len / COLS;
    const span: Bay = { ...first, len: first.len * bays.length };
    const cell = (r: number, i: number): boolean =>
      has(bays[Math.floor(i / COLS)] ?? first, r, i % COLS) && i < bays.length * COLS;
    // Under a roof the inside face is never seen at crowd distance; the outward face always is.
    const hidden: Face[] = roofed ? ['bottom', opposite(outward(first))] : ['bottom'];
    const side = first.dir[0] !== 0;
    const [start, end] = ends(first);
    const n = bays.length * COLS;
    /** Runs of i where `on(i)`, each laid as rows r0..r1. */
    const lay = (on: (i: number) => boolean, r0: number, r1: number, tone: Vec3): void => {
      let i = 0;
      while (i < n) {
        if (!on(i)) {
          i++;
          continue;
        }
        const i0 = i;
        while (i < n && on(i)) i++;
        let under = true;
        for (let j = i0; j < i; j++) under = under && cell(r1, j);
        // A run under a full course shows no top; nor does the eaves course of a gable end (front
        // and back) under a roof: the gable infill stands on it, full width.
        const gabled = roofed && !side && r1 === first.cells.length;
        const omit: Face[] = under || gabled ? [...hidden, 'top'] : [...hidden];
        // A side wall runs between the front and back walls: its ends are buried where they stand.
        const tip = (t: number): Vec3 => [
          span.origin[0] + span.dir[0] * t,
          span.origin[1] + span.dir[1] * t,
          0,
        ];
        if (side && i0 === 0 && standing(list, tip(-WALL_T / 2), r0, r1)) omit.push(start);
        if (side && i === n && standing(list, tip(n * w + WALL_T / 2), r0, r1)) omit.push(end);
        // The LOD0 blocks' strip: the far wall keeps their value instead of turning grey.
        out.push(block(span, i0 * w, i * w, r0, r1, tone, 0, 'concrete', omit));
      }
    };
    // Courses in pairs: a run standing in both rows is one box, so a wall knocked about by holes
    // does not double its runs; the pairs alternate 9% darker, 1 m value stripes.
    for (let r = 0; r < first.cells.length; r += 2) {
      const k = (r / 2) % 2 === 0 ? 1 : 0.91;
      const tone: Vec3 = [BONE[0] * k, BONE[1] * k, BONE[2] * k];
      const both = (i: number): boolean => cell(r, i) && cell(r + 1, i);
      lay(both, r, r + 2, tone);
      lay((i) => cell(r, i) && !both(i), r, r + 1, tone);
      lay((i) => cell(r + 1, i) && !both(i), r + 1, r + 2, tone);
    }
  }
  return out;
}

export interface WallMeshes {
  readonly walls: Mesh | null;
  readonly trim: Mesh | null;
  readonly frames: Mesh | null;
  readonly windows: Mesh | null;
  /**
   * Rain streaks fading down the face under each sill (LOD0). `weather()` leaves them alone (they
   * are already its streaks); the burn zones scorch them with the wall they hang on, so a burnt
   * wall never shows pale streaks over its soot.
   */
  readonly stains: Mesh | null;
  /** Window sill centres: where rain streaks start (weather fasteners). */
  readonly sills: readonly Vec3[];
}

/** A point `t` along bay b, `o` out from its centreline, at height z. */
const onBay = (b: Bay, t: number, o: number, z: number): Vec3 => [
  b.origin[0] + b.dir[0] * t + b.out[0] * o,
  b.origin[1] + b.dir[1] * t + b.out[1] * o,
  z,
];

/** A box on a bay's face: `along` × `out` × `h`, base centre at `p`. */
const faceBox = (
  b: Bay,
  p: Vec3,
  along: number,
  out: number,
  h: number,
  color: Vec3,
  omit: readonly Face[] = [],
): Mesh => box({ size: b.dir[0] !== 0 ? [along, out, h] : [out, along, h], at: p, color, omit });

/** Every face of a box on bay b except the one looking out of the wall. */
function allBut(b: Bay): Face[] {
  const keep: Face =
    b.out[0] > 0 ? 'front' : b.out[0] < 0 ? 'back' : b.out[1] > 0 ? 'left' : 'right';
  return (['top', 'bottom', 'front', 'back', 'left', 'right'] as const).filter((f) => f !== keep);
}

/** Window sill and head height. */
const WIN = { w: 0.8, z0: PLINTH + 4 * COURSE + 0.05, h: 1.2 } as const;

/** One framed window mid-bay: glow pane recessed behind stone jambs, head and sill. */
function window(b: Bay, lod: Lod): { frame: Mesh; pane: Mesh; sill: Vec3 } {
  const t = b.len / 2;
  const face = WALL_T / 2;
  // LOD2: the lit face alone (two triangles a window), the amber rhythm kept on the far mesh.
  const pane = faceBox(
    b,
    onBay(b, t, lod === 2 ? face - 0.025 : face, WIN.z0),
    WIN.w,
    0.06,
    WIN.h,
    GLOW,
    lod === 2 ? allBut(b) : [],
  );
  const parts: Mesh[] = [
    // Sill: proud of the face, wider than the opening (where the rain drips off).
    faceBox(b, onBay(b, t, face + 0.02, WIN.z0 - 0.12), WIN.w + 0.36, 0.2, 0.12, BONE_DARK),
    // Head (lintel) and the two jambs, 10 cm proud: the pane reads recessed.
    faceBox(b, onBay(b, t, face + 0.01, WIN.z0 + WIN.h), WIN.w + 0.28, 0.18, 0.2, BONE_DARK),
    ...(lod === 1 ? [] : [-1, 1]).map((s) =>
      faceBox(
        b,
        onBay(b, t + s * (WIN.w / 2 + 0.07), face + 0.01, WIN.z0),
        0.14,
        0.18,
        WIN.h,
        BONE_DARK,
      ),
    ),
  ];
  if (lod === 0)
    // Iron mullion cross: four lights.
    parts.push(
      faceBox(b, onBay(b, t, face + 0.02, WIN.z0), 0.05, 0.05, WIN.h, IRON),
      faceBox(b, onBay(b, t, face + 0.02, WIN.z0 + WIN.h * 0.55), WIN.w, 0.05, 0.05, IRON),
    );
  return {
    frame: merge(parts),
    pane,
    sill: onBay(b, t, face + 0.14, WIN.z0 - 0.12),
  };
}

/** Fresh lime mortar run down a face: paler and greyer than the stone. */
const MORTAR_WET: Vec3 = [0.86, 0.85, 0.8];

/** Grime at the top of a sill streak (lime wash and soot carried down by rain). */
const STREAK: Vec3 = [0.26, 0.24, 0.2];

/** The two front corners of the hall, where quoins replace the pilasters. */
export const CORNERS: readonly Vec3[] = [
  [HALF_X + WALL_T / 2, -(HALF_Y + WALL_T / 2), PLINTH],
  [HALF_X + WALL_T / 2, HALF_Y + WALL_T / 2, PLINTH],
];

const near = (p: Vec3, c: Vec3): boolean => dmath.hypot(p[0] - c[0], p[1] - c[1]) < 0.7;

/** Near a front corner (plan distance), where a quoin stack stands. */
const atCorner = (p: Vec3): boolean => CORNERS.some((c) => near(p, c));

/** Courses standing unbroken from the plinth in column `c` of bay b. */
function columnRows(b: Bay, c: number): number {
  let r = 0;
  while (has(b, r, c)) r++;
  return r;
}

/**
 * How many courses a quoin stack at `corner` takes: as tall as the shorter of the two walls meeting
 * there, measured on each wall's column at that corner, so damage at the other corner (or mid-bay)
 * never truncates it. 0 when no wall reaches the corner.
 */
export function quoinRows(list: readonly Bay[], corner: Vec3): number {
  const ends = list.flatMap((b) => [
    ...(near(onBay(b, 0, WALL_T / 2, 0), corner) ? [columnRows(b, 0)] : []),
    ...(near(onBay(b, b.len, WALL_T / 2, 0), corner) ? [columnRows(b, COLS - 1)] : []),
  ]);
  return ends.length ? Math.min(...ends) : 0;
}

/**
 * Quoins on a front corner, `rows` courses: dressed blocks alternately long on the front face and
 * long on the side face, 8 cm proud of both and a step lighter than the walling.
 */
function quoins(corner: Vec3, rows: number, rng: Rng): Mesh[] {
  const sy = Math.sign(corner[1]);
  const out: Mesh[] = [];
  for (let r = 0; r < rows; r++) {
    const longFront = r % 2 === 0;
    const ax = longFront ? 0.45 : 0.85;
    const ay = longFront ? 0.85 : 0.45;
    const k = rng.range(1.1, 1.2);
    out.push(
      box({
        size: [ax + 0.08, ay + 0.08, COURSE - 0.04],
        at: [
          corner[0] + 0.08 - (ax + 0.08) / 2,
          corner[1] - sy * (ay / 2 - 0.04),
          corner[2] + r * COURSE + 0.02,
        ],
        color: [Math.min(1, BONE[0] * k), Math.min(1, BONE[1] * k), Math.min(1, BONE[2] * k)],
        strip: 'concrete',
      }),
    );
  }
  return out;
}

/** The string course: a step darker than the walling, so the band reads at hero distance. */
const COURSE_TONE: Vec3 = [BONE_DARK[0] * 0.85, BONE_DARK[1] * 0.85, BONE_DARK[2] * 0.82];

/** String course at sill level: a 20 cm band 15 cm proud, run per standing column. */
function stringCourse(b: Bay): Mesh[] {
  const w = b.len / COLS;
  const out: Mesh[] = [];
  for (let c = 0; c < COLS; c++) {
    if (!(has(b, 3, c) && has(b, 4, c))) continue;
    const t0 = c * w;
    const t1 = (c + 1) * w;
    // Stop short of a corner quoin; run through the pilasters (they sit over it).
    const a = atCorner(onBay(b, t0, WALL_T / 2, 0)) ? t0 + 0.9 : t0;
    const z = atCorner(onBay(b, t1, WALL_T / 2, 0)) ? t1 - 0.9 : t1;
    if (z - a < 0.1) continue;
    out.push(
      faceBox(
        b,
        onBay(b, (a + z) / 2, WALL_T / 2 + 0.04, WIN.z0 - 0.32),
        z - a,
        0.22,
        0.2,
        COURSE_TONE,
        ['bottom'],
      ),
    );
  }
  return out;
}

/**
 * Walls, pilasters and windows for this LOD (the hall scorches them after restripping). `roofed`:
 * a roof closes the hall over the walls, so the far mesh may drop their inside faces. `dressed`
 * (a finished hall): quoins on the front corners and a string course at sill level (LOD0).
 */
export function walls(
  lod: Lod,
  list: readonly Bay[],
  rng: Rng,
  roofed: boolean,
  dressed = false,
  /** A wall going up: lime mortar slopped off the top course runs down the outer faces (LOD0). */
  mortar = false,
): WallMeshes {
  const ms =
    lod === 0
      ? list.flatMap((b) => blocks(b, rng))
      : lod === 1
        ? list.flatMap(columns)
        : courses(list, roofed);
  const trim: Mesh[] = [];
  const frames: Mesh[] = [];
  const glow: Mesh[] = [];
  const sills: Vec3[] = [];
  const stains: Mesh[] = [];
  const quoined = dressed && lod === 0;
  if (quoined) {
    const qr = rng.fork('quoins');
    for (const c of CORNERS) {
      const rows = quoinRows(list, c);
      if (rows > 0) trim.push(...quoins(c, rows, qr));
    }
    for (const b of list) trim.push(...stringCourse(b));
  }
  if (mortar && lod === 0) {
    const mr = rng.fork('mortar');
    for (const b of list) {
      const top = bayTop(b);
      if (top < 2) continue;
      for (let i = 0; i < 2; i++) {
        const t = b.len * mr.range(0.15, 0.85);
        // Only under a column standing to the top course.
        if (!has(b, top - 1, Math.min(COLS - 1, Math.floor(t / (b.len / COLS))))) continue;
        stains.push(
          streak(onBay(b, t, WALL_T / 2, PLINTH + top * COURSE - 0.02), b.dir, b.out, {
            w0: mr.range(0.14, 0.26),
            w1: 0.06,
            len: mr.range(0.6, 1.3),
            from: MORTAR_WET,
            to: [BONE[0] * 0.95, BONE[1] * 0.95, BONE[2] * 0.93],
          }),
        );
      }
    }
  }
  for (const b of list) {
    const top = bayTop(b);
    // Pilaster at the bay's start, as tall as the wall there (none inside the gate opening, none
    // where a corner's quoins stand).
    const start = onBay(b, 0, WALL_T / 2, PLINTH);
    if (
      lod < 2 &&
      top >= 2 &&
      !(b.door && Math.abs(start[1]) < GATE_HALF + 0.01) &&
      !(quoined && atCorner(start))
    ) {
      const size: Vec3 = b.dir[0] !== 0 ? [0.42, 0.36, top * COURSE] : [0.36, 0.42, top * COURSE];
      // Bevelled at LOD0 only: at LOD1 the chamfers are below a pixel.
      trim.push(pebble(lod === 0 ? 0 : 2, size, start, BONE_DARK));
    }
    // Window mid-bay where rows 4–6 stand.
    if (b.door || ![4, 5, 6].every((r) => b.cells[r]?.every(Boolean))) continue;
    const w = window(b, lod);
    glow.push(w.pane);
    if (lod < 2) {
      frames.push(w.frame);
      sills.push(w.sill);
    }
    if (lod === 0)
      // Three drips off each sill (the middle one longest), fading down the face.
      for (const [dt, w0, len] of [
        [-0.28, 0.16, 1.0],
        [0.02, 0.24, 1.55],
        [0.3, 0.14, 0.75],
      ] as const)
        stains.push(
          streak(
            onBay(b, b.len / 2 + dt, WALL_T / 2, WIN.z0 - (dressed ? 0.32 : 0.12)),
            b.dir,
            b.out,
            {
              w0,
              w1: w0 * 0.45,
              len,
              from: STREAK,
              to: [BONE[0] * 0.8, BONE[1] * 0.8, BONE[2] * 0.78],
            },
          ),
        );
  }
  return {
    walls: ms.length ? merge(ms) : null,
    trim: trim.length ? merge(trim) : null,
    frames: frames.length ? merge(frames) : null,
    windows: glow.length ? merge(glow) : null,
    stains: stains.length ? merge(stains) : null,
    sills,
  };
}

/** Hairline cracks running in from the broken corner: dark strips 3 mm proud of the slab top. */
function cracks(): Mesh {
  const x = HALF_X + PLINTH_OUT;
  const y = HALF_Y + PLINTH_OUT;
  const runs: [number, number][][] = [
    [
      [x - 1.3, -y + 0.9],
      [x - 2.6, -y + 2.1],
      [x - 3.1, -y + 3.9],
      [x - 4.6, -y + 4.6],
    ],
    [
      [x - 0.6, -y + 1.6],
      [x - 1.4, -y + 3.4],
      [x - 1.2, -y + 5.2],
    ],
  ];
  const out: Mesh[] = [];
  for (const run of runs)
    for (let i = 0; i + 1 < run.length; i++) {
      const a = run[i] ?? [0, 0];
      const c = run[i + 1] ?? [0, 0];
      const len = dmath.hypot(c[0] - a[0], c[1] - a[1]);
      const yaw = dmath.atan2(c[1] - a[1], c[0] - a[0]);
      out.push(
        placeYaw(
          box({ size: [len + 0.05, 0.05, 0.008], at: [0, 0, -0.005], color: SOOT }),
          [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, PLINTH],
          yaw,
        ),
      );
    }
  return merge(out);
}

/** The slate plinth the hall stands on (every stage); `broken` knocks its front corner off. */
export function plinth(lod: Lod, broken = false): Mesh {
  const size: Vec3 = [(HALF_X + PLINTH_OUT) * 2, (HALF_Y + PLINTH_OUT) * 2, PLINTH];
  const slab = broken
    ? prismPlan(BROKEN_PLINTH, PLINTH)
    : box({
        size,
        at: [0, 0, 0],
        color: SLATE,
        strip: 'stone',
        bevel: lod === 2 ? 0 : 0.06,
        omit: ['bottom'],
      });
  if (lod === 2) return slab;
  // Front steps up to the gate, each with a nosing lip that catches the light.
  const parts: Mesh[] = [slab];
  for (const i of [1, 2]) {
    const front = HALF_X + PLINTH_OUT + 0.4 * i;
    const h = PLINTH - i * 0.2;
    parts.push(box({ size: [0.4, 4.6, h], at: [front - 0.2, 0, 0], color: SLATE, strip: 'stone' }));
    if (lod === 0)
      parts.push(
        box({
          size: [0.07, 4.7, 0.05],
          at: [front - 0.015, 0, h - 0.04],
          color: BONE_DARK,
          bevel: 0.01,
        }),
      );
  }
  if (broken && lod === 0) parts.push(cracks());
  return merge(parts);
}

const placeYaw = (m: Mesh, p: Vec3, yaw: number): Mesh => place(m, { at: p, yaw });

/** A plan polygon extruded up `h` from z 0 (slate, stone strip). */
const prismPlan = (profile: readonly Vec2[], h: number): Mesh =>
  prism({ profile, depth: h, plane: 'xy', centred: false, color: SLATE, strip: 'stone' });
