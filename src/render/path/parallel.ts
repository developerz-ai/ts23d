// Tiles on worker threads: the world's arrays and the film move into SharedArrayBuffers once,
// each worker rebuilds the BVH and claims tiles from a shared atomic counter until none are left.
// Every pixel owns its seed and its film slot, so the result is byte-identical to the sequential
// loop whatever the thread count or claim order. Without a global Worker (Node), runs in-line.

import { Ts23dError } from '../../core/index.ts';
import type { PerspectiveCamera } from '../camera.ts';
import type { Mip, SheetTextures } from '../texture.ts';
import type { Mip8 } from '../texture-sets.ts';
import { type Film, renderTile, tileCount } from './film.ts';
import type { TraceParams } from './integrator.ts';
import { assemble, type WorldData } from './world.ts';

/** What a worker receives. */
export interface TileJob {
  readonly data: WorldData;
  readonly cam: PerspectiveCamera;
  readonly film: Film;
  readonly spp: number;
  readonly params: TraceParams;
  readonly salt: number;
  /** [next tile to claim]. */
  readonly counter: Int32Array;
}

type Typed = Float32Array | Uint32Array | Uint8Array | Int32Array;

function shared<T extends Typed>(a: T, make: (b: SharedArrayBuffer) => T): T {
  const out = make(new SharedArrayBuffer(Math.max(4, a.byteLength)));
  out.set(a);
  return out;
}

const f32 = (a: Float32Array): Float32Array => shared(a, (b) => new Float32Array(b, 0, a.length));
const u32 = (a: Uint32Array): Uint32Array => shared(a, (b) => new Uint32Array(b, 0, a.length));
const u8 = (a: Uint8Array): Uint8Array => shared(a, (b) => new Uint8Array(b, 0, a.length));
const mips8 = (m: readonly Mip8[]): Mip8[] => m.map((x) => ({ size: x.size, data: u8(x.data) }));
const mips = (m: readonly Mip[]): Mip[] => m.map((x) => ({ size: x.size, data: f32(x.data) }));

/** The same world data with every large array in shared memory. */
export function shareWorld(d: WorldData): WorldData {
  const s = d.scene;
  const tex: SheetTextures = {
    size: d.tex.size,
    albedo: mips(d.tex.albedo),
    normal: mips(d.tex.normal),
    orm: mips(d.tex.orm),
  };
  return {
    ...d,
    scene: {
      ...s,
      positions: f32(s.positions),
      normals: f32(s.normals),
      uvs: f32(s.uvs),
      colors: f32(s.colors),
      indices: u32(s.indices),
      surface: u8(s.surface),
      look: u8(s.look),
      tangents: f32(s.tangents),
      texSet: u8(s.texSet),
      sets: s.sets.map((t) => ({
        ...t,
        albedo: mips8(t.albedo),
        normal: mips8(t.normal),
        orm: mips8(t.orm),
      })),
      vtan: f32(s.vtan),
    },
    tex,
    cls: u8(d.cls),
    mip: u8(d.mip),
  };
}

export function shareFilm(f: Film): Film {
  return {
    width: f.width,
    height: f.height,
    color: f32(f.color),
    albedo: f32(f.albedo),
    normal: f32(f.normal),
    shadow: f32(f.shadow),
    floor: f32(f.floor),
    back: f32(f.back),
    mask: u8(f.mask),
  };
}

/** Claim and render tiles until the counter runs out (worker side, and the in-line fallback). */
export function runJob(j: TileJob): void {
  const w = assemble(j.data);
  const n = tileCount(j.film);
  for (let t = Atomics.add(j.counter, 0, 1); t < n; t = Atomics.add(j.counter, 0, 1))
    renderTile(w, j.cam, j.film, t, j.spp, j.params, j.salt);
}

/** Render every tile of `film` (shared) on `threads` workers; resolves when all are done. */
export async function renderThreads(job: Omit<TileJob, 'counter'>, threads: number): Promise<void> {
  const counter = new Int32Array(new SharedArrayBuffer(4));
  const full: TileJob = { ...job, counter };
  if (threads <= 1 || typeof Worker === 'undefined') {
    runJob(full);
    return;
  }
  const url = new URL('./worker.ts', import.meta.url).href;
  const runs = Array.from({ length: threads }, () => {
    const w = new Worker(url);
    return new Promise<void>((resolve, reject) => {
      w.onmessage = (e: MessageEvent<string>) => {
        w.terminate();
        if (e.data === 'done') resolve();
        else reject(fail(e.data));
      };
      w.onerror = (e: ErrorEvent) => {
        w.terminate();
        reject(fail(e.message));
      };
      w.postMessage(full);
    });
  });
  await Promise.all(runs);
}

const fail = (cause: string): Ts23dError =>
  new Ts23dError('T3D_RENDER_OPTIONS', {
    cause: `path-tracer worker failed: ${cause}`,
    fix: 'retry with threads: 1 (in-line) and report the asset if it fails the same way',
  });
