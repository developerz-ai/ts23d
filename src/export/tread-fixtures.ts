// Test fixtures for track belts: a small tracked vehicle whose belt is one link placed at even
// stations round a stadium loop (two 0.3 m end wheels 2 m apart), with wheels that spin, and
// readers that pull a belt's morph targets and `run` weights back out of a GLB. Not exported.

import { type Asset, defineAsset, type Mesh, merge, place, type Vec2 } from '../core/index.ts';
import { box, cylinder } from '../primitives/index.ts';
import type { Json } from './bin-writer.ts';
import { readGlbChunks } from './finish-glb.ts';

const c: [number, number, number] = [0.3, 0.3, 0.3];
export const WHEEL_R = 0.28;
const LINE_R = 0.3;
const Y = 0.8;

/** The belt centre line in XZ: bottom run at z = 0 going +x, round the front wheel, back on top. */
export function stadium(): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < 40; i++) pts.push([-1 + (2 * i) / 40, 0]);
  for (let i = 0; i < 72; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / 72;
    pts.push([1 + LINE_R * Math.cos(a), LINE_R + LINE_R * Math.sin(a)]);
  }
  for (let i = 0; i < 40; i++) pts.push([1 - (2 * i) / 40, 2 * LINE_R]);
  for (let i = 0; i < 72; i++) {
    const a = Math.PI / 2 + (Math.PI * i) / 72;
    pts.push([-1 + LINE_R * Math.cos(a), LINE_R + LINE_R * Math.sin(a)]);
  }
  return pts;
}

/** `n` stations evenly round a closed line, each with the angle of the line there. */
function stations(line: readonly Vec2[], n: number): { p: Vec2; angle: number; len: number }[] {
  const seg = line.map((a, i) => {
    const b = line[(i + 1) % line.length] ?? a;
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
  });
  const total = seg.reduce((s, l) => s + l, 0);
  let i = 0;
  let acc = 0;
  return Array.from({ length: n }, (_, k) => {
    const d = (k / n) * total;
    while (acc + (seg[i] ?? 0) < d && i < line.length - 1) acc += seg[i++] ?? 0;
    const a = line[i] ?? [0, 0];
    const b = line[(i + 1) % line.length] ?? a;
    const f = (d - acc) / (seg[i] || 1);
    return {
      p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f] as Vec2,
      angle: Math.atan2(-(b[1] - a[1]), b[0] - a[0]),
      len: total / n,
    };
  });
}

export interface BeltOptions {
  /** Links per LOD (default 40, 20, 10). */
  readonly links?: readonly [number, number, number];
  /** Wheel turns per second about +Y: positive rolls forward (+X). Default 0.75. */
  readonly rps?: number;
  /** Leave one link out: the belt no longer repeats every pitch. */
  readonly gap?: boolean;
}

/** One plate with a grouser on its outer face, repeated at every station. */
export function beltMesh(links: number, gap = false): { mesh: Mesh; pitch: number } {
  const at = stations(stadium(), links);
  const len = at[0]?.len ?? 0.1;
  const link = merge([
    box({ size: [len * 0.8, 0.3, 0.04], color: c }),
    box({ size: [len * 0.2, 0.3, 0.03], at: [len * 0.2, 0, -0.035], color: c }),
  ]);
  const placed = at.map((s) => place(link, { at: [s.p[0], Y, s.p[1]], pitch: s.angle }));
  return { mesh: merge(gap ? placed.slice(1) : placed), pitch: len };
}

export const beltTank = (o: BeltOptions = {}): Asset =>
  defineAsset({
    name: 'belt_tank',
    kind: 'vehicle',
    budget: { triangles: [9999, 9999, 9999] },
    build(ctx) {
      const { mesh, pitch } = beltMesh((o.links ?? [40, 20, 10])[ctx.lod] ?? 40, o.gap);
      ctx.part('hull', box({ size: [2, 1, 0.3], at: [0, 0, 0.45], color: c }));
      ctx.part('track_l', mesh, {
        motion: { kind: 'tread', path: stadium().map(([x, z]) => [x, Y, z] as const), pitch },
      });
      for (const [i, x] of [-1, 1].entries())
        ctx.part(
          `wheel_l_${i}`,
          cylinder({ radius: WHEEL_R, length: 0.2, segments: 16, axis: 'y', color: c }),
          { at: [x, Y, LINE_R], motion: { kind: 'spin', axis: [0, 1, 0], rps: o.rps ?? 0.75 } },
        );
    },
  });

