// Extra bone chains on a model body: what the animal has and the creature plan does not (wings,
// a second tail, fins, antennae). The recipe declares each chain by its joints along the mesh,
// root to tip, in the rest the mesh is bound in (the fitted rest, asset frame), the plan bone it
// hangs from, one joint limit per bone and where those ranges come from. modelRig appends the
// chain's bones to the fitted skeleton (model-rig.ts), so the Blender `bind` step weights the
// skin to them with every other bone, `repose` makes a `_l` / `_r` pair symmetric, QA `deform`
// poses the skin at their limits and QA `model` wants their joints inside the mesh. A skin with
// a bone that is neither the plan's nor declared here is still refused (model-body.ts).
// `motion` says how the creature's clips drive the chain (model-extra-clips.ts).

import { type Bone, type JointLimit, type Mesh, Ts23dError, type Vec3 } from '../core/index.ts';
import { MID } from './creature-helpers.ts';

/** How the clips move an extra chain: one looping clip of its own, and small parts in others. */
export interface ExtraMotion {
  /** Name of the chain's own clip (`flap`); chains sharing a name share the clip and its `hz`. */
  readonly clip: string;
  /** Cycles per second of that clip. */
  readonly hz: number;
  /** Per bone: degrees about its limit axis at the two ends of the stroke, [start, end]; the
   *  clip runs start → end → start. Inside the bone's limit. */
  readonly stroke: readonly (readonly [number, number])[];
  /** Share of the cycle the start → end half takes. Default 0.5. */
  readonly down?: number;
  /** Cycle fraction each bone trails the one before it. Default 0.08. */
  readonly lag?: number;
  /** Per bone: ± degrees in `idle`, with the breath (two per loop). Default none. */
  readonly idle?: readonly number[];
  /** Per bone: ± degrees in the gait clips, twice a stride (the body's bounce). Default none. */
  readonly carry?: readonly number[];
  /** Where `hz` and the stroke come from: a citation, or 'design value: …'. */
  readonly source: string;
}

export interface ExtraChain {
  /** Stem: the bones are `<prefix><name>_0`, `_1`, … A stem ending `_l` / `_r` is one of a pair. */
  readonly name: string;
  /** The plan bone the first bone hangs from, unprefixed (`spine_2`). */
  readonly parent: string;
  /** n + 1 points for n bones, root to tip, asset frame, in the rest the mesh is bound in. */
  readonly joints: readonly Vec3[];
  /** One per bone: hinge axis (asset frame) and range in degrees from the rest. */
  readonly limits: readonly JointLimit[];
  /** Where the ranges come from: a citation, or 'design value: …'. */
  readonly source: string;
  readonly motion?: ExtraMotion;
}

/** What a chain can be found on: the mesh the skeleton was fitted into and that skeleton. */
export interface ExtraFit {
  /** The registered mesh (asset frame, real size), unskinned. */
  readonly mesh: Mesh;
  /** The plan's bones as fitted into it (no helpers). */
  readonly fitted: readonly Bone[];
  /** The plan's height, metres. */
  readonly height: number;
  readonly prefix: string;
}

/** Declared chains, or a function that finds them on the fit. */
export type ExtraChains = readonly ExtraChain[] | ((fit: ExtraFit) => readonly ExtraChain[]);

const STEM = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

const invalid = (cause: string, fix: string): never => {
  throw new Ts23dError('T3D_RECIPE_INVALID', { cause: `extra chain ${cause}`, fix });
};

const within = (l: JointLimit, d: number): boolean => d >= l.min && d <= l.max;

