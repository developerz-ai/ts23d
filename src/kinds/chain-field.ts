// Poses one bone chain from fields along its arc length (docs/research/swim-and-tentacle-animation.md
// section 0): curvature `kn` and `kb`, twist rate `tw`, axial strain `e`, each a function of (s, t)
// with s in 0..1 and angles in radians per chain length. A link takes the heading of the curve at
// its midpoint, so a joint turns by the field integrated between the midpoints of the links on
// either side of it; links keep their length unless `e` moves the child joint.

import { type Quat, Ts23dError, type Vec3 } from '../core/index.ts';
import type { PlanChain, PlanLink } from './body-plan-types.ts';
import { qexp } from './pose.ts';

/** Largest twist per joint: 85 % of the section area survives a 50/50 skin blend (doc section 6). */
export const MAX_JOINT_TWIST = (45.6 * Math.PI) / 180;

export type FieldFn = (s: number, t: number) => number;

/** What the chain's first joint does at time t, before any field: turns and a slide. */
export interface BaseTurn {
  readonly bend?: number;
  readonly pitch?: number;
  readonly twist?: number;
  /** Translation of the first joint, parent frame, metres. */
  readonly offset?: Vec3;
}

export interface ChainField {
  readonly kn?: FieldFn;
  readonly kb?: FieldFn;
  readonly tw?: FieldFn;
  readonly e?: FieldFn;
  readonly base?: (t: number) => BaseTurn;
}

export interface ChainPose {
  readonly rotation: Map<string, Quat>;
  readonly offset: Map<string, Vec3>;
}

export interface LinkSpan {
  readonly start: number;
  readonly mid: number;
  readonly end: number;
}

/** +1 for a right-handed link frame, -1 on a mirrored copy: `bend` and `pitch` are mirrored as
 *  rotation axes but `twist` stays the bone's direction, so its angle must change sign there. */
const handedness = ({ bend: a, pitch: b, twist: c }: PlanLink): 1 | -1 =>
  (a[1] * b[2] - a[2] * b[1]) * c[0] +
    (a[2] * b[0] - a[0] * b[2]) * c[1] +
    (a[0] * b[1] - a[1] * b[0]) * c[2] <
  0
    ? -1
    : 1;

const invalid = (cause: string, fix: string): never => {
  throw new Ts23dError('T3D_RECIPE_INVALID', { cause, fix });
};

/** Each link's arc interval; refuses a chain whose links are out of order or not connected. */
export function linkSpans(chain: PlanChain): LinkSpan[] {
  const { links, id } = chain;
  if (links.length === 0) invalid(`chain '${id}' has no links`, 'give the chain at least one link');
  return links.map((link, i) => {
    const end = links[i + 1]?.s ?? 1;
    if (!(link.s >= 0 && link.s < end && end <= 1))
      invalid(
        `chain '${id}' link ${i} spans s ${link.s}..${end}`,
        'arc positions must rise from 0 and stay below 1',
      );
    const before = links[i - 1];
    if (before && link.bone.parent !== before.bone.name)
      invalid(
        `chain '${id}' bone '${link.bone.name}' does not hang from '${before.bone.name}'`,
        'list a chain root first, each bone the child of the one before',
      );
    return { start: link.s, mid: (link.s + end) / 2, end };
  });
}

/** ∫ f(s, t) ds over a..b: composite Simpson, four panels. */
export function integrate(f: FieldFn | undefined, a: number, b: number, t: number): number {
  if (!f || b <= a) return 0;
  const h = (b - a) / 4;
  const sum = f(a, t) + 4 * f(a + h, t) + 2 * f(a + 2 * h, t) + 4 * f(a + 3 * h, t) + f(b, t);
  return (sum * h) / 3;
}

