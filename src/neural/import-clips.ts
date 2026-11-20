// glTF animations as core `Clip`s on the imported armature's bones. glTF keys are a joint node's
// ABSOLUTE local TRS, in a parent frame that carries the rest rotations of every node above it;
// ts23d keys are RELATIVE to a rest pose with no rotation at all, in asset axes (clip.ts, the
// exporter's clips.ts, QA's clip-pose.ts). With P = the rest world rotation (and scale) of the
// joint's parent node, r0/t0/s0 the joint's rest TRS and A the import frame:
//   rotation    = A · P · (r(t) ⊗ r0⁻¹) · P⁻¹ · A⁻¹   (the same turn, seen from asset axes)
//   translation = A · P · (t(t) − t0)                  (offset from rest, metres)
//   scale       = s(t) / s0                            (uniform only; non-uniform is dropped)
// LINEAR keys map one to one; STEP keys get a hold key before each change; CUBICSPLINE keeps the
// key values and drops the tangents (warned). Tracks that never leave rest are dropped. A cycle
// one frame short of its period gets its closing key (import-clips-loop.ts; warned).

import {
  type Clip,
  dmath,
  type Quat,
  quatRotate,
  RUN_CLIP,
  type Track,
  type Vec3,
} from '../core/index.ts';
import { at, type GlbDoc, type GltfJson, list, readAccessor } from './glb-read.ts';
import { localMatrix, type M4, type SceneGraph } from './glb-scene.ts';
import { closeCycle } from './import-clips-loop.ts';
import { frameDir, type ImportFrame } from './import-frame.ts';
import type { ImportedRig } from './import-rig.ts';
import { snakeName } from './import-textures.ts';

const EPS = 1e-5;
const HOLD = 1e-4;

/** The largest float32 below `x` (x > 0). */
function below(x: number): number {
  const f = new Float32Array([x]);
  const bits = new Int32Array(f.buffer);
  bits[0] = (bits[0] ?? 0) - 1;
  return f[0] ?? x;
}
type Path = 'rotation' | 'translation' | 'scale';

const qmul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];

/** Rotation (unit quaternion) and per-axis scale of a matrix's upper 3×3 (no shear assumed). */
export function rotationOf(m: M4): { q: Quat; scale: Vec3 } {
  const col = (c: number): Vec3 => [m[c * 4] ?? 0, m[c * 4 + 1] ?? 0, m[c * 4 + 2] ?? 0];
  const s = [0, 1, 2].map((c) => dmath.norm(col(c)) || 1) as [number, number, number];
  const r = (row: number, c: number): number => (m[c * 4 + row] ?? 0) / (s[c] ?? 1);
  const tr = r(0, 0) + r(1, 1) + r(2, 2);
  let q: [number, number, number, number];
  if (tr > 0) {
    const k = Math.sqrt(tr + 1) * 2;
    q = [(r(2, 1) - r(1, 2)) / k, (r(0, 2) - r(2, 0)) / k, (r(1, 0) - r(0, 1)) / k, k / 4];
  } else {
    const i = r(0, 0) > r(1, 1) && r(0, 0) > r(2, 2) ? 0 : r(1, 1) > r(2, 2) ? 1 : 2;
    const [j, l] = [(i + 1) % 3, (i + 2) % 3];
    const k = Math.sqrt(1 + r(i, i) - r(j, j) - r(l, l)) * 2;
    q = [0, 0, 0, (r(l, j) - r(j, l)) / k];
    q[i] = k / 4;
    q[j] = (r(j, i) + r(i, j)) / k;
    q[l] = (r(l, i) + r(i, l)) / k;
  }
  const n = dmath.norm(q) || 1;
  return { q: [q[0] / n, q[1] / n, q[2] / n, q[3] / n], scale: s };
}

