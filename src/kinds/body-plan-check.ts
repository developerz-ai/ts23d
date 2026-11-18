// Validates a BodyPlanSpec before anything is built: names, stations, radii, link counts, repeats,
// and that each chain hangs from an earlier chain's real link. A copy may be named directly
// (`arm_3`, `fin_l`); naming a repeated chain needs a child repeated the same way, so copy k hangs
// from parent copy k. `length` must fit the body: from about the root chain's arc up to the longest
// root-to-tip run of chains. Every refusal is T3D_RECIPE_INVALID with a fix.

import { Ts23dError, type Vec3 } from '../core/index.ts';
import { chainCopies, chainCurve, linkStops } from './body-plan-curve.ts';
import type { BodyPlanSpec, ChainRepeat, ChainSpec } from './body-plan-types.ts';

const NAME = /^[a-z][a-z0-9_]*$/;
/** How far `length` may sit under the root chain's arc, or over the longest run of chains. */
const LENGTH_UNDER = 0.75;
const LENGTH_OVER = 1.15;

function fail(cause: string, fix: string): never {
  throw new Ts23dError('T3D_RECIPE_INVALID', { cause: `body plan: ${cause}`, fix });
}

const finite = (v: Vec3): boolean => v.length === 3 && v.every(Number.isFinite);

function checkRepeat(c: ChainSpec, r: ChainRepeat): void {
  if (r.kind === 'mirror') return;
  if (!(Number.isInteger(r.count) && r.count >= 2))
    fail(`chain '${c.name}' radial count is ${r.count}`, 'use a whole count of 2 or more');
  if (!finite(r.axis) || Math.hypot(...r.axis) < 1e-9)
    fail(`chain '${c.name}' radial axis is zero or not finite`, 'pass a direction, e.g. [0, 0, 1]');
  if (!finite(r.about))
    fail(`chain '${c.name}' radial centre is not finite`, 'pass a point, e.g. [0, 0, 0.4]');
  if (r.start !== undefined && !Number.isFinite(r.start))
    fail(`chain '${c.name}' radial start is ${r.start}`, 'give the first turn in radians');
}

function checkChain(c: ChainSpec): void {
  const at = `chain '${c.name}'`;
  if (!NAME.test(c.name)) fail(`${at} is not snake_case`, 'rename it [a-z][a-z0-9_]*');
  if (c.path.length < 2) fail(`${at} has ${c.path.length} station(s)`, 'give at least 2');
  c.path.forEach((p, i) => {
    if (!finite(p)) fail(`${at} station ${i} is not a finite point`, 'pass metres: [x, y, z]');
    const q = c.path[i - 1];
    if (q && Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 1e-6)
      fail(`${at} stations ${i - 1} and ${i} coincide`, 'drop the repeated station');
  });
  if (c.radius.length !== c.path.length)
    fail(
      `${at} has ${c.path.length} stations but ${c.radius.length} radii`,
      'give one radius per station',
    );
  if (c.radius.some((r) => !(Number.isFinite(r) && r >= 0)) || !c.radius.some((r) => r > 0))
    fail(`${at} radii must be >= 0 with at least one > 0`, 'give half-widths in metres');
  if (!(Number.isInteger(c.links) && c.links >= 1))
    fail(`${at} has ${c.links} links`, 'use a whole number of 1 or more');
  if (c.bias !== undefined && !(Number.isFinite(c.bias) && c.bias > 0))
    fail(`${at} bias is ${c.bias}`, 'use a number > 0 (1 spaces links evenly)');
  if (c.flatten !== undefined && !(Number.isFinite(c.flatten) && c.flatten > 0))
    fail(`${at} flatten is ${c.flatten}`, 'use height ÷ width > 0 (1 is round)');
  if (Number.isFinite(c.bias ?? 1) && (c.bias ?? 1) > 0) {
    const stops = linkStops(c.links, c.bias);
    if (stops.some((u, i) => i > 0 && !(u > (stops[i - 1] ?? 0))))
      fail(
        `${at} has link joints that collapse onto each other at bias ${c.bias}: some bones would have no length`,
        'lower `bias` or use fewer links, so every joint keeps its own place on the chain',
      );
  }
  if (c.repeat) checkRepeat(c, c.repeat);
  if (c.blend !== undefined && !(Number.isFinite(c.blend) && c.blend >= 0))
    fail(`${at} blend is ${c.blend}`, 'give a fillet radius in metres, 0 or more');
  if (c.uvBands !== undefined && !(Number.isInteger(c.uvBands) && c.uvBands >= 1))
    fail(`${at} uvBands is ${c.uvBands}`, 'use a whole number of 1 or more');
  for (const n of [...(c.detail?.rings ?? []), ...(c.detail?.sides ?? [])])
    if (!(Number.isInteger(n) && n >= 1))
      fail(`${at} detail has ${n}`, 'give whole rings per link and sides per ring, 1 or more');
  for (const n of c.detail?.sides ?? [])
    if (n < 3) fail(`${at} has ${n} sides`, 'a closed section needs at least 3');
}