type Acc = {
  count: number;
  bufferView?: number;
  byteOffset?: number;
  sparse?: {
    count: number;
    indices: { bufferView: number; componentType: number };
    values: { bufferView: number };
  };
};

/** A float accessor's values, dense or sparse (`width` components each). */
export function floats(json: Json, bin: Uint8Array, index: number, width: number): Float32Array {
  const acc = (json['accessors'] as Acc[])[index] ?? { count: 0 };
  const views = json['bufferViews'] as { byteOffset?: number; byteLength: number }[];
  const slice = (view: number): Uint8Array => {
    const v = views[view] ?? { byteLength: 0 };
    return bin.slice(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength);
  };
  const out = new Float32Array(acc.count * width);
  if (acc.bufferView !== undefined)
    out.set(new Float32Array(slice(acc.bufferView).buffer, acc.byteOffset ?? 0, out.length));
  if (acc.sparse) {
    const raw = slice(acc.sparse.indices.bufferView).buffer;
    const at =
      acc.sparse.indices.componentType === 5125 ? new Uint32Array(raw) : new Uint16Array(raw);
    const values = new Float32Array(slice(acc.sparse.values.bufferView).buffer);
    for (let i = 0; i < acc.sparse.count; i++)
      out.set(values.subarray(i * width, (i + 1) * width), (at[i] ?? 0) * width);
  }
  return out;
}

/** A belt node read back from a GLB: rest mesh, morph deltas and the run clip's weights keys. */
export interface ReadBelt {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly targets: readonly { positions: Float32Array; normals: Float32Array }[];
  readonly times: Float32Array;
  /** `targets.length` weights per key; empty when the run clip does not key this node. */
  readonly weights: Float32Array;
}

/** Every node named `name` (one per LOD tree), in file order. */
export function readBelts(glb: Uint8Array, name: string): ReadBelt[] {
  const { json, bin } = readGlbChunks(glb);
  const nodes = (json['nodes'] ?? []) as { name?: string; mesh?: number }[];
  const meshes = (json['meshes'] ?? []) as {
    primitives: { attributes: Record<string, number>; targets?: Record<string, number>[] }[];
  }[];
  const run = ((json['animations'] ?? []) as Json[]).find((a) => a['name'] === 'run');
  const channels = (run?.['channels'] ?? []) as { sampler: number; target: Json }[];
  const samplers = (run?.['samplers'] ?? []) as { input: number; output: number }[];
  return nodes.flatMap((node, id) => {
    const prim = node.name === name ? meshes[node.mesh ?? -1]?.primitives[0] : undefined;
    if (!prim) return [];
    const channel = channels.find(
      (ch) => ch.target['node'] === id && ch.target['path'] === 'weights',
    );
    const sampler = channel ? samplers[channel.sampler] : undefined;
    return [
      {
        positions: floats(json, bin, prim.attributes['POSITION'] ?? 0, 3),
        normals: floats(json, bin, prim.attributes['NORMAL'] ?? 0, 3),
        targets: (prim.targets ?? []).map((t) => ({
          positions: floats(json, bin, t['POSITION'] ?? 0, 3),
          normals: floats(json, bin, t['NORMAL'] ?? 0, 3),
        })),
        times: sampler ? floats(json, bin, sampler.input, 1) : new Float32Array(),
        weights: sampler ? floats(json, bin, sampler.output, 1) : new Float32Array(),
      },
    ];
  });
}

/** The belt's vertex positions at `time` of the run clip: LINEAR weights, POSITION targets. */
export function posedAt(belt: ReadBelt, time: number): Float64Array {
  const k = belt.targets.length;
  const { times, weights } = belt;
  let i = 0;
  while (i + 2 < times.length && (times[i + 1] ?? 0) <= time) i++;
  const [t0, t1] = [times[i] ?? 0, times[i + 1] ?? 1];
  const f = Math.min(1, Math.max(0, (time - t0) / (t1 - t0)));
  const out = Float64Array.from(belt.positions);
  belt.targets.forEach((target, j) => {
    const w = (weights[i * k + j] ?? 0) * (1 - f) + (weights[(i + 1) * k + j] ?? 0) * f;
    if (w !== 0)
      for (let v = 0; v < out.length; v++) out[v] = (out[v] ?? 0) + w * (target.positions[v] ?? 0);
  });
  return out;
}
