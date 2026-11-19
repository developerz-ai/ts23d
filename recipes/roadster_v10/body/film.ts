// Dried road spatter: mud flecks where the tyres throw them and nowhere else: a fan behind each
// wheel and the grit the nose meets head on (scattered along the whole sill they read as noise). The lacquer under them is only
// darkened (a paint slot stores a tone); the flecks are what reads as dirt: matte, tan, proud of
// the clearcoat. Each fleck is one tilted shard: two corners sink into the skin, the third stands
// 3 mm off it, so it is seated on the panel, never floating over it. Flecks on the door
// ride with the door; the rest is one static part. LOD2 keeps the darkened lacquer only.

import type { Lod, Mesh, Rng, Vec3 } from '@developerz.ai/ts23d';
import { MeshBuilder, merge, stripRect } from '@developerz.ai/ts23d';
import { ARCH_F, ARCH_R, X_DOOR_FRONT, X_DOOR_REAR, X_FA, X_RA } from '../dims.ts';
import { add, bothSides, cross, mul, sub, unit } from '../lib/geo.ts';
import { normalAt, type Surface } from '../lib/grid.ts';
import { roadFilm } from '../lib/wear.ts';
import { GILLS, holeG, holeUc, X_TAIL_SHUT } from './panels.ts';
import { archU, cockpitU, GAP, uMetres } from './regions.ts';
import { sAtX, U } from './shape.ts';

/** Dried mud, light (dusty) to dark (still damp), linear RGB on the plain strip. */
const MUD: readonly Vec3[] = [
  [0.17, 0.135, 0.095],
  [0.12, 0.094, 0.066],
  [0.075, 0.058, 0.043],
];

export interface Film {
  /** Flecks on the fixed panels (both sides). */
  readonly shell: Mesh;
  /** Flecks on the left door, car frame, closed pose (the caller mirrors and hinges them). */
  readonly door: Mesh;
}

/**
 * One fleck at (s, u): a shard `size` metres across, turned by `turn` and stretched `streak`×
 * along the car, tilted so two corners sink 3 mm into the skin and the third stands 3 mm proud.
 */
function fleck(
  b: MeshBuilder,
  S: Surface,
  at: readonly [number, number],
  size: number,
  streak: number,
  turn: number,
  color: Vec3,
): void {
  const [s, u] = at;
  const c = S.row(s)(u);
  const n = normalAt(S, s, u);
  // Tangent frame on the skin: along the car and across it.
  let e1 = sub(S.row(s + 0.01)(u), c);
  e1 = unit(sub(e1, mul(n, e1[0] * n[0] + e1[1] * n[1] + e1[2] * n[2])));
  const e2 = cross(n, e1);
  const rect = stripRect('plain');
  const uv: [number, number] = [(rect.u0 + rect.u1) / 2, (rect.v0 + rect.v1) / 2];
  const ids = [0, 1, 2].map((k) => {
    const a = turn + (k * Math.PI * 2) / 3;
    const p = add(
      add(c, mul(e1, (size / 2) * streak * Math.cos(a))),
      add(mul(e2, (size / 2) * Math.sin(a)), mul(n, k === 0 ? 0.003 : -0.003)),
    );
    return b.vertex({ p, n, uv, color });
  });
  b.tri(ids[0] ?? 0, ids[1] ?? 0, ids[2] ?? 0);
}

/** Scatter flecks over the lower body by rejection sampling against the film density. */
export function roadSpatter(S: Surface, lod: Lod, rng: Rng): Film {
  const tries = [7000, 2000, 0][lod] ?? 0;
  const film = roadFilm(rng.fork('road_film'), 'spray');
  const pick = rng.fork('spatter');
  const shell = new MeshBuilder();
  const door = new MeshBuilder();
  const s0 = sAtX(-2.05, 7);
  const s1 = sAtX(1.75, 7);
  let onDoor = 0;
  let onShell = 0;
  for (let i = 0; i < tries; i++) {
    const s = pick.range(s0, s1);
    // Down to just above the rocker roll: under it the skin turns too tightly for a flat shard.
    const u = pick.range(U.creaseOut, U.rocker - 0.3);
    const keep = pick.next();
    const grain = pick.range(0.01, 0.03) * (lod === 0 ? 1 : 1.9);
    const turn = pick.range(0, Math.PI * 2);
    const tone = MUD[pick.int(0, MUD.length - 1)] ?? [0.2, 0.16, 0.11];
    const streak = pick.range(1, 2.2);
    // Thick spray dries in bigger clots: the fan reads as a patch near the wheel, specks at its rim.
    const density = film(S.row(s)(u));
    if (density <= 0) continue;
    const size = grain * (0.7 + 1.1 * density);
    // Keep clear of the arch openings, the shut lines and the cockpit cut.
    const arch = archU(S, s);
    if (arch !== null && u > arch - 0.25) continue;
    const m = uMetres(S, s, u);
    const edge = (size + GAP) / Math.max(m, 1e-3);
    if (Math.abs(u - U.lower) < edge) continue;
    const inDoor = s > X_DOOR_REAR && s < X_DOOR_FRONT && u < U.lower;
    if (inDoor && u < cockpitU(S, s, s) + edge) continue;
    const span = size * 1.2 + GAP;
    if ([X_DOOR_REAR, X_DOOR_FRONT, X_TAIL_SHUT].some((x) => Math.abs(s - x) < span)) continue;
    if (
      [X_FA - ARCH_F, X_FA + ARCH_F, X_RA - ARCH_R, X_RA + ARCH_R].some(
        (x) => Math.abs(s - x) < span,
      )
    )
      continue;
    // The gills are holes in the fender: nothing there for a fleck to sit on.
    if (GILLS.some((h) => Math.abs(u - holeUc(h, s)) < h.hu * holeG(h, s) + edge)) continue;
    if (keep > density) continue;
    fleck(inDoor ? door : shell, S, [s, u], size, streak, turn, tone);
    if (inDoor) onDoor++;
    else onShell++;
  }
  const left = onShell ? shell.build() : merge([]);
  return {
    shell: bothSides(left),
    door: onDoor ? door.build() : merge([]),
  };
}