/** One channel's keys re-expressed against the ts23d rest pose; null when dropped. */
function convert(
  path: Path,
  src: Float32Array,
  node: GltfJson,
  above: M4 | undefined,
  frame: ImportFrame,
): Float32Array | null {
  const local = localMatrix(node);
  const rest = rotationOf(local);
  const up = above ? rotationOf(above) : { q: [0, 0, 0, 1] as Quat, scale: [1, 1, 1] as Vec3 };
  const stride = path === 'rotation' ? 4 : 3;
  const out = new Float32Array(src.length);
  let prev: Quat | undefined;
  for (let i = 0; i < src.length; i += stride) {
    const v = [0, 1, 2, 3].map((k) => src[i + k] ?? 0) as [number, number, number, number];
    if (path === 'rotation') {
      const d = qmul(v, [-rest.q[0], -rest.q[1], -rest.q[2], rest.q[3]]);
      const axis = frameDir(frame, quatRotate(up.q, [d[0], d[1], d[2]]));
      const n = dmath.hypot(...axis, d[3]) || 1;
      // Keys stay on one side of the double cover (first key w ≥ 0), so lerps take the short way.
      const flip =
        (prev ? axis[0] * prev[0] + axis[1] * prev[1] + axis[2] * prev[2] + d[3] * prev[3] : d[3]) <
        0;
      const k = (flip ? -1 : 1) / n;
      prev = [axis[0] * k, axis[1] * k, axis[2] * k, d[3] * k];
      out.set(prev, i);
    } else if (path === 'translation') {
      const d: Vec3 = [
        (v[0] - (local[12] ?? 0)) * up.scale[0],
        (v[1] - (local[13] ?? 0)) * up.scale[1],
        (v[2] - (local[14] ?? 0)) * up.scale[2],
      ];
      out.set(
        frameDir(frame, quatRotate(up.q, d)).map((x) => x * frame.scale),
        i,
      );
    } else {
      const s = [v[0] / rest.scale[0], v[1] / rest.scale[1], v[2] / rest.scale[2]];
      const mean = ((s[0] ?? 1) + (s[1] ?? 1) + (s[2] ?? 1)) / 3;
      if (s.some((x) => Math.abs(x - mean) > 1e-3)) return null;
      out.set([mean, mean, mean], i);
    }
  }
  return out;
}

const REST: Record<Path, readonly number[]> = {
  rotation: [0, 0, 0, 1],
  translation: [0, 0, 0],
  scale: [1, 1, 1],
};

const atRest = (path: Path, values: Float32Array): boolean =>
  values.every((v, i) => Math.abs(v - (REST[path][i % REST[path].length] ?? 0)) < EPS);

/** Times shifted to start at `t0`, non-increasing keys dropped, STEP holds inserted. Exported
 *  for its test. */
export function keys(
  times: Float32Array,
  values: Float32Array,
  stride: number,
  t0: number,
  step: boolean,
): { times: Float32Array; values: Float32Array } {
  const t: number[] = [];
  const v: number[] = [];
  let prevValue: number[] = [];
  for (let i = 0; i < times.length; i++) {
    const time = Math.fround(Math.max((times[i] ?? 0) - t0, 0));
    const last = t[t.length - 1];
    if (last !== undefined && time <= last) continue;
    if (step && last !== undefined) {
      // The hold key sits just before this key: HOLD earlier, or (far from 0, where float32
      // cannot tell the two apart) the float just below it. Skipped when no float lies between.
      const near = Math.fround(time - HOLD);
      const hold = near < time ? near : below(time);
      if (hold > last && hold < time) {
        t.push(hold);
        v.push(...prevValue);
      }
    }
    prevValue = [...values.subarray(i * stride, i * stride + stride)];
    t.push(time);
    v.push(...prevValue);
  }
  return { times: Float32Array.from(t), values: Float32Array.from(v) };
}

/** A track's last key is its first (so the clip can loop). q and −q are one rotation: a full
 *  turn keyed continuously ends on −q. */
export function endsMeet(t: {
  readonly path: string;
  readonly times: Float32Array;
  readonly values: Float32Array;
}): boolean {
  const stride = t.values.length / t.times.length;
  const last = t.values.length - stride;
  const same = (sign: 1 | -1): boolean =>
    [...t.values.subarray(0, stride)].every(
      (v, k) => Math.abs(v - sign * (t.values[last + k] ?? 0)) < 1e-3,
    );
  return same(1) || (t.path === 'rotation' && same(-1));
}

export interface ImportClipsOptions {
  /** Append the closing key to a cycle that arrives one frame short of its period. Default true. */
  readonly closeLoops?: boolean;
}

