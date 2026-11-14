// The DSL's root: an asset is a TypeScript function that builds named parts into a scene.
// Code, not JSON — loops, helpers and composition are the point (docs/decisions/002).

import type { Asset, AssetDefinition, AssetMeta, CompiledAsset } from './definition.ts';
import { Ts23dError } from './errors.ts';
import { checkFinishedParts, finishesOf } from './finish.ts';
import { jointOf, useJoint } from './joint.ts';
import type { Mesh } from './mesh.ts';
import { opticsOf } from './optics.ts';
import { checkPaintedParts, paintSetOf, repaint } from './paint.ts';
import type { Connect, Joint, Lod, Part, PartOptions, UseOptions } from './part.ts';
import { checkSeed, createRng, forkSeed } from './rng.ts';
import { checkTune, type TunedValues, tunedReader } from './tune.ts';
import { checkAsset, checkCompileOptions, checkPivotName } from './validate-asset.ts';
import type { WeatherCoverage } from './weather-coverage.ts';
import { worldTransforms } from './world.ts';

export * from './definition.ts';
export * from './finish.ts';
export * from './optics.ts';
export * from './paint.ts';
export * from './part.ts';
export * from './tune.ts';
export { checkTolerance, ROOT_PART, TOLERANCE } from './validate-asset.ts';
export type { WeatherCoverage } from './weather-coverage.ts';

export function defineAsset(def: AssetDefinition): Asset {
  checkAsset(def);
  if (def.tune) checkTune(def.name, def.tune);
  return { ...def, __ts23d: 'asset' };
}

export const isAsset = (value: unknown): value is Asset =>
  typeof value === 'object' &&
  value !== null &&
  (value as { __ts23d?: unknown }).__ts23d === 'asset';

export interface CompileOptions {
  readonly lod?: Lod;
  readonly seed?: number;
  /** Preview one livery: painted vertex colours show variant `name` (renders, not GLB export). */
  readonly variant?: string;
  /** Trial values for `tune.params` (the optimiser); beat the committed tune.json. */
  readonly tuned?: TunedValues;
}