/** `length` against the body it names: the L every motion number is a fraction of. */
function checkLength(s: BodyPlanSpec): void {
  const arcs = new Map(s.chains.map((c) => [c.name, chainCurve(c).length]));
  const run = new Map<string, number>();
  for (const c of s.chains) {
    const host = c.parent
      ? s.chains.find(
          (e) =>
            e.name === c.parent?.chain ||
            chainCopies(e).some((copy) => copy.id === c.parent?.chain),
        )
      : undefined;
    run.set(c.name, (arcs.get(c.name) ?? 0) + (host ? (run.get(host.name) ?? 0) : 0));
  }
  const root = arcs.get(s.chains[0]?.name ?? '') ?? 0;
  const longest = Math.max(...run.values());
  if (s.length < root * LENGTH_UNDER || s.length > longest * LENGTH_OVER)
    fail(
      `length ${s.length} m does not fit a body whose root chain is ${root.toFixed(2)} m and whose longest run of chains is ${longest.toFixed(2)} m`,
      'give the length along the trunk in metres: every motion number is a fraction of it',
    );
}

const sameRepeat = (a: ChainRepeat | undefined, b: ChainRepeat | undefined): boolean =>
  a?.kind === b?.kind && (a?.kind !== 'radial' || b?.kind !== 'radial' || a.count === b.count);

function checkParent(c: ChainSpec, earlier: readonly ChainSpec[]): void {
  const at = `chain '${c.name}'`;
  const p = c.parent;
  if (!p) fail(`${at} has no parent`, 'only the first chain is the root: give it a parent');
  const named = earlier.find((e) => e.name === p.chain);
  const host = named ?? earlier.find((e) => chainCopies(e).some((copy) => copy.id === p.chain));
  if (!host)
    fail(
      `${at} hangs from unknown chain '${p.chain}'`,
      `list parents first and name one of: ${earlier.map((e) => e.name).join(', ')}`,
    );
  if (!(Number.isInteger(p.link) && p.link >= 0 && p.link < host.links))
    fail(
      `${at} hangs from link ${p.link} of '${p.chain}', which has ${host.links}`,
      `use a link in 0..${host.links - 1}`,
    );
  if (named?.repeat && !sameRepeat(named.repeat, c.repeat))
    fail(
      `${at} hangs from repeated chain '${p.chain}' but is not repeated the same way`,
      `repeat it the same way, or name one copy: ${chainCopies(named)[0]?.id}`,
    );
}

export function checkBodyPlan(s: BodyPlanSpec): void {
  if (!NAME.test(s.name)) fail(`name '${s.name}' is not snake_case`, 'rename it [a-z][a-z0-9_]*');
  if (!(Number.isFinite(s.length) && s.length > 0))
    fail(`length is ${s.length}`, 'give the trunk length in metres');
  const root = s.chains[0];
  if (!root) fail('it has no chains', 'give at least a root chain');
  if (root.parent)
    fail(`root chain '${root.name}' has a parent`, 'drop it: the first chain is the root');
  if (root.repeat)
    fail(`root chain '${root.name}' is repeated`, 'a body has one root: drop `repeat`');
  // Parents and skins are looked up by name: two chains under one name would be confused.
  const names = new Set<string>();
  for (const c of s.chains) {
    if (names.has(c.name))
      fail(`two chains are named '${c.name}'`, 'give every chain its own name');
    names.add(c.name);
  }
  s.chains.forEach((c, i) => {
    checkChain(c);
    if (i > 0) checkParent(c, s.chains.slice(0, i));
  });
  const seen = new Set<string>();
  for (const c of s.chains)
    for (const copy of chainCopies(c))
      for (let i = 0; i < c.links; i++) {
        const bone = `${copy.id}_${i}`;
        if (seen.has(bone))
          fail(`two chains make bone '${bone}'`, `rename chain '${c.name}' so bones stay unique`);
        seen.add(bone);
      }
  checkLength(s);
}