function checkMotion(c: ExtraChain, m: ExtraMotion): void {
  const n = c.limits.length;
  const where = `'${c.name}' motion '${m.clip}'`;
  if (!STEM.test(m.clip) || !(m.hz > 0) || !Number.isFinite(m.hz))
    invalid(
      `${where}: needs a clip name (lower_snake) and hz > 0, got hz ${m.hz}`,
      "name the clip (e.g. 'flap') and give its cycles per second",
    );
  if (!m.source.trim())
    invalid(
      `${where}: no source`,
      "cite where hz and the stroke come from, or say 'design value: …'",
    );
  for (const [what, list] of [
    ['stroke', m.stroke],
    ['idle', m.idle],
    ['carry', m.carry],
  ] as const)
    if (list && list.length !== n)
      invalid(
        `${where}: ${what} has ${list.length} entries for ${n} bones`,
        `give one ${what} entry per bone, root to tip`,
      );
  c.limits.forEach((l, i) => {
    const [a, b] = m.stroke[i] ?? [0, 0];
    const sway = Math.max(Math.abs(m.idle?.[i] ?? 0), Math.abs(m.carry?.[i] ?? 0));
    if (![a, b, sway, -sway].every((d) => within(l, d)))
      invalid(
        `${where}: bone ${i} moves ${Math.min(a, b, -sway)}..${Math.max(a, b, sway)}° outside its limit ${l.min}..${l.max}°`,
        'narrow the stroke, or widen the limit (QA `deform` poses the skin at the limit)',
      );
  });
  if (!((m.down ?? 0.5) > 0 && (m.down ?? 0.5) < 1) || !((m.lag ?? 0) >= 0 && (m.lag ?? 0) < 1))
    invalid(`${where}: down and lag are cycle fractions`, 'give down in (0, 1) and lag in [0, 1)');
}

/** The declared chains (a function is run on the fit), each checked on its own. */
export function resolveExtra(extra: ExtraChains | undefined, fit: ExtraFit): readonly ExtraChain[] {
  const chains = typeof extra === 'function' ? extra(fit) : (extra ?? []);
  const seen = new Set<string>();
  for (const c of chains) {
    if (!STEM.test(c.name) || c.name.endsWith(MID) || seen.has(c.name))
      invalid(
        `'${c.name}': the name must be a lower_snake stem, unique, not ending '${MID}'`,
        "name it after the limb, e.g. 'wing_l', 'wing_r', 'fin'",
      );
    seen.add(c.name);
    if (!c.source.trim())
      invalid(
        `'${c.name}': no source for its limits`,
        "cite where the ranges come from, or say 'design value: …'",
      );
    if (c.joints.length < 2 || c.limits.length !== c.joints.length - 1)
      invalid(
        `'${c.name}': ${c.joints.length} joints and ${c.limits.length} limits`,
        'give n + 1 joints (root to tip) and n limits for n bones',
      );
    c.joints.forEach((p, i) => {
      const q = c.joints[i + 1];
      if (
        !p.every(Number.isFinite) ||
        (q && Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < 1e-3)
      )
        invalid(
          `'${c.name}': joint ${i} is not finite or sits on the next one`,
          'give each joint its own place along the limb, in metres',
        );
    });
    if (c.motion) checkMotion(c, c.motion);
  }
  return chains;
}

/** The chains' bones, to append to the fitted skeleton (parents first). */
export function extraBones(
  chains: readonly ExtraChain[],
  fitted: readonly Bone[],
  prefix: string,
): Bone[] {
  const names = new Set(fitted.map((b) => b.name));
  return chains.flatMap((c) => {
    if (!names.has(`${prefix}${c.parent}`))
      invalid(
        `'${c.name}': the fitted skeleton has no bone '${prefix}${c.parent}' to hang from`,
        `use one of: ${fitted.map((b) => b.name.slice(prefix.length)).join(', ')}`,
      );
    return c.limits.map((limit, i): Bone => {
      const name = `${prefix}${c.name}_${i}`;
      if (names.has(name))
        invalid(
          `'${c.name}': the skeleton already has a bone '${name}'`,
          "pick a stem the plan does not use (the plan owns 'tail', 'fore_l', 'spine' …)",
        );
      names.add(name);
      return {
        name,
        parent: i === 0 ? `${prefix}${c.parent}` : `${prefix}${c.name}_${i - 1}`,
        head: c.joints[i] as Vec3,
        tail: c.joints[i + 1] as Vec3,
        limit,
      };
    });
  });
}

/** Names of the bones the chains add. */
export const extraNames = (chains: readonly ExtraChain[], prefix: string): string[] =>
  chains.flatMap((c) => c.limits.map((_, i) => `${prefix}${c.name}_${i}`));
