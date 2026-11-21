// Orc tusks: the LOWER canines grown into tusks (a boar's or warthog's lower tusks, the orc
// convention in game art): rooted in the mandible behind the lower lip, leaving the mouth at the
// lower lip's top (the lip rolled round the base: features.ts `tuskLips`), rising in front of the
// upper lip and a little outward, the tip curling back toward the face at nose-wing height. Old
// yellowed ivory (../_lib/face/tusks.ts `ivoryTusk`): stained brown-black at the gum line, paling
// to a chipped tip; nicks from old fights on the front edge. The left tusk is broken off short
// (a jagged, stepped fracture); the whole right one faces the hero camera (front-right 3/4). One part,
// swept tapered tubes, placed from the skull's landmarks.

import { dmath, type Mesh, merge } from '@developerz.ai/ts23d';
import { spline, type V } from '../_lib/bust/kit.ts';
import { mix, tooth } from '../_lib/face/teeth.ts';
import { ivoryTusk } from '../_lib/face/tusks.ts';
import { C } from './palette.ts';
import { H, SK } from './spec.ts';

/** Root radius where the tusk leaves the gum. */
export const TUSK_R = 0.04 * H;

/** Share of the path where the tusk leaves the lower lip (the second waypoint of four). */
const GUM = 1 / 3;

/** The left tusk's waypoints: root deep in the mandible below the mouth corner's inner third,
 *  out through the lower lip's top at the mouth line, in front of the upper lip, the tip curled
 *  back toward the face at the nose wing's height. */
function tuskCtrl(): V[] {
  const li = SK.labraleInf;
  const ls = SK.labraleSup;
  const st = SK.stomion;
  const al = SK.alare;
  const cy = Math.abs(SK.cheilion[1]);
  const rise = al[2] - st[2];
  return [
    [li[0] - 0.16 * H, cy * 0.64, st[2] - 0.13 * H],
    [li[0] - 0.11 * H, cy * 0.68, st[2] - 0.005 * H],
    [ls[0] + 0.005 * H, cy * 0.86, st[2] + rise * 0.55],
    [ls[0] - 0.045 * H, Math.abs(al[1]) * 0.8, al[2] + 0.012 * H],
  ];
}

/** Where the tusk leaves the lower lip (the gum line its stain fades up from). */
export function tuskExit(): V {
  return tuskCtrl()[1] ?? SK.stomion;
}

/** Height where the tusk leaves the lower lip. */
export function gumLine(): number {
  return tuskExit()[2];
}

/** The left tusk's centre line, root → tip (`keep` < 1 snaps it off). */
export function tuskPath(keep = 1, n = 12): V[] {
  const full = spline(tuskCtrl(), 97);
  return Array.from({ length: n + 1 }, (_, i): V => {
    const f = (i / n) * keep * (full.length - 1);
    const k = Math.min(full.length - 2, Math.floor(f));
    const a = full[k] ?? SK.stomion;
    const b = full[k + 1] ?? a;
    const u = f - k;
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
  });
}

/** Both tusks as one mesh: the right whole (chipped tip, nicks), the left broken at 60 %; the
 *  lower teeth between them (LOD0–1). */
export function tusks(lod: number): Mesh {
  const seg = [14, 9, 6][lod] ?? 6;
  const n = [14, 8, 4][lod] ?? 4;
  const make = (side: 1 | -1, keep: number): Mesh => {
    const path = tuskPath(keep, n).map((p): V => [p[0], p[1] * side, p[2]]);
    const m = ivoryTusk(path, {
      radius: TUSK_R,
      gum: GUM,
      // The tusk's front leaves the lip's sleeve (features.ts `tuskLips`) about 1.4 cm past the gum share (measured in the hero).
      exit: 0.014,
      keep,
      seg,
      chip: lod === 0 && keep === 1,
      ivory: C.tusk,
      tip: C.tuskTip,
      stain: C.tuskRoot,
    });
    if (lod === 0) nick(m, path);
    return m;
  };
  const pair = [make(-1, 1), make(1, 0.6)];
  return merge(lod < 2 ? [...pair, ...lowerTeeth(lod).meshes] : pair);
}

