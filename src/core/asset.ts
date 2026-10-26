// The DSL's root: an asset is a TypeScript function that builds named parts into a scene.
// Code, not JSON — loops, helpers and composition are the point (docs/decisions/002).

import type { Asset, AssetDefinition, CompiledAsset } from './definition.ts';
import { Ts23dError } from './errors.ts';
import type { Mesh } from './mesh.ts';
import type { Lod, Part, PartOptions, UseOptions } from './part.ts';
import { createRng } from './rng.ts';

export * from './definition.ts';
export * from './part.ts';

export function defineAsset(def: AssetDefinition): Asset {
  if (!/^[a-z][a-z0-9_]*$/.test(def.name)) {
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `asset name '${def.name}' is not snake_case`,
      fix: 'rename it to [a-z][a-z0-9_]* — it becomes the GLB file name and the root node',
    });
  }
  return { ...def, __ts23d: 'asset' };
}

export const isAsset = (value: unknown): value is Asset =>
  typeof value === 'object' &&
  value !== null &&
  (value as { __ts23d?: unknown }).__ts23d === 'asset';

export function compile(asset: Asset, options: { lod?: Lod; seed?: number } = {}): CompiledAsset {
  const lod = options.lod ?? 0;
  const seed = options.seed ?? asset.seed ?? 1;
  const parts = new Map<string, Part>();
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
    });
  };
  const use = (child: Asset, o: UseOptions): void => {
    const sub = compile(child, { lod, seed: o.seed ?? seed });
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
      });
      const named = parts.get(`${o.prefix}_${p.name}`);
      if (named && (p.emitter || p.socket)) {
        parts.set(named.name, {
          ...named,
          ...(p.emitter ? { emitter: p.emitter } : {}),
          ...(p.socket ? { socket: p.socket } : {}),
        });
      }
    }
  };
  asset.build({
    lod,
    seed,
    rng: createRng(seed),
    pick: (perLod) => perLod[lod],
    part: add,
    group: (name, o) => add(name, null, o),
    emitter: (name, { at, parent, ...emitter }) => {
      add(name, null, { ...(at ? { at } : {}), ...(parent ? { parent } : {}) });
      const p = parts.get(name);
      if (p) parts.set(name, { ...p, emitter });
    },
    socket: (name, { at, parent, ...socket }) => {
      add(name, null, { ...(at ? { at } : {}), ...(parent ? { parent } : {}) });
      const p = parts.get(name);
      if (p) parts.set(name, { ...p, socket });
    },
    use,
  });
  return {
    name: asset.name,
    kind: asset.kind,
    lod,
    budget: asset.budget,
    real: asset.real ?? null,
    checks: asset.checks ?? [],
    parts: [...parts.values()],
  };
}
