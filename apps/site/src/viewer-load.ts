// The viewer's load step: compile the asset in the worker pool, read its engine hooks, pick the
// scenario, and in Scene mode also compile the diorama base it stands on. No three.js staging here.

import type { AnimationClip } from 'three';
import { type BuildRequest, type Loaded, loadBuilt } from './compile.ts';
import type { Weighed } from './lod-policy.ts';
import { type Hooks, readHooks } from './scenarios/hooks.ts';
import { pickScenario } from './scenarios/pick.ts';
import type { ScenarioDef } from './scenarios/types.ts';
import { disposeTree } from './stage.ts';

/** What the viewer shows: an asset by name, its recipe entry file and its committed weights. */
export interface Subject extends Weighed {
  readonly name: string;
  readonly file?: string;
}

export interface Staged {
  readonly loaded: Loaded;
  readonly clip: AnimationClip | null;
  readonly hooks: Hooks;
  readonly def: ScenarioDef;
  /** The diorama base (Scene mode), else null. */
  readonly base: Loaded | null;
}

export async function loadStaged(
  asset: Subject,
  request: BuildRequest,
  scene: boolean,
): Promise<Staged> {
  const loaded = await loadBuilt(request);
  const clip = loaded.animations.find((c) => c.name === 'run') ?? null;
  const hooks = readHooks(loaded.scene, asset.kind, clip);
  const def = pickScenario(hooks);
  const base = scene
    ? await loadBuilt({
        target: { kind: 'diorama', name: `${asset.name}_${def.id}`, footprint: def.ground(hooks) },
        lod: 0,
        animations: false,
      })
    : null;
  return { loaded, clip, hooks, def, base };
}

export function disposeStaged(s: Staged): void {
  disposeTree(s.loaded.scene);
  if (s.base) disposeTree(s.base.scene);
}
