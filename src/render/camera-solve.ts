// Camera solve for photo match: recover the camera that took a reference photo from ≥ 4 marked
// 2D↔3D correspondences. Model: eye, yaw, pitch, focal (no roll, principal point at the image
// centre — a level photo, uncropped). Seeds: a normalised DLT (≥ 6 marks) plus a fixed orbit grid;
// each seed is refined by Levenberg–Marquardt on reprojection error and the best one wins.
// Deterministic: fixed seeds and iteration order, no randomness.

import { Ts23dError, type Vec3 } from '../core/index.ts';
import { type PerspectiveCamera, project } from './camera.ts';
import { smallestEigenvector, solveLinear } from './camera-linalg.ts';

export interface PhotoCamera {
  /** Camera position and look-at target in asset space (metres, Z up). */
  readonly eye: Vec3;
  readonly target: Vec3;
  /** Vertical field of view, degrees. */
  readonly fovDeg: number;
}

/** One correspondence: a pixel in the photo (x right, y down) and the asset-space point it shows. */
export interface Mark {
  readonly px: readonly [number, number];
  readonly world: Vec3;
}

export interface CameraSolve {
  readonly camera: PhotoCamera;
  /** Root-mean-square reprojection error, pixels. */
  readonly rmsPx: number;
}

type V3 = [number, number, number];
const crossV = (a: readonly number[], b: readonly number[]): V3 => [
  (a[1] ?? 0) * (b[2] ?? 0) - (a[2] ?? 0) * (b[1] ?? 0),
  (a[2] ?? 0) * (b[0] ?? 0) - (a[0] ?? 0) * (b[2] ?? 0),
  (a[0] ?? 0) * (b[1] ?? 0) - (a[1] ?? 0) * (b[0] ?? 0),
];
const unit = (v: readonly number[]): V3 => {
  const l = Math.hypot(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0) || 1;
  return [(v[0] ?? 0) / l, (v[1] ?? 0) / l, (v[2] ?? 0) / l];
};

/** The renderable camera for a photo camera at width × height. */
export function perspectiveOf(c: PhotoCamera, width: number, height: number): PerspectiveCamera {
  const f = unit([c.target[0] - c.eye[0], c.target[1] - c.eye[1], c.target[2] - c.eye[2]]);
  const side = crossV(f, [0, 0, 1]);
  const r = Math.hypot(...side) < 1e-9 ? ([0, -1, 0] as V3) : unit(side);
  return {
    eye: [c.eye[0], c.eye[1], c.eye[2]],
    r,
    u: crossV(r, f),
    f,
    focal: height / 2 / Math.tan((c.fovDeg * Math.PI) / 360),
    cx: width / 2,
    cy: height / 2,
    width,
    height,
  };
}

/** Camera centre from a normalised DLT (≥ 6 marks), or null when degenerate. */
export function dltCentre(marks: readonly Mark[]): V3 | null {
  const n = marks.length;
  const c2 = [0, 1].map((k) => marks.reduce((s, m) => s + (m.px[k] ?? 0), 0) / n);
  const c3 = [0, 1, 2].map((k) => marks.reduce((s, m) => s + (m.world[k] ?? 0), 0) / n);
  const s2 =
    Math.SQRT2 /
    (marks.reduce((s, m) => s + Math.hypot(m.px[0] - (c2[0] ?? 0), m.px[1] - (c2[1] ?? 0)), 0) /
      n || 1);
  const s3 =
    Math.sqrt(3) /
    (marks.reduce((s, m) => s + Math.hypot(...m.world.map((v, k) => v - (c3[k] ?? 0))), 0) / n ||
      1);
  const S = Array.from({ length: 12 }, () => new Array<number>(12).fill(0));
  for (const m of marks) {
    const X = [...m.world.map((v, k) => (v - (c3[k] ?? 0)) * s3), 1];
    const [u, w] = [(m.px[0] - (c2[0] ?? 0)) * s2, (m.px[1] - (c2[1] ?? 0)) * s2];
    const rows = [
      [...X, 0, 0, 0, 0, ...X.map((x) => -u * x)],
      [0, 0, 0, 0, ...X, ...X.map((x) => -w * x)],
    ];
    for (const r of rows)
      for (let i = 0; i < 12; i++)
        for (let j = 0; j < 12; j++) {
          const row = S[i];
          if (row) row[j] = (row[j] ?? 0) + (r[i] ?? 0) * (r[j] ?? 0);
        }
  }
  const p = smallestEigenvector(S);
  const M = [0, 1, 2].map((i) => [p[i * 4] ?? 0, p[i * 4 + 1] ?? 0, p[i * 4 + 2] ?? 0]);
  const C = solveLinear(
    M,
    [0, 1, 2].map((i) => -(p[i * 4 + 3] ?? 0)),
  );
  if (!C?.every(Number.isFinite)) return null;
  return [0, 1, 2].map((k) => (c3[k] ?? 0) + (C[k] ?? 0) / s3) as V3;
}

const dirOf = (az: number, el: number): V3 => [
  Math.cos(el) * Math.cos(az),
  Math.cos(el) * Math.sin(az),
  Math.sin(el),
];
const raw = (p: readonly number[], w: number, h: number): PerspectiveCamera => {
  const eye: V3 = [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0];
  const f = dirOf(p[3] ?? 0, p[4] ?? 0);
  const cam = perspectiveOf(
    { eye, target: [eye[0] + f[0], eye[1] + f[1], eye[2] + f[2]], fovDeg: 40 },
    w,
    h,
  );
  return { ...cam, focal: Math.exp(p[5] ?? 0) };
};

