// Chain-motion QA fixtures shared by the gate tests and finding-codes.test.ts: a bone chain swimming
// by the published travelling wave (length-keeping links, recoil on the root) with every kinematic
// number settable, and a radial many-armed rig whose arms can be swung through each other.

import {
  type Armature,
  type Bone,
  type Clip,
  type CompiledAsset,
  compile,
  defineAsset,
  dmath,
  quatFromAxisAngle,
  type Track,
  type Vec3,
} from '../core/index.ts';
import { box } from '../primitives/index.ts';

export interface SwimSpec {
  readonly name?: string;
  /** Body length, metres. */
  readonly length?: number;
  readonly links?: number;
  /** Tail-beat frequency, Hz. */
  readonly f?: number;
  /** Stride, body lengths per beat: U = stride · f · L. */
  readonly stride?: number;
  /** Tail excursion peak to peak, share of L (the envelope is scaled to it). */
  readonly tail?: number;
  /** Wavelength, share of L; negative runs the wave tail to head. */
  readonly lambda?: number;
  readonly beats?: number;
  /** Keys per tail beat, for beats too fast for the default 30 keys a second. */
  readonly keysPerBeat?: number;
  /** Take the chain's mean lateral offset off the root (true). */
  readonly recoil?: boolean;
  /** Amplitude envelope over s, tail = 1. Default: the [DS21] all-fish fit. */
  readonly envelope?: (s: number) => number;
}

const fishEnvelope = (s: number): number => (0.05 - 0.13 * s + 0.28 * s * s) / 0.2;

/** A straight chain lying along −X from the snout at x = L, z = 1 (root first). */
export function spine(links: number, length: number): Bone[] {
  return Array.from({ length: links }, (_, i) => {
    const x = (k: number): number => length * (1 - k / links);
    return {
      name: `spine_${i}`,
      ...(i > 0 ? { parent: `spine_${i - 1}` } : {}),
      head: [x(i), 0, 1] as Vec3,
      tail: [x(i + 1), 0, 1] as Vec3,
    };
  });
}

/** The clip for `o`, baked at 30 keys a second or `keysPerBeat`: heading from the wave's slope at each link. */
export function swimClip(o: SwimSpec = {}): Clip {
  const L = o.length ?? 2;
  const n = o.links ?? 16;
  const f = o.f ?? 1;
  const beats = o.beats ?? 2;
  const lambda = o.lambda ?? 0.95;
  const shape = o.envelope ?? fishEnvelope;
  const seconds = beats / f;
  const U = (o.stride ?? 0.65) * f * L;
  const frames = Math.max(Math.round(seconds * 30), beats * (o.keysPerBeat ?? 0));
  const times = Float32Array.from({ length: frames + 1 }, (_, k) => (k / frames) * seconds);
  // A length-keeping chain lands under the nominal amplitude: 1.09 brings it back (research §1).
  const half = ((o.tail ?? 0.18) * L * 1.09) / 2;
  const y = (s: number, t: number): number =>
    half * shape(s) * dmath.sin(2 * Math.PI * (s / lambda - f * t));
  const rootT = new Float32Array((frames + 1) * 3);
  const rots = Array.from({ length: n }, () => new Float32Array((frames + 1) * 4));
  for (let k = 0; k <= frames; k++) {
    const t = times[k] ?? 0;
    const beta = Array.from({ length: n }, (_, i) => {
      const dy = y((i + 1) / n, t) - y(i / n, t);
      return dmath.asin(Math.max(-1, Math.min(1, dy / (L / n))));
    });
    // Station offsets from the head, then the head placed so the mean is on the travel line.
    const ys = [0];
    beta.forEach((b, i) => {
      ys.push((ys[i] ?? 0) + (L / n) * dmath.sin(b));
    });
    const mean = ys.reduce((a, v, i) => a + v * (i === 0 || i === n ? 0.5 : 1), 0) / n;
    rootT.set([U * t, o.recoil === false ? y(0, t) : -mean, 0], k * 3);
    beta.forEach((b, i) => {
      const before = i === 0 ? 0 : -(beta[i - 1] ?? 0);
      rots[i]?.set(quatFromAxisAngle([0, 0, 1], -b - before), k * 4);
    });
  }
  const tracks: Track[] = [
    { bone: 'spine_0', path: 'translation', times, values: rootT },
    ...rots.map((values, i): Track => ({ bone: `spine_${i}`, path: 'rotation', times, values })),
  ];
  return { name: o.name ?? 'cruise', seconds, loop: true, tracks };
}

/** A compiled water asset from bones and clips (one box body, nothing skinned). */
export function rigged(
  bones: readonly Bone[],
  clips: readonly Clip[],
  medium: 'water' | 'ground' = 'water',
): CompiledAsset {
  return compile(
    defineAsset({
      name: 'chain_rig',
      kind: 'creature',
      medium,
      budget: { triangles: [9999, 9999, 9999], bones: 512 },
      clips: [...clips],
      build(ctx) {
        for (const b of bones) ctx.bone(b.name, b);
        ctx.part('body', box({ size: [0.2, 0.2, 0.2], at: [0, 0, 1], color: [0.5, 0.5, 0.5] }));
      },
    }),
  );
}

export const swimmer = (...clips: readonly SwimSpec[]): CompiledAsset => {
  const first = clips[0] ?? {};
  return rigged(spine(first.links ?? 16, first.length ?? 2), clips.map(swimClip));
};

/** `count` straight arms of `links` bones radiating from a hub at height `z`, each `reach` long. */
export function radial(count: number, links: number, reach = 1, z = 1): Armature {
  const bones: Bone[] = [{ name: 'hub', head: [0, 0, z], tail: [0, 0, z + 0.1] }];
  for (let a = 0; a < count; a++) {
    const th = (a / count) * 2 * Math.PI;
    const at = (k: number): Vec3 => {
      const r = 0.1 + (reach * k) / links;
      return [r * dmath.cos(th), r * dmath.sin(th), z];
    };
    for (let i = 0; i < links; i++)
      bones.push({
        name: `arm_${a}_${i}`,
        parent: i === 0 ? 'hub' : `arm_${a}_${i - 1}`,
        head: at(i),
        tail: at(i + 1),
      });
  }
  return { bones };
}

/** A one-second loop turning `bone` by `degrees` about `axis` at mid-clip. */
export function swing(bone: string, axis: Vec3, degrees: number, name = 'idle'): Clip {
  const times = Float32Array.from([0, 0.5, 1]);
  const values = new Float32Array(12);
  values.set([0, 0, 0, 1], 0);
  values.set(quatFromAxisAngle(axis, (degrees * Math.PI) / 180), 4);
  values.set([0, 0, 0, 1], 8);
  return { name, seconds: 1, loop: true, tracks: [{ bone, path: 'rotation', times, values }] };
}