export function compile(asset: Asset, options: CompileOptions = {}): CompiledAsset {
  const lod = options.lod ?? 0;
  const seed = options.seed ?? asset.seed ?? 1;
  checkCompileOptions(asset.name, lod, seed);
  const paintSet = paintSetOf(asset.name, asset.paint, asset.variants);
  const finishes = finishesOf(asset.name, asset.finishes);
  const optics = opticsOf(asset.name, asset.optics);
  const parts = new Map<string, Part>();
  const joints = new Map<string, Joint>();
  const weather: WeatherCoverage[] = [];
  const joint = (j: Joint): void => {
    if (joints.has(j.name))
      throw new Ts23dError('T3D_PART_DUPLICATE', {
        cause: `joint '${j.name}' was declared twice in '${asset.name}'`,
        fix: 'give each joint a unique name — wrist_l, wrist_r, grip',
      });
    joints.set(j.name, j);
  };
  const add = (name: string, mesh: Mesh | null, o: PartOptions = {}): void => {
    if (parts.has(name)) {
      throw new Ts23dError('T3D_PART_DUPLICATE', {
        cause: `part '${name}' was added twice in '${asset.name}'`,
        fix: 'give each part a unique name — suffix the loop index, e.g. wheel_0, wheel_1',
      });
    }
    if (o.parent !== undefined && !parts.has(o.parent)) {
      throw new Ts23dError('T3D_PART_UNKNOWN', {
        cause: `part '${name}' parents to '${o.parent}', which does not exist yet`,
        fix: 'add the parent (ctx.group or ctx.part) before its children',
      });
    }
    checkPivotName(asset.name, name, mesh, o);
    if (o.motion && o.yaw) {
      throw new Ts23dError('T3D_RECIPE_INVALID', {
        cause: `part '${name}' sets both yaw and motion`,
        fix: 'put the yaw on a parent ctx.group and the motion on the part inside it',
      });
    }
    parts.set(name, {
      name,
      mesh,
      at: o.at ?? [0, 0, 0],
      parent: o.parent ?? null,
      yaw: o.yaw ?? 0,
      motion: o.motion ?? null,
      ...(o.clearOf ? { clearOf: o.clearOf } : {}),
      ...(o.surface && o.surface !== 'opaque' ? { surface: o.surface } : {}),
      ...(o.paint !== undefined ? { paint: o.paint } : {}),
      ...(o.finish !== undefined ? { finish: o.finish } : {}),
      ...(o.collider !== undefined ? { collider: o.collider } : {}),
      ...(o.density !== undefined ? { density: o.density } : {}),
      ...(o.shell !== undefined ? { shell: o.shell } : {}),
      ...(o.connect ? { connect: connectOf(asset.name, name, o.connect) } : {}),
      ...(o.sound ? { sound: o.sound } : {}),
    });
  };
  const use = (child: Asset, o: UseOptions): void => {
    if (o.seed !== undefined) checkSeed(o.seed, `ctx.use('${o.prefix}') seed`);
    // Own seed, else the child's, else a stream forked by prefix: siblings and parent never share.
    const sub = compile(child, { lod, seed: o.seed ?? child.seed ?? forkSeed(seed, o.prefix) });
    add(o.prefix, null, {
      at: o.at ?? [0, 0, 0],
      yaw: o.yaw ?? 0,
      ...(o.parent ? { parent: o.parent } : {}),
    });
    for (const p of sub.parts) {
      add(`${o.prefix}_${p.name}`, p.mesh, {
        at: p.at,
        yaw: p.yaw,
        parent: p.parent ? `${o.prefix}_${p.parent}` : o.prefix,
        ...(p.motion ? { motion: p.motion } : {}),
        ...(p.surface ? { surface: p.surface } : {}),
        ...(p.clearOf ? { clearOf: p.clearOf.map((c) => `${o.prefix}_${c}`) } : {}),
        // A child's slot carries over only if this asset declares it too (else: plain colour).
        ...(p.paint && paintSet?.paint[p.paint] ? { paint: p.paint } : {}),
        ...(p.finish && finishes?.[p.finish] ? { finish: p.finish } : {}),
        ...(p.collider ? { collider: p.collider } : {}),
        ...(p.density !== undefined ? { density: p.density } : {}),
        ...(p.shell !== undefined ? { shell: p.shell } : {}),
        ...(p.connect
          ? {
              connect: p.connect.to
                ? { ...p.connect, to: `${o.prefix}_${p.connect.to}` }
                : p.connect,
            }
          : {}),
        ...(p.sound ? { sound: p.sound } : {}),
      });
      const named = parts.get(`${o.prefix}_${p.name}`);
      if (named && (p.emitter || p.socket || p.audio)) {
        parts.set(named.name, {
          ...named,
          ...(p.emitter ? { emitter: p.emitter } : {}),
          ...(p.audio ? { audio: p.audio } : {}),
          ...(p.socket ? { socket: p.socket } : {}),
        });
      }
    }
    for (const w of sub.weather ?? []) weather.push({ ...w, target: `${o.prefix}_${w.target}` });
    if (sub.joints?.length) {
      const xf = worldTransforms([...parts.values()]).get(o.prefix);
      for (const j of sub.joints) if (xf) joint(useJoint(j, o.prefix, xf));
    }
  };
  asset.build({
    lod,
    seed,
    rng: createRng(seed),
    tuned: tunedReader(asset.name, asset.tune, options.tuned),
    pick: (perLod) => perLod[lod],
    part: add,
    group: (name, o) => add(name, null, o),
    emitter: (name, { at, parent, ...emitter }) => {
      add(name, null, { ...(at ? { at } : {}), ...(parent ? { parent } : {}) });
      const p = parts.get(name);
      // A sound source rides `audio` so particle readers (extras, the gallery) never see it.
      if (p)
        parts.set(name, emitter.kind === 'sound' ? { ...p, audio: emitter } : { ...p, emitter });
    },
    socket: (name, { at, parent, ...socket }) => {
      add(name, null, { ...(at ? { at } : {}), ...(parent ? { parent } : {}) });
      const p = parts.get(name);
      if (p) parts.set(name, { ...p, socket });
    },
    use,
    joint: (name, o) => joint(jointOf(asset.name, name, o)),
    weathered: (coverage) => {
      weather.push(...coverage);
    },
  });
  const built = [...parts.values()];
  checkPaintedParts(asset.name, built, paintSet);
  checkFinishedParts(asset.name, built, finishes);
  const variant = options.variant;
  return {
    name: asset.name,
    kind: asset.kind,
    lod,
    budget: asset.budget,
    real: asset.real ?? null,
    checks: asset.checks ?? [],
    parts: variant === undefined ? built : repaint(asset.name, built, paintSet, variant),
    ...metaOf(asset),
    ...(asset.glow?.length ? { glow: asset.glow } : {}),
    ...(asset.lodCoverage ? { lodCoverage: asset.lodCoverage } : {}),
    ...(paintSet ? { paintSet } : {}),
    ...(finishes ? { finishes } : {}),
    ...(optics ? { optics } : {}),
    ...(variant !== undefined ? { variant } : {}),
    ...(asset.gaps?.length ? { gaps: asset.gaps } : {}),
    ...(asset.creases?.length ? { creases: asset.creases } : {}),
    ...(joints.size ? { joints: [...joints.values()] } : {}),
    ...(asset.physics ? { physics: asset.physics } : {}),
    ...(weather.length ? { weather } : {}),
  };
}

function connectOf(asset: string, part: string, c: Connect): Connect {
  if (c.as === 'free' && !c.why?.trim())
    throw new Ts23dError('T3D_CONNECT_INVALID', {
      cause: `part '${part}' in '${asset}' is connect: free without a why`,
      fix: "say why it is meant to be loose: connect: { as: 'free', why: 'debris on the deck' }",
    });
  return c;
}

function metaOf(a: Asset): { meta?: AssetMeta } {
  const meta: AssetMeta = {
    ...(a.description ? { description: a.description } : {}),
    ...(a.sources?.length ? { sources: a.sources } : {}),
    ...(a.license ? { license: a.license } : {}),
    ...(a.copyright ? { copyright: a.copyright } : {}),
    ...(a.creators?.length ? { creators: a.creators } : {}),
  };
  return Object.keys(meta).length ? { meta } : {};
}