function residuals(p: readonly number[], marks: readonly Mark[], w: number, h: number): number[] {
  const cam = raw(p, w, h);
  return marks.flatMap((m) => {
    const [x, y, depth] = project(cam, m.world[0], m.world[1], m.world[2]);
    return depth <= 1e-6 ? [1e4, 1e4] : [x - m.px[0], y - m.px[1]];
  });
}
const cost = (r: readonly number[]): number => r.reduce((s, v) => s + v * v, 0);

/** Levenberg–Marquardt on [eye xyz, yaw, pitch, ln focal]. */
function refine(
  p0: number[],
  marks: readonly Mark[],
  w: number,
  h: number,
): { p: number[]; e: number } {
  let p = p0;
  let r = residuals(p, marks, w, h);
  let e = cost(r);
  let lambda = 1e-3;
  for (let iter = 0; iter < 200 && lambda < 1e12; iter++) {
    const J = p.map((v, k) => {
      const d = 1e-6 * Math.max(1, Math.abs(v));
      const q = [...p];
      q[k] = v + d;
      return residuals(q, marks, w, h).map((x, i) => (x - (r[i] ?? 0)) / d);
    });
    const A = J.map((a) => J.map((b) => a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0)));
    const g = J.map((a) => a.reduce((s, x, i) => s + x * (r[i] ?? 0), 0));
    const damped = A.map((row, i) => row.map((x, j) => (i === j ? x * (1 + lambda) + 1e-12 : x)));
    const step = solveLinear(
      damped,
      g.map((x) => -x),
    );
    const q = step ? p.map((v, k) => v + (step[k] ?? 0)) : p;
    const rq = residuals(q, marks, w, h);
    const eq = cost(rq);
    if (step && eq < e) {
      const done = e - eq < 1e-14 * (1 + e);
      [p, r, e, lambda] = [q, rq, eq, Math.max(lambda / 10, 1e-12)];
      if (done) break;
    } else lambda *= 10;
  }
  return { p, e };
}

/** Least-squares focal for a fixed pose: offsets from the centre ≈ focal × (x/w, y/w). */
function focalFor(p: number[], marks: readonly Mark[], w: number, h: number): number {
  const cam = raw([...p.slice(0, 5), 0], w, h);
  let [num, den] = [0, 0];
  for (const m of marks) {
    const [x, y, d] = project(cam, m.world[0], m.world[1], m.world[2]);
    if (d <= 1e-6) continue;
    const [sx, sy] = [x - cam.cx, y - cam.cy];
    num += sx * (m.px[0] - w / 2) + sy * (m.px[1] - h / 2);
    den += sx * sx + sy * sy;
  }
  return den > 0 && num > 0 ? num / den : h;
}

/** Solve the photo's camera from ≥ 4 marks (more, and spread out, is better). */
export function solveCamera(marks: readonly Mark[], width: number, height: number): CameraSolve {
  const fail = (cause: string): never => {
    throw new Ts23dError('T3D_RENDER_OPTIONS', {
      cause: `camera solve: ${cause}`,
      fix: 'mark ≥ 4 well-spread, non-coplanar points (nose tip, ear tips, paws, tail root) in pixels and asset metres',
    });
  };
  if (marks.length < 4) fail(`${marks.length} marks, need ≥ 4`);
  if (!marks.every((m) => [...m.px, ...m.world].every(Number.isFinite)))
    fail('a mark is not finite');
  if (!(width > 0 && height > 0)) fail(`image ${width}×${height}`);
  const n = marks.length;
  const c: V3 = [0, 1, 2].map((k) => marks.reduce((s, m) => s + (m.world[k] ?? 0), 0) / n) as V3;
  const radius = Math.max(
    ...marks.map((m) => Math.hypot(...m.world.map((v, k) => v - (c[k] ?? 0)))),
  );
  if (!(radius > 1e-9)) fail('all marks sit on one 3D point');
  const seeds: number[][] = [];
  const seed = (eye: V3, f: V3): void => {
    const p = [...eye, Math.atan2(f[1], f[0]), Math.asin(Math.max(-1, Math.min(1, f[2])))];
    seeds.push([...p, Math.log(focalFor(p, marks, width, height))]);
  };
  const centre = n >= 6 ? dltCentre(marks) : null;
  if (centre) seed(centre, unit([c[0] - centre[0], c[1] - centre[1], c[2] - centre[2]]));
  const d = (radius / Math.tan((20 * Math.PI) / 180)) * 1.6;
  for (let az = 0; az < 360; az += 30)
    for (const el of [-10, 15, 45, 80]) {
      const dir = dirOf((az * Math.PI) / 180, (el * Math.PI) / 180);
      seed([c[0] + dir[0] * d, c[1] + dir[1] * d, c[2] + dir[2] * d], [-dir[0], -dir[1], -dir[2]]);
    }
  let best = { p: seeds[0] ?? [], e: Infinity };
  for (const s of seeds) {
    const r = refine(s, marks, width, height);
    if (r.e < best.e) best = r;
  }
  const cam = raw(best.p, width, height);
  const along = Math.max(
    1e-3,
    (c[0] - cam.eye[0]) * cam.f[0] +
      (c[1] - cam.eye[1]) * cam.f[1] +
      (c[2] - cam.eye[2]) * cam.f[2],
  );
  return {
    camera: {
      eye: cam.eye,
      target: [
        cam.eye[0] + cam.f[0] * along,
        cam.eye[1] + cam.f[1] * along,
        cam.eye[2] + cam.f[2] * along,
      ],
      fovDeg: (2 * Math.atan(height / 2 / cam.focal) * 180) / Math.PI,
    },
    rmsPx: Math.sqrt(best.e / (2 * n)),
  };
}
