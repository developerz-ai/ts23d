// Running-bond layout shared by bricks, stone, planks, slates and plates: horizontal courses
// (rows along V) split into tiles by vertical joints, staggered per course and periodic along U.
// Per-course column tables are filled once per course, so the per-pixel loop only reads arrays.

import { createRng } from '../../core/index.ts';
import type { Canvas } from './canvas.ts';

export interface CourseSpec {
  /** Course height, metres (along V). */
  readonly course: number;
  /** Mean tile length, metres (along U). */
  readonly length: number;
  /** 0 = regular; 0.5 = sizes vary ±25 %. */
  readonly irregular: number;
  /** Fraction of a tile each odd course shifts; random offsets when irregular. */
  readonly stagger: number;
  readonly seed: number;
}

export class Courses {
  /** Tile index within the current course, per column. */
  readonly id: Int32Array;
  /** Distance to the nearest vertical joint, metres, per column. */
  readonly dx: Float32Array;
  /** Distance from the tile's left joint, metres, per column. */
  readonly ux: Float32Array;
  /** The current course: index and its bottom / top in metres. */
  index = -1;
  y0 = 0;
  y1 = 0;
  private readonly bounds: number[] = [0];
  private readonly c: Canvas;
  private readonly spec: CourseSpec;

  constructor(c: Canvas, spec: CourseSpec) {
    this.c = c;
    this.spec = spec;
    this.id = new Int32Array(c.w);
    this.dx = new Float32Array(c.w);
    this.ux = new Float32Array(c.w);
    const rng = createRng(spec.seed).fork('rows');
    let y = 0;
    while (y < c.metresV) {
      y += spec.course * (1 + spec.irregular * (rng.next() - 0.5));
      this.bounds.push(y);
    }
  }

  /** Point the tables at the course containing metres `ym`; returns the course index. */
  at(ym: number): number {
    if (this.index >= 0 && ym >= this.y0 && ym < this.y1) return this.index;
    let k = 0;
    while (k < this.bounds.length - 2 && ym >= (this.bounds[k + 1] ?? 0)) k++;
    this.index = k;
    this.y0 = this.bounds[k] ?? 0;
    this.y1 = this.bounds[k + 1] ?? this.c.metresV;
    this.fill(k);
    return k;
  }

  private fill(k: number): void {
    const { w, metresU } = this.c;
    const s = this.spec;
    const rng = createRng(s.seed).fork(`course${k}`);
    const n = Math.max(1, Math.round(metresU / s.length));
    const lens: number[] = [];
    for (let i = 0; i < n; i++) lens.push(1 + s.irregular * (rng.next() - 0.5));
    const total = lens.reduce((a, b) => a + b, 0);
    const joints = [0];
    for (const l of lens) joints.push((joints[joints.length - 1] ?? 0) + (l / total) * metresU);
    const shift = s.irregular > 0 ? rng.next() * metresU : (k % 2) * s.stagger * (metresU / n);
    const px = metresU / w;
    for (let x = 0; x < w; x++) {
      let u = ((x + 0.5) * px - shift) % metresU;
      if (u < 0) u += metresU;
      let t = 0;
      while (t < n - 1 && u >= (joints[t + 1] ?? metresU)) t++;
      const a = joints[t] ?? 0;
      const b = joints[t + 1] ?? metresU;
      this.id[x] = t;
      this.ux[x] = u - a;
      this.dx[x] = Math.min(u - a, b - u);
    }
  }
}
