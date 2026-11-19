// Runs a track belt round its loop: every vertex of a `tread` part is bound once to the nearest
// point of the belt centre line (`extras.ts23d.tread.path`, node-local, Z up) as an offset in that
// point's frame (along, out, across), then re-posed at any distance travelled. Pure math, no three.
// The loop ruler is the library's (`BeltLoop`), the one the GLB's own tread morph targets are
// built on; this runtime belt is the exact alternative for a show that changes speed (the baked
// `run` clip moves the same belt at one speed in any glTF reader).

import { BeltLoop } from '@developerz.ai/ts23d';

type V3 = readonly [number, number, number];

/** The path wound so that +s is driving forward: the ground run moves back (−X) under the hull. */
function forward(path: readonly (readonly number[])[]): readonly (readonly number[])[] {
  const low = path.reduce((best, q, i) => ((q[2] ?? 0) < (path[best]?.[2] ?? 0) ? i : best), 0);
  const nx = path[(low + 1) % path.length] ?? path[low];
  const px = path[(low + path.length - 1) % path.length] ?? path[low];
  return nx && px && (nx[0] ?? 0) - (px[0] ?? 0) > 0 ? [...path].reverse() : path;
}

/** One tread mesh's vertices bound to its loop. `pose(d)` writes positions/normals at distance d. */
export class TreadBelt {
  private readonly loop: BeltLoop;
  private readonly s: Float64Array;
  private readonly off: Float64Array;
  private readonly nrm: Float64Array;
  private readonly f = new Float64Array(6);

  constructor(
    path: readonly (readonly number[])[],
    positions: ArrayLike<number>,
    normals: ArrayLike<number>,
  ) {
    const loop = new BeltLoop(forward(path));
    this.loop = loop;
    const count = Math.floor(positions.length / 3);
    this.s = new Float64Array(count);
    this.off = new Float64Array(count * 3);
    this.nrm = new Float64Array(count * 3);
    for (let v = 0; v < count; v++) {
      const q: V3 = [positions[v * 3] ?? 0, positions[v * 3 + 1] ?? 0, positions[v * 3 + 2] ?? 0];
      this.s[v] = loop.nearest(q);
      loop.frame(this.s[v] ?? 0, this.f);
      const r: V3 = [q[0] - (this.f[0] ?? 0), q[1] - (this.f[1] ?? 0), q[2] - (this.f[2] ?? 0)];
      const nv: V3 = [normals[v * 3] ?? 0, normals[v * 3 + 1] ?? 0, normals[v * 3 + 2] ?? 0];
      this.off.set(this.toFrame(r), v * 3);
      this.nrm.set(this.toFrame(nv), v * 3);
    }
  }

  /** Belt length: travelling this far brings every link back where it started. */
  get length(): number {
    return this.loop.length;
  }

  /** Vector → (along, out, across) in the frame currently in `this.f`. */
  private toFrame(r: V3): V3 {
    const t: V3 = [this.f[3] ?? 0, this.f[4] ?? 0, this.f[5] ?? 0];
    const b = this.loop.normal;
    const n = cross(b, t);
    return [dot(r, t), dot(r, n), dot(r, b)];
  }

  /** Pose for `d` metres driven forward (negative = reverse) into the given xyz arrays. */
  pose(d: number, positions: { [i: number]: number }, normals: { [i: number]: number }): void {
    const b = this.loop.normal;
    const f = this.f;
    for (let v = 0; v < this.s.length; v++) {
      this.loop.frame((this.s[v] ?? 0) + d, f);
      const t: V3 = [f[3] ?? 0, f[4] ?? 0, f[5] ?? 0];
      const n = cross(b, t);
      const u = this.off[v * 3] ?? 0;
      const o = this.off[v * 3 + 1] ?? 0;
      const w = this.off[v * 3 + 2] ?? 0;
      const nu = this.nrm[v * 3] ?? 0;
      const no = this.nrm[v * 3 + 1] ?? 0;
      const nw = this.nrm[v * 3 + 2] ?? 0;
      const x = v * 3;
      positions[x] = (f[0] ?? 0) + u * t[0] + o * n[0] + w * b[0];
      positions[x + 1] = (f[1] ?? 0) + u * t[1] + o * n[1] + w * b[1];
      positions[x + 2] = (f[2] ?? 0) + u * t[2] + o * n[2] + w * b[2];
      normals[x] = nu * t[0] + no * n[0] + nw * b[0];
      normals[x + 1] = nu * t[1] + no * n[1] + nw * b[1];
      normals[x + 2] = nu * t[2] + no * n[2] + nw * b[2];
    }
  }
}

const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
