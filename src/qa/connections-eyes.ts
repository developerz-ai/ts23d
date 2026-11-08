// Eyes sit in sockets (`socket` default for eye / eyeball on character and creature kinds):
//   T3D_CONNECT_EYE_EXPOSED — under half the eyeball is enclosed by the head (inside it, or
//                             covered within an eye's width along its normal): it pops out
//   T3D_CONNECT_EYE_STARE   — the upper lid does not reach the iris: a white band shows above it
//   T3D_CONNECT_EYE_GAZE    — a pair does not look the same way: left and right are not mirror
//                             images (any kind); humanoids (character) must not diverge (wall-eyed)
// The pupil is the darkest colour on the eyeball (its centroid gives the gaze); the sclera is the
// eyeball's dominant colour, whatever it is (white, yellow, black).

import type { Vec3 } from '../core/index.ts';
import { type ConnectIssue, cm } from './connections-declare.ts';
import { cross, dot, norm, sub } from './connections-partner.ts';
import type { Shell } from './connections-shells.ts';
import { boxGap, probeOf } from './contact.ts';

/** Enclosed share an eyeball needs. */
const ENCLOSED = 0.5;
/** Visible sclera above the iris, as a share of the visible iris. */
const STARE = 0.15;

export interface Eye {
  readonly part: string;
  readonly centre: Vec3;
  readonly radius: number;
  /** Unit gaze (centre → pupil), or null when the eyeball has no darker pupil. */
  readonly gaze: Vec3 | null;
}

interface Tri {
  readonly p: Vec3;
  readonly n: Vec3;
  readonly w: number;
  readonly lum: number;
}

function trianglesOf(eye: readonly Shell[]): Tri[] {
  const out: Tri[] = [];
  for (const s of eye) {
    const P = s.mesh.positions;
    const C = s.mesh.colors;
    for (let o = 0; o < P.length; o += 9) {
      const v = (k: number): Vec3 => [P[o + k] ?? 0, P[o + k + 1] ?? 0, P[o + k + 2] ?? 0];
      const [a, b, c] = [v(0), v(3), v(6)];
      const x = cross(sub(b, a), sub(c, a));
      const w = Math.hypot(...x) / 2;
      if (w <= 0) continue;
      const lum = [0, 3, 6].reduce(
        (m, k) =>
          m +
          0.2126 * (C[o + k] ?? 0) +
          0.7152 * (C[o + k + 1] ?? 0) +
          0.0722 * (C[o + k + 2] ?? 0),
        0,
      );
      out.push({
        p: [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3],
        n: norm(x),
        w,
        lum: lum / 3,
      });
    }
  }
  return out;
}

const weighted = (ts: readonly Tri[]): Vec3 => {
  const W = ts.reduce((m, t) => m + t.w, 0) || 1;
  const sum = (k: 0 | 1 | 2): number => ts.reduce((m, t) => m + t.p[k] * t.w, 0) / W;
  return [sum(0), sum(1), sum(2)];
};

