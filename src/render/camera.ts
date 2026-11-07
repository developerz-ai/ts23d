// Perspective camera for beauty renders: orbit (azimuth/elevation about the asset), auto-framed so
// the asset fills the frame, with an optional zoomed sub-window (a true high-res crop of the same
// shot, used for detail close-ups). Z up, +X front; azimuth 0 looks at the front, −35° is a 3/4.

export interface PerspectiveCamera {
  readonly eye: readonly [number, number, number];
  /** Unit right, up, forward (view direction). */
  readonly r: readonly [number, number, number];
  readonly u: readonly [number, number, number];
  readonly f: readonly [number, number, number];
  /** Pixels per unit of tan(angle) — the focal length in pixels. */
  readonly focal: number;
  readonly cx: number;
  readonly cy: number;
  readonly width: number;
  readonly height: number;
}

export interface Orbit {
  readonly azDeg: number;
  readonly elDeg: number;
  readonly fovDeg: number;
  /** Fraction of the frame the asset may fill (0–1). */
  readonly fill: number;
}

type V3 = [number, number, number];

function basis(azDeg: number, elDeg: number): { dir: V3; r: V3; u: V3; f: V3 } {
  const az = (azDeg * Math.PI) / 180;
  const el = (elDeg * Math.PI) / 180;
  const dir: V3 = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
  const f: V3 = [-dir[0], -dir[1], -dir[2]];
  const rl = Math.hypot(f[1], f[0]) || 1;
  const r: V3 = [f[1] / rl, -f[0] / rl, 0];
  const u: V3 = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  return { dir, r, u, f };
}

/** Project world xyz → [screen x, screen y, view depth]. Depth ≤ 0 means behind the eye. */
export function project(c: PerspectiveCamera, x: number, y: number, z: number): V3 {
  const dx = x - c.eye[0];
  const dy = y - c.eye[1];
  const dz = z - c.eye[2];
  const w = dx * c.f[0] + dy * c.f[1] + dz * c.f[2];
  const sx = dx * c.r[0] + dy * c.r[1] + dz * c.r[2];
  const sy = dx * c.u[0] + dy * c.u[1] + dz * c.u[2];
  return [c.cx + (sx / w) * c.focal, c.cy - (sy / w) * c.focal, w];
}

/**
 * Orbit camera framing `points` (xyz triples, world) in a width × height image. Iterates a few
 * times: re-centre on the projected extent, then dolly so the larger axis fills `fill`.
 */
export function frameOrbit(
  points: Float32Array,
  o: Orbit,
  width: number,
  height: number,
): PerspectiveCamera {
  const { dir, r, u, f } = basis(o.azDeg, o.elDeg);
  const stride = Math.max(1, Math.floor(points.length / 3 / 20000)) * 3;
  let lo: V3 = [Infinity, Infinity, Infinity];
  let hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < points.length; i += 3)
    for (let k = 0; k < 3; k++) {
      const v = points[i + k] ?? 0;
      lo[k] = Math.min(lo[k] ?? 0, v);
      hi[k] = Math.max(hi[k] ?? 0, v);
    }
  if (points.length === 0) {
    lo = [-0.5, -0.5, -0.5];
    hi = [0.5, 0.5, 0.5];
  }
  const target: V3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  const radius = Math.max(Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2, 0.05);
  const tanY = Math.tan((o.fovDeg * Math.PI) / 360);
  const focal = height / 2 / tanY;
  let dist = radius / Math.sin(Math.atan(tanY)) + radius;
  const at = (d: number): PerspectiveCamera => ({
    eye: [target[0] + dir[0] * d, target[1] + dir[1] * d, target[2] + dir[2] * d],
    r,
    u,
    f,
    focal,
    cx: width / 2,
    cy: height / 2,
    width,
    height,
  });
  for (let iter = 0; iter < 6; iter++) {
    const cam = at(dist);
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < points.length; i += stride) {
      const p = project(cam, points[i] ?? 0, points[i + 1] ?? 0, points[i + 2] ?? 0);
      x0 = Math.min(x0, p[0]);
      x1 = Math.max(x1, p[0]);
      y0 = Math.min(y0, p[1]);
      y1 = Math.max(y1, p[1]);
    }
    if (!Number.isFinite(x0)) break;
    // Shift the target by the screen-space offset of the extent's centre, at the target's depth.
    const k = dist / focal;
    const ox = ((x0 + x1) / 2 - width / 2) * k;
    const oy = -((y0 + y1) / 2 - height / 2) * k;
    for (let a = 0; a < 3; a++) target[a] = (target[a] ?? 0) + (r[a] ?? 0) * ox + (u[a] ?? 0) * oy;
    const need = Math.max((x1 - x0) / (width * o.fill), (y1 - y0) / (height * o.fill));
    // Perspective: dolly on the part of the distance in front of the target, not through it.
    dist = Math.max(dist * need ** 0.85, radius * 1.05);
  }
  return at(dist);
}

/** The same shot through a zoomed window: (nx, ny) ∈ [0,1]² is the window centre, k the zoom. */
export function zoomWindow(
  c: PerspectiveCamera,
  nx: number,
  ny: number,
  k: number,
): PerspectiveCamera {
  return {
    ...c,
    focal: c.focal * k,
    cx: c.width / 2 - (nx * c.width - c.cx) * k,
    cy: c.height / 2 - (ny * c.height - c.cy) * k,
  };
}

/** Same camera at another resolution (supersampling): every pixel quantity scales by s. */
export function scaled(c: PerspectiveCamera, s: number): PerspectiveCamera {
  return {
    ...c,
    focal: c.focal * s,
    cx: c.cx * s,
    cy: c.cy * s,
    width: c.width * s,
    height: c.height * s,
  };
}