/** Lower incisors between the tusks: [y as a share of the gap to the tusk, crown height above
 *  the mouth line m, lean rad (+: outward), radius m, stain 0–1]. Uneven, worn, one short. */
const TEETH: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [-0.95, 0.0085, -0.12, 0.0036, 0.35],
  [-0.6, 0.0108, 0.08, 0.004, 0.15],
  [-0.22, 0.0098, -0.05, 0.0042, 0.2],
  [0.15, 0.0114, 0.1, 0.0041, 0.1],
  [0.52, 0.0072, -0.06, 0.0039, 0.45],
  [0.88, 0.0101, 0.14, 0.0034, 0.3],
];

/** The orc's lower teeth: blunt yellowed pegs rooted in the lower lip between the tusks, their
 *  crowns standing over the lip's top in front of the upper lip (the underbite), so the closed
 *  mouth reads as a mouth; necks stained, crowns uneven (D526). `crowns`: each crown's top. */
export function lowerTeeth(lod = 0): { meshes: Mesh[]; crowns: V[] } {
  const st = SK.stomion;
  // Inside the tusks' flanks where they leave the lip.
  const half = Math.abs(tuskExit()[1]) - TUSK_R * 1.15;
  const meshes: Mesh[] = [];
  const crowns: V[] = [];
  for (const [share, height, lean, r, stain] of TEETH) {
    const y = share * half;
    // Between the lower lip's front and the upper lip's, following the arch back to the sides.
    const x = st[0] - 0.0015 - 0.38 * Math.abs(y);
    const root: V = [x - 0.001, y, st[2] - 0.006];
    const len = st[2] + height - root[2];
    const out = Math.sign(y) * dmath.sin(lean);
    const dir: V = [0.12, out, dmath.cos(lean)];
    const dl = dmath.hypot(dir[0], dir[1], dir[2]);
    const d: V = [dir[0] / dl, dir[1] / dl, dir[2] / dl];
    meshes.push(tooth(root, d, len, r, mix(C.tusk, C.tuskRoot, stain), lod === 0 ? 8 : 5, false));
    crowns.push([root[0] + d[0] * len, root[1] + d[1] * len, root[2] + d[2] * len]);
  }
  return { meshes, crowns };
}

/** Nicks: [share of the path, depth m, radius m] — chips knocked out of the ivory in old fights,
 *  each a shallow dent on the tusk's front edge, dirt-dark in its floor. */
const NICKS: ReadonlyArray<readonly [number, number, number]> = [
  [0.48, 0.0022, 0.007],
  [0.62, 0.0016, 0.005],
  [0.76, 0.0026, 0.008],
];

/** Press the nicks into a tusk swept along `path`: vertices within a nick's radius of its point on
 *  the tusk's front (+X) face sink toward the axis and darken. */
function nick(m: Mesh, path: readonly V[]): void {
  const { colors, positions } = m;
  for (const [t, depth, radius] of NICKS) {
    const c = path[Math.min(path.length - 1, Math.round(t * (path.length - 1)))];
    if (!c) continue;
    const at: V = [c[0] + TUSK_R * 0.8 * (1 - dmath.pow(t, 1.5)), c[1], c[2]];
    for (let v = 0; v < positions.length; v += 3) {
      const p: V = [positions[v] ?? 0, positions[v + 1] ?? 0, positions[v + 2] ?? 0];
      const d = dmath.hypot(p[0] - at[0], p[1] - at[1], p[2] - at[2]);
      if (d >= radius) continue;
      const k = dmath.pow(1 - d / radius, 2);
      const axis = dmath.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) || 1;
      for (let a = 0; a < 3; a++) {
        positions[v + a] = (p[a] ?? 0) - (((p[a] ?? 0) - (c[a] ?? 0)) / axis) * depth * k;
        colors[v + a] =
          (colors[v + a] ?? 0) + ((C.tuskRoot[a] ?? 0) * 0.7 - (colors[v + a] ?? 0)) * k;
      }
    }
  }
}
