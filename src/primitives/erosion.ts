// Hydraulic droplet erosion (Beyer 2015, "Implementation of a method for hydraulic erosion"; the
// Lague variant): thousands of droplets start at random points (from the Rng), roll downhill with
// inertia, pick up sediment while fast and on steep ground, drop it where they slow or climb, and
// evaporate. Gullies, carved valleys, alluvial fans and sharp ridges appear: the look of World
// Machine / Gaea terrain. Heights are normalised to 0..1 while simulating, so the defaults behave
// the same on any relief; the result is rescaled to metres. Also records flow and deposit maps.

import type { Rng } from '../core/index.ts';
import { count } from './check.ts';
import { arrayMemo } from './erosion-memo.ts';
import type { TerrainGrid } from './terrain-grid.ts';

export interface ErosionOptions {
  /** Droplets simulated. ~1 per grid point is mild, 2–3 is strongly carved. Default 70 000. */
  readonly droplets?: number;
  /** Steps a droplet lives. Default 30. */
  readonly lifetime?: number;
  /** 0 = droplets follow the gradient exactly, 1 = they never turn. Default 0.05. */
  readonly inertia?: number;
  /** Sediment a droplet can carry per unit of speed × water × drop. Default 4. */
  readonly capacity?: number;
  readonly minCapacity?: number;
  /** Share of spare capacity eroded per step. Default 0.3. */
  readonly erode?: number;
  /** Share of surplus sediment deposited per step. Default 0.3. */
  readonly deposit?: number;
  readonly evaporate?: number;
  readonly gravity?: number;
  /** Erosion brush radius in grid cells (wider = smoother gullies). Default 3. */
  readonly radius?: number;
}

const put = (h: Float64Array, dep: Float64Array, k: number, a: number): void => {
  h[k] = (h[k] ?? 0) + a;
  dep[k] = (dep[k] ?? 0) + a;
};

interface Sim {
  readonly h: Float64Array;
  readonly flow: Float64Array;
  readonly dep: Float64Array;
  readonly nx: number;
  readonly ny: number;
  readonly inertia: number;
  readonly capK: number;
  readonly minCap: number;
  readonly erodeK: number;
  readonly depositK: number;
  readonly evap: number;
  readonly gravity: number;
  readonly life: number;
}

interface Brush {
  readonly dx: Int32Array;
  readonly dy: Int32Array;
  readonly w: Float64Array;
}

/** Cell offsets within the radius, weights falling off linearly, summing to 1. */
function makeBrush(radius: number): Brush {
  const dx: number[] = [];
  const dy: number[] = [];
  const w: number[] = [];
  for (let y = -radius; y <= radius; y++)
    for (let x = -radius; x <= radius; x++) {
      const d = Math.sqrt(x * x + y * y);
      if (d < radius) {
        dx.push(x);
        dy.push(y);
        w.push(radius - d);
      }
    }
  const sum = w.reduce((s, v) => s + v, 0);
  return {
    dx: Int32Array.from(dx),
    dy: Int32Array.from(dy),
    w: Float64Array.from(w, (v) => v / sum),
  };
}

