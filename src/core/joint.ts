// Joint declarations: validate `ctx.joint(name, …)` and re-frame a child's joints when it is
// instanced with `ctx.use` (prefixed names, the instance's offset and yaw).

import { Ts23dError } from './errors.ts';
import type { Joint, JointOptions } from './part.ts';
import { checkTolerance, TOLERANCE } from './validate-asset.ts';
import { toWorld, type WorldTransform } from './world.ts';

const finite = (v: readonly number[]): boolean => v.length === 3 && v.every(Number.isFinite);

export function jointOf(asset: string, name: string, o: JointOptions): Joint {
  const bad = (cause: string, fix: string): never => {
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `joint '${name}' in '${asset}': ${cause}`,
      fix,
    });
  };
  if (!/^[a-z][a-z0-9_]*$/.test(name)) bad('name is not snake_case', 'rename it, e.g. wrist_l');
  if (!o.from || !o.to || o.from === o.to)
    bad(
      `needs two different parts, got from '${o.from}' to '${o.to}'`,
      "name both sides: { from: 'forearm', to: 'hand' }",
    );
  if (!finite(o.at))
    bad('`at` is not a finite point', 'pass the joint centre in metres, e.g. at: [0.3, 0, 1.1]');
  const len = Math.hypot(...o.axis);
  if (!finite(o.axis) || len < 1e-9)
    bad(
      '`axis` is zero or not finite',
      'pass the direction from `from` to `to`, e.g. axis: [1, 0, 0]',
    );
  checkTolerance(o.tolerance, TOLERANCE.joint, o.why, `joint '${name}' in '${asset}'`);
  return {
    name,
    from: o.from,
    to: o.to,
    at: [o.at[0], o.at[1], o.at[2]],
    axis: [o.axis[0] / len, o.axis[1] / len, o.axis[2] / len],
    ...(o.tolerance !== undefined ? { tolerance: o.tolerance } : {}),
    ...(o.kind ? { kind: o.kind } : {}),
  };
}

/** A child asset's joint seen from the parent: prefixed names, moved by the instance transform. */
export function useJoint(j: Joint, prefix: string, xf: WorldTransform): Joint {
  const dir = toWorld({ origin: [0, 0, 0], yaw: xf.yaw }, j.axis);
  return {
    ...j,
    name: `${prefix}_${j.name}`,
    from: `${prefix}_${j.from}`,
    to: `${prefix}_${j.to}`,
    at: toWorld(xf, j.at),
    axis: dir,
  };
}