export function importClips(
  doc: GlbDoc,
  graph: SceneGraph,
  rig: ImportedRig,
  frame: ImportFrame,
  o: ImportClipsOptions = {},
): { clips: Clip[]; warnings: string[] } {
  const clips: Clip[] = [];
  const warnings: string[] = [];
  const taken = new Set<string>();
  list(doc.json, 'animations').forEach((anim, a) => {
    const label = typeof anim['name'] === 'string' && anim['name'] ? anim['name'] : `clip_${a}`;
    const base = snakeName(label, 'clip');
    let name = base === RUN_CLIP ? `${RUN_CLIP}_anim` : base;
    for (let k = 2; taken.has(name); k++) name = `${base}_${k}`;
    const samplers = list(anim, 'samplers');
    const skipped = new Set<string>();
    const notes = new Set<string>();
    const pending: { bone: string; path: Path; node: number; sampler: GltfJson }[] = [];
    const seen = new Set<string>();
    for (const ch of list(anim, 'channels')) {
      const target = (ch['target'] ?? {}) as GltfJson;
      const node = target['node'];
      const path = target['path'];
      const sampler = samplers[typeof ch['sampler'] === 'number' ? ch['sampler'] : -1];
      if (typeof node !== 'number' || !sampler) continue;
      const bone = rig.armature.bones[rig.boneOfNode.get(node) ?? -1];
      if (!bone) {
        if (!rig.dropped.has(node))
          skipped.add(graph.world.has(node) ? graph.name(node) : `node ${node}`);
        continue;
      }
      if (path !== 'rotation' && path !== 'translation' && path !== 'scale') {
        notes.add(`'${String(path)}' channels are not imported`);
        continue;
      }
      if (seen.has(`${bone.name}:${path}`)) {
        notes.add(`bone '${bone.name}' ${path} is keyed twice; the first channel wins`);
        continue;
      }
      seen.add(`${bone.name}:${path}`);
      pending.push({ bone: bone.name, path, node, sampler });
    }
    const read = pending.map((p) => ({
      ...p,
      input: readAccessor(doc, Number(p.sampler['input'])).data,
      output: readAccessor(doc, Number(p.sampler['output'])).data,
    }));
    const t0 = Math.min(...read.map((r) => r.input[0] ?? 0), Infinity);
    const end = Math.max(...read.map((r) => r.input[r.input.length - 1] ?? 0), 0);
    const tracks: Track[] = [];
    for (const r of read) {
      const stride = r.path === 'rotation' ? 4 : 3;
      const mode = r.sampler['interpolation'] ?? 'LINEAR';
      let src = r.output;
      if (mode === 'CUBICSPLINE') {
        notes.add('CUBICSPLINE keys imported as LINEAR (tangents dropped)');
        src = new Float32Array(r.input.length * stride);
        for (let k = 0; k < r.input.length; k++)
          src.set(r.output.subarray((k * 3 + 1) * stride, (k * 3 + 2) * stride), k * stride);
      }
      if (!r.input.length || src.length < r.input.length * stride) continue;
      const parent = graph.parent.get(r.node) ?? -1;
      const values = convert(
        r.path,
        src.subarray(0, r.input.length * stride),
        at(doc, 'nodes', r.node),
        parent < 0 ? undefined : graph.world.get(parent),
        frame,
      );
      if (!values) {
        notes.add(`bone '${r.bone}' has non-uniform scale keys, which a ts23d clip cannot hold`);
        continue;
      }
      if (atRest(r.path, values)) continue;
      tracks.push({
        bone: r.bone,
        path: r.path,
        ...keys(r.input, values, stride, t0, mode === 'STEP'),
      });
    }
    if (skipped.size)
      warnings.push(
        `clip '${label}': channels on non-joint nodes ignored (${[...skipped].join(', ')})`,
      );
    for (const n of notes) warnings.push(`clip '${label}': ${n}`);
    if (!tracks.length) {
      warnings.push(`clip '${label}' moves no bone of the armature: dropped`);
      return;
    }
    if (name !== base) warnings.push(`clip '${label}' imported as '${name}'`);
    taken.add(name);
    const extras = (anim['extras'] ?? {}) as GltfJson;
    const span = Math.max(end - t0, 1 / 30);
    const seconds =
      typeof extras['seconds'] === 'number' && extras['seconds'] >= span ? extras['seconds'] : span;
    const closes = tracks.every(endsMeet);
    const loop = typeof extras['loop'] === 'boolean' ? extras['loop'] : closes;
    const clip: Clip = { name, seconds: Math.fround(seconds), loop, tracks };
    const closed =
      closes || extras['loop'] === false || o.closeLoops === false ? null : closeCycle(clip);
    if (closed)
      warnings.push(
        `clip '${label}': a cycle one frame short of its period (${+closed.fps.toFixed(2)} fps): closing key appended, ${clip.seconds.toFixed(4)} s → ${closed.clip.seconds.toFixed(4)} s, loop`,
      );
    clips.push(closed?.clip ?? clip);
  });
  return { clips, warnings };
}