/** One droplet's life. Module-level with scalar locals: no closures for the JIT to trip on. */
function droplet(s: Sim, b: Brush, x0: number, y0: number): void {
  const { h, nx, ny } = s;
  let x = x0;
  let y = y0;
  let dx = 0;
  let dy = 0;
  let speed = 1;
  let water = 1;
  let sediment = 0;
  for (let step = 0; step < s.life; step++) {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const u = x - i;
    const v = y - j;
    const k = j * nx + i;
    const a = h[k] ?? 0;
    const bb = h[k + 1] ?? 0;
    const c = h[k + nx] ?? 0;
    const d = h[k + nx + 1] ?? 0;
    const height = a * (1 - u) * (1 - v) + bb * u * (1 - v) + c * (1 - u) * v + d * u * v;
    const gx = (bb - a) * (1 - v) + (d - c) * v;
    const gy = (c - a) * (1 - u) + (d - bb) * u;
    dx = dx * s.inertia - gx * (1 - s.inertia);
    dy = dy * s.inertia - gy * (1 - s.inertia);
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;
    dx /= len;
    dy /= len;
    x += dx;
    y += dy;
    s.flow[k] = (s.flow[k] ?? 0) + water;
    if (x < 0 || y < 0 || x >= nx - 1 || y >= ny - 1) return;
    const dh = bilinear(h, nx, x, y) - height;
    const cap = Math.max(-dh * speed * water * s.capK, s.minCap);
    if (sediment > cap || dh > 0) {
      // Fill the pit we climbed out of, or drop the surplus: split over the 4 corners.
      const amount = dh > 0 ? Math.min(dh, sediment) : (sediment - cap) * s.depositK;
      sediment -= amount;
      put(h, s.dep, k, amount * (1 - u) * (1 - v));
      put(h, s.dep, k + 1, amount * u * (1 - v));
      put(h, s.dep, k + nx, amount * (1 - u) * v);
      put(h, s.dep, k + nx + 1, amount * u * v);
    } else {
      const amount = Math.min((cap - sediment) * s.erodeK, -dh);
      for (let n = 0; n < b.w.length; n++) {
        const ci = i + (b.dx[n] ?? 0);
        const cj = j + (b.dy[n] ?? 0);
        if (ci < 0 || cj < 0 || ci >= nx || cj >= ny) continue;
        const cell = cj * nx + ci;
        const take = Math.min(h[cell] ?? 0, amount * (b.w[n] ?? 0));
        h[cell] = (h[cell] ?? 0) - take;
        sediment += take;
      }
    }
    speed = Math.sqrt(Math.max(0, speed * speed - dh * s.gravity));
    water *= 1 - s.evap;
  }
}

function bilinear(h: Float64Array, nx: number, x: number, y: number): number {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const u = x - i;
  const v = y - j;
  const k = j * nx + i;
  const a = h[k] ?? 0;
  const b = h[k + 1] ?? 0;
  const c = h[k + nx] ?? 0;
  const d = h[k + nx + 1] ?? 0;
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

// LOD0/1/2 erode the same grid with the same droplets: simulate once per process.
const memo = arrayMemo();

export function hydraulicErosion(g: TerrainGrid, rng: Rng, o: ErosionOptions = {}): TerrainGrid {
  const drops = count('erosion droplets', o.droplets ?? 70000, 0, 10_000_000);
  const life = count('erosion lifetime', o.lifetime ?? 30, 1, 1000);
  const radius = count('erosion radius', o.radius ?? 3, 1, 32);
  const { nx, ny } = g;
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const v of g.z) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const relief = hi - lo || 1;
  const inertia = o.inertia ?? 0.05;
  const capK = o.capacity ?? 4;
  const minCap = o.minCapacity ?? 0.01;
  const erodeK = o.erode ?? 0.3;
  const depositK = o.deposit ?? 0.3;
  const evap = o.evaporate ?? 0.01;
  const gravity = o.gravity ?? 4;
  // Draw every start first (same order as one droplet at a time), so a memo hit leaves the Rng
  // exactly where a full run would.
  const starts = new Float64Array(drops * 2);
  for (let n = 0; n < drops; n++) {
    starts[n * 2] = rng.next() * (nx - 2);
    starts[n * 2 + 1] = rng.next() * (ny - 2);
  }
  const scalars = [nx, ny, ...g.rect, life, radius, inertia, capK, minCap, erodeK, depositK];
  const [h, flow, dep] = memo(
    { scalars: [...scalars, evap, gravity], arrays: [g.z, starts] },
    () => {
      const h = Float64Array.from(g.z, (v) => (v - lo) / relief);
      const flow = new Float64Array(h.length);
      const dep = new Float64Array(h.length);
      const sim: Sim = {
        ...{ h, flow, dep, nx, ny, life, inertia, capK, minCap, erodeK, depositK, evap, gravity },
      };
      const brush = makeBrush(radius);
      for (let n = 0; n < drops; n++)
        droplet(sim, brush, starts[n * 2] ?? 0, starts[n * 2 + 1] ?? 0);
      return [h, flow, dep];
    },
  );
  if (!h || !flow || !dep) return g;
  const norm = (m: Float64Array): Float64Array => {
    let top = 0;
    for (const v of m) top = Math.max(top, v);
    // Square-root compresses the long tail: a few rivers carry most water.
    return top > 0 ? m.map((v) => Math.sqrt(v / top)) : m;
  };
  return { ...g, z: h.map((v) => lo + v * relief), flow: norm(flow), deposit: norm(dep) };
}
