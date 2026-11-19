// Named glTF animations: `rest` first (viewers auto-play the first clip and glTF has no "paused"
// flag: two STEP keys holding the root's rest rotation keep the file still), then `run` (every
// part's baked Motion, hierarchy.ts) and every declared `Clip` (ADR 013). A clip's track keys a
// bone (its joint node in every LOD tree) or a part (its node, when the GLB still has it as a
// pivot). Keys are relative to rest: rotation turns from the rest pose, translation offsets the
// rest position, scale is absolute, `weights` drives the node's morph targets. LOD trees share a
// sampler when their node's rest pose (or morph count) is the same, so a clip is stored once per
// distinct rest in a single-file GLB; a LOD without the part's morph targets gets no weights key
// (clip-channels.ts: the rule the manifest's `clips` follows too).

import { type Clip, RUN_CLIP, type Track, Ts23dError } from '../core/index.ts';
import type { BinWriter, Json } from './bin-writer.ts';
import { keysNode } from './clip-channels.ts';
import type { GltfDoc } from './hierarchy.ts';

/** Authoring frame Z up, +X front → glTF Y up, +Z front: maps +X→+Z, +Z→+Y, +Y→+X. */
export const Z_UP_TO_Y_UP = [-0.5, -0.5, -0.5, 0.5];

/** One LOD tree's named nodes: parts (pivots that survived merging) and joints. */
export interface ClipTree {
  readonly parts: ReadonlyMap<string, number>;
  readonly joints: ReadonlyMap<string, number>;
}

function restClip(bin: BinWriter, roots: readonly number[]): Json {
  const input = bin.accessor(new Float32Array([0, 1]), 'SCALAR', undefined, true);
  const output = bin.accessor(new Float32Array([...Z_UP_TO_Y_UP, ...Z_UP_TO_Y_UP]), 'VEC4');
  return {
    name: 'rest',
    samplers: [{ input, output, interpolation: 'STEP' }],
    channels: roots.map((node) => ({ sampler: 0, target: { node, path: 'rotation' } })),
  };
}

const unknown = (clip: string, what: string, fix: string): never => {
  throw new Ts23dError('T3D_PART_UNKNOWN', { cause: `clip '${clip}' keys ${what}`, fix });
};

/** Keys turned into the node's absolute local values. */
function valuesOf(doc: GltfDoc, node: number, t: Track): Float32Array {
  const n = doc.nodes[node] ?? {};
  if (t.path === 'translation') {
    const rest = (n['translation'] as number[] | undefined) ?? [0, 0, 0];
    return t.values.map((v, i) => v + (rest[i % 3] ?? 0));
  }
  if (t.path !== 'rotation') return t.values;
  const rest = n['rotation'] as number[] | undefined;
  if (!rest) return t.values;
  // rest ⊗ key (Hamilton product): the key turns the node from its rest orientation.
  const out = new Float32Array(t.values.length);
  for (let i = 0; i < t.values.length; i += 4) {
    const [x, y, z, w] = [0, 1, 2, 3].map((k) => t.values[i + k] ?? 0) as [
      number,
      number,
      number,
      number,
    ];
    const [a, b, c, d] = rest as [number, number, number, number];
    out.set(
      [
        d * x + a * w + b * z - c * y,
        d * y - a * z + b * w + c * x,
        d * z + a * y - b * x + c * w,
        d * w - a * x - b * y - c * z,
      ],
      i,
    );
  }
  return out;
}

function morphCount(doc: GltfDoc, node: number): number {
  const mesh = doc.nodes[node]?.['mesh'];
  const m = typeof mesh === 'number' ? doc.meshes[mesh] : undefined;
  return ((m?.['weights'] as number[] | undefined) ?? []).length;
}

/** What a track's absolute keys depend on at `node`: two LOD trees share a sampler only when equal. */
function restKey(doc: GltfDoc, node: number, t: Track): string {
  const n = doc.nodes[node] ?? {};
  if (t.path === 'translation') return JSON.stringify(n['translation'] ?? null);
  if (t.path === 'rotation') return JSON.stringify(n['rotation'] ?? null);
  return t.path === 'weights' ? String(morphCount(doc, node)) : '';
}