/** The chain's joint rotations and child-joint slides at time t. */
export function poseChain(chain: PlanChain, field: ChainField, t: number): ChainPose {
  const spans = linkSpans(chain);
  const rotation = new Map<string, Quat>();
  const offset = new Map<string, Vec3>();
  const base = field.base?.(t) ?? {};
  chain.links.forEach((link, i) => {
    const span = spans[i] ?? { start: 0, mid: 0, end: 1 };
    const from = spans[i - 1]?.mid ?? 0;
    const first = i === 0;
    const a = integrate(field.kn, from, span.mid, t) + (first ? (base.bend ?? 0) : 0);
    const b = integrate(field.kb, from, span.mid, t) + (first ? (base.pitch ?? 0) : 0);
    const c = integrate(field.tw, from, span.mid, t) + (first ? (base.twist ?? 0) : 0);
    if (Math.abs(c) > MAX_JOINT_TWIST)
      invalid(
        `chain '${chain.id}' joint ${i} twists ${((c * 180) / Math.PI).toFixed(1)}° at t = ${t.toFixed(3)} s (limit 45.6°)`,
        'lower the twist field or add links: past 45.6° a 50/50 skin blend collapses the section',
      );
    const [p, q, r] = [link.bend, link.pitch, link.twist];
    const turn = c * handedness(link);
    rotation.set(
      link.bone.name,
      qexp([
        p[0] * a + q[0] * b + r[0] * turn,
        p[1] * a + q[1] * b + r[1] * turn,
        p[2] * a + q[2] * b + r[2] * turn,
      ]),
    );
    const child = chain.links[i + 1];
    if (!child || !field.e) return;
    // The stretch of this link moves the next joint along the rest offset between the two.
    const strain = integrate(field.e, span.start, span.end, t) / (span.end - span.start);
    const [h, k] = [link.bone.head, child.bone.head];
    offset.set(child.bone.name, [
      (k[0] - h[0]) * strain,
      (k[1] - h[1]) * strain,
      (k[2] - h[2]) * strain,
    ]);
  });
  if (base.offset) {
    const root = chain.links[0];
    if (root) offset.set(root.bone.name, base.offset);
  }
  return { rotation, offset };
}

const addFn = (a?: FieldFn, b?: FieldFn): FieldFn | undefined =>
  a && b ? (s, t) => a(s, t) + b(s, t) : (a ?? b);

const addVec = (a?: Vec3, b?: Vec3): Vec3 | undefined =>
  a && b ? [a[0] + b[0], a[1] + b[1], a[2] + b[2]] : (a ?? b);

function addBase(a?: ChainField['base'], b?: ChainField['base']): ChainField['base'] {
  if (!a || !b) return a ?? b;
  return (t) => {
    const [p, q] = [a(t), b(t)];
    const offset = addVec(p.offset, q.offset);
    return {
      bend: (p.bend ?? 0) + (q.bend ?? 0),
      pitch: (p.pitch ?? 0) + (q.pitch ?? 0),
      twist: (p.twist ?? 0) + (q.twist ?? 0),
      ...(offset ? { offset } : {}),
    };
  };
}

const present = (f: ChainField): ChainField => {
  const out: {
    kn?: FieldFn;
    kb?: FieldFn;
    tw?: FieldFn;
    e?: FieldFn;
    base?: (t: number) => BaseTurn;
  } = {};
  if (f.kn) out.kn = f.kn;
  if (f.kb) out.kb = f.kb;
  if (f.tw) out.tw = f.tw;
  if (f.e) out.e = f.e;
  if (f.base) out.base = f.base;
  return out;
};

/** The fields added together: a wave plus a steady turn. */
export function sumFields(...fields: readonly ChainField[]): ChainField {
  return fields.reduce<ChainField>(
    (a, b) =>
      present({
        kn: addFn(a.kn, b.kn),
        kb: addFn(a.kb, b.kb),
        tw: addFn(a.tw, b.tw),
        e: addFn(a.e, b.e),
        base: addBase(a.base, b.base),
      } as ChainField),
    {},
  );
}

/** The field with everything multiplied by w(t): how one motion fades into another. */
export function fadeField(f: ChainField, w: (t: number) => number): ChainField {
  const fade = (g?: FieldFn): FieldFn | undefined => (g ? (s, t) => g(s, t) * w(t) : undefined);
  const base = f.base;
  return present({
    kn: fade(f.kn),
    kb: fade(f.kb),
    tw: fade(f.tw),
    e: fade(f.e),
    base: base
      ? (t: number): BaseTurn => {
          const b = base(t);
          const k = w(t);
          const o = b.offset;
          return {
            bend: (b.bend ?? 0) * k,
            pitch: (b.pitch ?? 0) * k,
            twist: (b.twist ?? 0) * k,
            ...(o ? { offset: [o[0] * k, o[1] * k, o[2] * k] as Vec3 } : {}),
          };
        }
      : undefined,
  } as ChainField);
}
