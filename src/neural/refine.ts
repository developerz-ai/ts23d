// Optional AI refine adapter: send a mesh (+ prompt, optional reference image) to a model server
// the USER runs locally (a TRELLIS / Hunyuan3D-style "refine/retexture this mesh" wrapper) and get
// a GLB back. ts23d ships the protocol, the cache and the errors — never a model. Cached by
// sha256(model, prompt, seed, input GLB, image): a hit needs no GPU and no network, a miss with
// `offline` (CI) is T3D_REFINE_FAILED naming the command. The result is an ordinary GLB for
// importGlb (licence: the model's output terms, declared by the caller).
//
// Protocol: POST <endpoint>, JSON { model, prompt, seed, mesh: base64 GLB (glTF Y-up),
// image?: base64 } → 200 with body = GLB bytes (model/gltf-binary).

import { type Mesh, Ts23dError } from '../core/index.ts';
import { writeMeshGlb } from './glb-write.ts';
import { sha256Hex } from './sha256.ts';

export interface RefineRequest {
  readonly mesh: Mesh;
  readonly prompt: string;
  readonly seed?: number;
  /** PNG/JPEG bytes of a reference image. */
  readonly image?: Uint8Array;
}

export interface RefineCache {
  get(key: string): Uint8Array | undefined;
  set(key: string, glb: Uint8Array): void;
}

/** The POST the adapter sends: a structural subset of fetch's init (no DOM lib needed). */
export interface RefineHttpInit {
  readonly method: 'POST';
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

/** What the adapter reads from the reply: a structural subset of fetch's Response. */
export interface RefineHttpReply {
  readonly ok: boolean;
  readonly status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface RefineOptions {
  /** e.g. 'http://127.0.0.1:8190/refine'. */
  readonly endpoint: string;
  /** Model id, part of the cache key: 'trellis-2', 'hunyuan3d-2.1'. */
  readonly model: string;
  /** Where results live (scripts pass a `.ts23d/neural/` disk cache); default in-memory. */
  readonly cache?: RefineCache;
  /** Never call the server: a cache miss is an error (CI). */
  readonly offline?: boolean;
  /** Give up after this many ms (request + body). Default 600 000 (10 min). */
  readonly timeoutMs?: number;
  /** Injected for tests and custom transports; default the global fetch (aborted on timeout). */
  readonly fetch?: (url: string, init: RefineHttpInit) => Promise<RefineHttpReply>;
}

const TIMEOUT_MS = 600_000;

export interface Refined {
  readonly glb: Uint8Array;
  /** The cache key. */
  readonly key: string;
  /** sha256 of `glb`, ready for importGlb's `sha256`. */
  readonly sha256: string;
  readonly cached: boolean;
}

const memory = new Map<string, Uint8Array>();
const MEMORY: RefineCache = {
  get: (k) => memory.get(k),
  set: (k, v) => {
    memory.set(k, v);
  },
};

const b64 = (b: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};

/** ts23d Z-up/+X-front → glTF Y-up/+Z-front (x, y, z) → (y, z, x). */
function yUp(m: Mesh): Mesh {
  const turn = (a: Float32Array): Float32Array => {
    const out = new Float32Array(a.length);
    for (let i = 0; i < a.length; i += 3) {
      out[i] = a[i + 1] ?? 0;
      out[i + 1] = a[i + 2] ?? 0;
      out[i + 2] = a[i] ?? 0;
    }
    return out;
  };
  return { ...m, positions: turn(m.positions), normals: turn(m.normals) };
}

export async function refine(req: RefineRequest, o: RefineOptions): Promise<Refined> {
  const input = writeMeshGlb([{ name: 'input', mesh: yUp(req.mesh) }]);
  const seed = req.seed ?? 0;
  const key = sha256Hex(
    new TextEncoder().encode(
      JSON.stringify([
        o.model,
        req.prompt,
        seed,
        sha256Hex(input),
        req.image ? sha256Hex(req.image) : null,
      ]),
    ),
  );
  const cache = o.cache ?? MEMORY;
  const hit = cache.get(key);
  if (hit) return { glb: hit, key, sha256: sha256Hex(hit), cached: true };
  if (o.offline)
    throw new Ts23dError('T3D_REFINE_FAILED', {
      cause: `refine cache miss for key ${key.slice(0, 12)}… (model ${o.model}) while offline`,
      fix: `run the build once on a machine with the ${o.model} server at ${o.endpoint}, then commit .ts23d/neural/${key}.glb`,
    });
  const glb = await post(o, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: o.model,
      prompt: req.prompt,
      seed,
      mesh: b64(input),
      ...(req.image ? { image: b64(req.image) } : {}),
    }),
  });
  cache.set(key, glb);
  return { glb, key, sha256: sha256Hex(glb), cached: false };
}

/** POST and read the GLB body within `timeoutMs`; every failure is T3D_REFINE_FAILED. */
async function post(o: RefineOptions, init: RefineHttpInit): Promise<Uint8Array> {
  const ms = o.timeoutMs ?? TIMEOUT_MS;
  if (!(Number.isFinite(ms) && ms > 0))
    throw new Ts23dError('T3D_REFINE_FAILED', {
      cause: `timeoutMs is ${ms}`,
      fix: 'pass timeoutMs as a positive number of milliseconds (default 600000)',
    });
  const signal = AbortSignal.timeout(ms);
  const call = o.fetch ?? ((url: string, i: RefineHttpInit) => fetch(url, { ...i, signal }));
  const timedOut = new Promise<never>((_, reject) =>
    signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
  );
  let res: RefineHttpReply;
  let glb: Uint8Array;
  try {
    [res, glb] = await Promise.race([
      call(o.endpoint, init).then(async (r) => [r, new Uint8Array(await r.arrayBuffer())] as const),
      timedOut,
    ]);
  } catch (e) {
    throw new Ts23dError('T3D_REFINE_FAILED', {
      cause: signal.aborted
        ? `${o.endpoint} did not answer within ${ms} ms`
        : `no answer from ${o.endpoint} (${String(e)})`,
      fix: `start your local model server at ${o.endpoint} (see docs/idea/21-import.md › Refine), raise the timeoutMs option (now ${ms}), or pass offline: true`,
    });
  }
  if (!res.ok || glb.byteLength < 12 || new DataView(glb.buffer).getUint32(0, true) !== 0x46546c67)
    throw new Ts23dError('T3D_REFINE_FAILED', {
      cause: `${o.endpoint} answered ${res.status} with ${glb.byteLength} bytes that are not a GLB`,
      fix: 'the server must return the refined mesh as model/gltf-binary; check its log',
    });
  return glb;
}