function clipJson(doc: GltfDoc, c: Clip, trees: readonly ClipTree[]): Json {
  const samplers: Json[] = [];
  const channels: Json[] = [];
  for (const t of c.tracks) {
    const isBone = 'bone' in t;
    const name = isBone ? t.bone : t.part;
    const found = trees.flatMap((tr) => {
      const id = isBone ? tr.joints.get(name) : tr.parts.get(name);
      return id === undefined ? [] : [id];
    });
    if (found.length === 0)
      return unknown(
        c.name,
        `${isBone ? 'bone' : 'part'} '${name}', which has no node in the GLB`,
        isBone
          ? 'key a bone of the skeleton'
          : 'make the part a pivot (ctx.group or a motion) so merging keeps its node',
      );
    let nodes = found;
    if (t.path === 'weights') {
      const stride = t.values.length / t.times.length;
      // A LOD that dropped the part's morphs (LOD-gated) gets no weights channel on it.
      nodes = found.filter((n) => keysNode(t, morphCount(doc, n)));
      const off = isBone ? found[0] : nodes.find((n) => morphCount(doc, n) !== stride);
      if (off !== undefined)
        unknown(
          c.name,
          `${stride} morph weights on '${name}', whose mesh has ${isBone ? 0 : morphCount(doc, off)} targets`,
          'give one weight per morph target of that part, in Mesh.morphs order',
        );
    }
    if (nodes.length === 0) continue;
    // One sampler per distinct rest pose: a pivot placed differently per LOD keys from its own.
    const input = doc.bin.accessor(t.times, 'SCALAR', undefined, true);
    const byRest = new Map<string, number>();
    for (const node of nodes) {
      const key = restKey(doc, node, t);
      let sampler = byRest.get(key);
      if (sampler === undefined) {
        samplers.push({
          input,
          output: doc.bin.accessor(
            valuesOf(doc, node, t),
            t.path === 'rotation' ? 'VEC4' : t.path === 'weights' ? 'SCALAR' : 'VEC3',
          ),
          interpolation: 'LINEAR',
        });
        sampler = samplers.length - 1;
        byRest.set(key, sampler);
      }
      channels.push({ sampler, target: { node, path: t.path } });
    }
  }
  return { name: c.name, samplers, channels, extras: { seconds: c.seconds, loop: c.loop } };
}

/** Every animation of the file: rest, run (when parts move), declared clips; [] when none. */
export function animationsOf(
  doc: GltfDoc,
  roots: readonly number[],
  trees: readonly ClipTree[],
  clips: readonly Clip[],
): Json[] {
  const run = doc.channels.length
    ? [{ name: RUN_CLIP, samplers: doc.samplers, channels: doc.channels }]
    : [];
  // A clip that keys nothing in this file (only morphs this LOD dropped) is left out: glTF
  // needs at least one channel per animation.
  const named = clips
    .map((c) => clipJson(doc, c, trees))
    .filter((a) => (a['channels'] as Json[]).length > 0);
  return run.length || named.length ? [restClip(doc.bin, roots), ...run, ...named] : [];
}

/** Manifest `clips`: name, length, loop and the root's mean ground speed (m/s). */
export function clipSummary(
  clips: readonly Clip[],
  hasRun: boolean,
  runSeconds: number,
): { name: string; seconds: number; loop: boolean; speed: number }[] {
  const r4 = (x: number): number => Math.round(x * 1e4) / 1e4;
  return [
    ...(hasRun ? [{ name: RUN_CLIP, seconds: runSeconds, loop: true, speed: 0 }] : []),
    ...clips.map((c) => {
      const root = c.tracks.find((t) => t.path === 'translation');
      const n = root ? root.times.length : 0;
      const d =
        root && n > 1
          ? Math.hypot(
              ...[0, 1].map((k) => (root.values[(n - 1) * 3 + k] ?? 0) - (root.values[k] ?? 0)),
            )
          : 0;
      return { name: c.name, seconds: c.seconds, loop: c.loop, speed: r4(d / c.seconds) };
    }),
  ];
}
