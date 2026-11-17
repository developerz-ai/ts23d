// The ordering a Blender step program must keep (blender-steps.ts), checked on the normalised
// steps: what comes first and last, what needs what before it, what may follow `bind` and `lods`,
// and the cross-field rules of the finishing ops (a `joint` needs a point and a later `bind`,
// `weights`, `isolate` and the 'weights' / 'poses' review views need a `bind` before them, a bind from the
// source's own rig rules out `transform`). Every refusal is T3D_RECIPE_INVALID naming the step.

import { invalidStep } from './blender-step-fields.ts';

type Step = Readonly<Record<string, unknown>>;

const BUILD: readonly string[] = ['skinBody', 'metaballs'];
const ONCE: readonly string[] = ['retopo', 'uv', 'bake', 'bind', 'lods', 'export'];
const AFTER_BIND: readonly string[] = [
  'repose',
  'uv',
  'bake',
  'lods',
  'export',
  'weights',
  'isolate',
  'script',
  'review',
];
const AFTER_LODS: readonly string[] = ['export', 'review'];
const NEED_BIND: readonly string[] = ['weights', 'poses'];

function checkFinishing(steps: readonly Step[], ops: readonly string[], i: number): void {
  const s = steps[i] ?? {};
  const at = `step ${i} (${ops[i]})`;
  const bind = ops.indexOf('bind');
  if (ops[i] === 'joint') {
    if (s['head'] === undefined && s['tail'] === undefined)
      invalidStep(at, 'moves nothing', 'give head and / or tail (asset frame, metres)');
    if (bind < i)
      invalidStep(
        at,
        bind < 0 ? "has no 'bind' after it" : "comes after 'bind'",
        'move the bone before bind: the weights are computed from it',
      );
  }
  if ((ops[i] === 'weights' || ops[i] === 'isolate') && (bind < 0 || bind > i))
    invalidStep(at, "needs 'bind' before it", `bind first: ${ops[i]} edits the vertex groups`);
  if (ops[i] === 'review') {
    const views = (s['views'] as readonly string[] | undefined) ?? [];
    const needs = views.find((v) => NEED_BIND.includes(v));
    if (needs !== undefined && (bind < 0 || bind > i))
      invalidStep(at, `view '${needs}' needs 'bind' before it`, 'review after bind, or drop it');
    if (views.includes('poses') && !Array.isArray(s['poses']))
      invalidStep(at, "view 'poses' has no poses", "add poses: [{ bone, axis: 'x', degrees: 30 }]");
  }
  if (ops[i] === 'transform' && steps[bind]?.['from'] === 'source')
    invalidStep(
      at,
      "moves a mesh that keeps its source rig (bind from 'source')",
      'drop the transform: scale and turn the result in ts23d at import',
    );
}

/** Refuse a program whose steps are out of order. */
export function checkOrder(steps: readonly Step[]): void {
  const ops = steps.map((s) => String(s['op']));
  const at = (i: number): string => `step ${i} (${ops[i]})`;
  const first = (op: string): number => ops.indexOf(op);
  if (ops.at(-1) !== 'export')
    invalidStep(
      'program',
      ops.length ? `ends with '${ops.at(-1)}', not 'export'` : 'has no steps',
      "finish the list with { op: 'export' }",
    );
  ops.forEach((op, i) => {
    if (ONCE.includes(op) && first(op) !== i)
      invalidStep(at(i), `'${op}' appears twice`, `keep one ${op} step`);
    if (BUILD.includes(op) && i !== 0)
      invalidStep(at(i), 'a build op is not the first step', `move ${op} to the start`);
    checkFinishing(steps, ops, i);
    if (first('lods') >= 0 && i > first('lods') && !AFTER_LODS.includes(op))
      invalidStep(at(i), `comes after 'lods'`, 'make lods the last step before export');
    if (first('bind') >= 0 && i > first('bind') && !AFTER_BIND.includes(op))
      invalidStep(at(i), `changes the mesh after 'bind'`, 'bind after the geometry steps');
  });
  const before = (a: string, b: string, fix: string): void => {
    if (first(b) >= 0 && (first(a) < 0 || first(a) > first(b)))
      invalidStep(at(first(b)), `'${b}' needs '${a}' before it`, fix);
  };
  before('uv', 'bake', "add { op: 'uv' } before the bake: maps are baked into fresh UVs");
  if (first('retopo') > first('uv') && first('uv') >= 0)
    invalidStep(at(first('retopo')), `comes after 'uv'`, 'retopo first, then uv and bake');
  if (first('unweb') > first('retopo') && first('retopo') >= 0)
    invalidStep(at(first('unweb')), `comes after 'retopo'`, 'unweb cuts the source: before retopo');
  if (first('repose') >= 0 && (first('bind') < 0 || first('bind') > first('repose')))
    invalidStep(
      at(first('repose')),
      "needs 'bind' before it",
      'bind, then repose: it poses the bound mesh',
    );
  if (first('repose') >= 0 && first('bake') > first('repose'))
    invalidStep(
      at(first('bake')),
      "comes after 'repose'",
      'bake in the generated pose, then repose',
    );
  if (first('amputate') > first('retopo') && first('retopo') >= 0)
    invalidStep(
      at(first('amputate')),
      `comes after 'retopo'`,
      'amputate cuts the source: before retopo',
    );
}
