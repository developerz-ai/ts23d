// Check builders: a recipe states its physical intent in code and QA enforces it at every LOD.
//   checks: [clear('track_*', 'hull_*'), noOverlap('road_wheel_l_*'), touches('turret_body', 'hull_top'),
//            symmetric('_l', '_r', 'y')]
// Each returns a core `Check`; write your own the same way: (asset) => CheckFinding[].

import type { Check, CheckFinding } from '../core/index.ts';
import { type Inspector, inspect } from './inspect.ts';

// One inspector per compiled asset, shared by every check (its caches are the speed).
const inspectors = new WeakMap<object, Inspector>();
const inspectorFor = (asset: Parameters<Check>[0]): Inspector => {
  const hit = inspectors.get(asset);
  if (hit) return hit;
  const made = inspect(asset);
  inspectors.set(asset, made);
  return made;
};

const CLASH = 0.01;

/** Nothing matching `a` sinks into anything matching `b` (closed solids), with optional min gap. */
export const clear =
  (a: string, b: string, minGap = 0): Check =>
  (asset) => {
    const q = inspectorFor(asset);
    const out: CheckFinding[] = [];
    for (const pa of q.parts(a)) {
      for (const pb of q.parts(b)) {
        if (pa === pb) continue;
        const pen = q.penetration(pa, pb);
        if (pen.depth > CLASH) {
          out.push({
            part: pa,
            message: `'${pa}' sinks ${(pen.depth * 100).toFixed(1)} cm into '${pb}'`,
            fix: `move '${pa}' out of '${pb}' (or shrink one); they are declared clear of each other`,
          });
        } else if (minGap > 0) {
          const d = q.distance(pa, pb, minGap);
          if (d < minGap)
            out.push({
              part: pa,
              message: `'${pa}' is ${(d * 100).toFixed(1)} cm from '${pb}', needs ≥ ${minGap * 100} cm`,
              fix: 'open the gap — running clearance, mud, suspension travel',
            });
        }
      }
    }
    return out;
  };

/** No two parts matching the selector interpenetrate (interleaved wheels, stacked crates). */
export const noOverlap =
  (selector: string): Check =>
  (asset) => {
    const names = inspectorFor(asset).parts(selector);
    return names.flatMap((a, i) => names.slice(i + 1).flatMap((b) => clear(a, b)(asset)));
  };

/** `a` must touch `b` (surface within 2 cm): a turret sits on its ring, a lamp on its post. */
export const touches =
  (a: string, b: string, eps = 0.02): Check =>
  (asset) => {
    const q = inspectorFor(asset);
    // A part dropped at this LOD (detail gating) has nothing to touch: the check doesn't apply.
    if (q.parts(a).length === 0 || q.parts(b).length === 0) return [];
    const d = q.distance(a, b, 1);
    return d <= eps
      ? []
      : [
          {
            part: a,
            message: `'${a}' should touch '${b}' but is ${(d * 100).toFixed(1)} cm away`,
            fix: `seat '${a}' on '${b}'`,
          },
        ];
  };

/** Every part containing `left` has a mirror part (with `right`) reflected across the axis plane. */
export const symmetric =
  (left: string, right: string, axis: 'x' | 'y' | 'z' = 'y', tol = 0.02): Check =>
  (asset) => {
    const q = inspectorFor(asset);
    const k = ({ x: 0, y: 1, z: 2 } as const)[axis];
    // Side tokens are whole name segments: `_l` matches `wheel_l_3` and `rod_l`, never `axle_lead`.
    const token = new RegExp(`${left.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=_|$)`);
    return q
      .parts('*')
      .filter((n) => token.test(n))
      .flatMap((l): CheckFinding[] => {
        const r = l.replace(token, right);
        const bl = q.bounds(l);
        const br = q.bounds(r);
        if (!bl || !br)
          return [{ part: l, message: `'${l}' has no mirror '${r}'`, fix: `add '${r}' or rename` }];
        const off = Math.abs(bl.min[k] + br.max[k]) + Math.abs(bl.max[k] + br.min[k]);
        return off > tol * 2
          ? [
              {
                part: l,
                message: `'${l}' and '${r}' are not mirrored across ${axis}=0 (off by ${(off * 50).toFixed(1)} cm)`,
                fix: 'build one side and mirror it — place(mesh, { scale: [1, -1, 1] }) flips winding; prefer reusing the same builder with a sign',
              },
            ]
          : [];
      });
  };

/** Run a recipe's checks; the QA gate calls this. */
export const runChecks = (asset: Parameters<Check>[0]): CheckFinding[] =>
  asset.checks.flatMap((c) => [...c(asset)]);