/** Checks one eye against the shell holding it; returns the eye for the pair check. */
export function eyeIssues(
  part: string,
  eye: readonly Shell[],
  head: Shell,
  shells: readonly Shell[],
): { eye: Eye; issues: ConnectIssue[] } {
  const tris = trianglesOf(eye);
  const centre = weighted(tris);
  const radius = tris.reduce((m, t) => Math.max(m, Math.hypot(...sub(t.p, centre))), 0);
  const lums = tris.map((t) => t.lum).sort((a, b) => a - b);
  const min = lums[0] ?? 0;
  const max = lums[lums.length - 1] ?? 0;
  const pupil = max - min > 0.1 ? tris.filter((t) => t.lum <= min + 0.03) : [];
  const gaze = pupil.length ? norm(sub(weighted(pupil), centre)) : null;
  const occluders = shells.filter(
    (s) => s.solid && !eye.includes(s) && boxGap(s, eye[0] ?? head) <= radius * 2,
  );
  const hit = (p: Vec3, dir: Vec3, reach: number): boolean => {
    for (let t = 0.001; t <= reach; t += Math.max(0.0005, radius / 12)) {
      const q: Vec3 = [p[0] + dir[0] * t, p[1] + dir[1] * t, p[2] + dir[2] * t];
      if (occluders.some((o) => probeOf(o).inside(q))) return true;
    }
    return false;
  };
  const issues: ConnectIssue[] = [];
  const total = tris.reduce((m, t) => m + t.w, 0);
  const hq = probeOf(head);
  let enclosed = 0;
  for (const t of tris)
    if (hq.inside(t.p) || hit(t.p, norm(sub(t.p, centre)), radius * 2)) enclosed += t.w;
  if (enclosed / total < ENCLOSED)
    issues.push({
      code: 'T3D_CONNECT_EYE_EXPOSED',
      severity: 'error',
      part,
      at: centre,
      radius: radius * 1.5,
      message: `'${part}' is only ${((enclosed / total) * 100).toFixed(0)}% enclosed by '${head.part}' — it sits on the face instead of in a socket (needs ≥ ${ENCLOSED * 100}%)`,
      fix: `push it back ≈ ${cm(radius * 0.5)} into the orbit of '${head.part}' (or deepen the socket) so lids and brow wrap it`,
    });
  if (gaze) {
    const dom = lums[lums.length >> 1] ?? 0;
    const sclera = (t: Tri): boolean => Math.abs(t.lum - dom) <= 0.08;
    const angle = (t: Tri): number =>
      Math.acos(Math.max(-1, Math.min(1, dot(norm(sub(t.p, centre)), gaze))));
    const iris = tris
      .filter((t) => !sclera(t) && angle(t) < Math.PI / 2)
      .map(angle)
      .sort((a, b) => a - b);
    const irisAngle = iris[Math.floor(iris.length * 0.9)] ?? 0;
    const up = norm(sub([0, 0, 1], [gaze[0] * gaze[2], gaze[1] * gaze[2], gaze[2] * gaze[2]]));
    let above = 0;
    let shown = 0;
    let top = 0;
    for (const t of tris) {
      const d = norm(sub(t.p, centre));
      if (dot(d, gaze) <= 0 || hq.inside(t.p) || hit(t.p, gaze, radius * 2)) continue;
      if (angle(t) <= irisAngle) shown += t.w;
      else if (sclera(t) && dot(d, up) > Math.sin(irisAngle)) {
        above += t.w;
        top = Math.max(top, (dot(d, up) - Math.sin(irisAngle)) * radius);
      }
    }
    if (shown > 0 && above / shown > STARE)
      issues.push({
        code: 'T3D_CONNECT_EYE_STARE',
        severity: 'error',
        part,
        at: [centre[0] + up[0] * radius, centre[1] + up[1] * radius, centre[2] + up[2] * radius],
        radius: radius,
        message: `'${part}': the upper lid stops above the iris — a band of sclera ${(100 * (above / shown)).toFixed(0)}% of the visible iris shows over it (staring)`,
        fix: `lower the upper lid of '${head.part}' by ≈ ${cm(top + radius * 0.05)} so it covers the top of the iris`,
      });
  }
  return { eye: { part, centre, radius, gaze }, issues };
}

/** Left/right pairs look the same way: mirror images; characters also must not diverge. */
export function gazeIssues(eyes: readonly Eye[], humanoid: boolean): ConnectIssue[] {
  const out: ConnectIssue[] = [];
  for (const l of eyes) {
    const r = eyes.find((e) => e.part === l.part.replace(/_l$/, '_r') && e !== l);
    if (!r || !/_l$/.test(l.part) || !l.gaze || !r.gaze) continue;
    const m = norm(sub(l.centre, r.centre));
    const k = 2 * dot(l.gaze, m);
    const mirror: Vec3 = [l.gaze[0] - k * m[0], l.gaze[1] - k * m[1], l.gaze[2] - k * m[2]];
    const off = (Math.acos(Math.max(-1, Math.min(1, dot(mirror, r.gaze)))) * 180) / Math.PI;
    const diverge = dot(sub(l.gaze, r.gaze), m);
    const wall = (Math.asin(Math.max(-1, Math.min(1, diverge / 2))) * 180) / Math.PI;
    const at: Vec3 = [
      (l.centre[0] + r.centre[0]) / 2,
      (l.centre[1] + r.centre[1]) / 2,
      (l.centre[2] + r.centre[2]) / 2,
    ];
    if (off > 6 || (humanoid && wall > 2))
      out.push({
        code: 'T3D_CONNECT_EYE_GAZE',
        severity: 'error',
        part: l.part,
        at,
        radius: Math.hypot(...sub(l.centre, r.centre)) / 2 + l.radius,
        message: `'${l.part}' and '${r.part}' look different ways: ${off.toFixed(0)}° off mirror-symmetric${humanoid && wall > 2 ? `, diverging ${wall.toFixed(0)}° (wall-eyed)` : ''}`,
        fix: 'aim both pupils at one point in front of the face (mirror the eye rotation across the centre plane)',
      });
  }
  return out;
}
