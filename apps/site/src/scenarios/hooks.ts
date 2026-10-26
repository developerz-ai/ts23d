// What a scenario may rely on: the asset's kind, its named GLB nodes, its baked clip, its emitters
// and its size. Read once from the loaded, unmoved model.

import type { Emitter } from '@developerz-ai/ts23d';
import { type AnimationClip, Box3, type Object3D, Vector3 } from 'three';
import { emitterOf } from '../particles.ts';

export interface Hooks {
  readonly kind: string;
  readonly root: Object3D;
  readonly clip: AnimationClip | null;
  readonly emitters: readonly { readonly node: Object3D; readonly spec: Emitter }[];
  /** glTF-frame bounds of the unmoved model: x = width (left), y = height, z = length (front). */
  readonly size: Vector3;
  readonly center: Vector3;
  readonly min: Vector3;
  node(name: string): Object3D | null;
  all(pattern: RegExp): Object3D[];
  /** `wheel_l_3` → `wheel`, collapsed with counts: "wheel_* × 16". */
  families(pattern: RegExp): string;
}

const family = (name: string): string => name.replace(/(_[lr])?(_\d+)*$/, '');

export function readHooks(root: Object3D, kind: string, clip: AnimationClip | null): Hooks {
  root.updateMatrixWorld(true);
  const named = new Map<string, Object3D>();
  const emitters: { node: Object3D; spec: Emitter }[] = [];
  root.traverse((n) => {
    if (n.name && !named.has(n.name)) named.set(n.name, n);
    const spec = emitterOf(n);
    if (spec) emitters.push({ node: n, spec });
  });
  const box = new Box3().setFromObject(root);
  const all = (pattern: RegExp): Object3D[] =>
    [...named.values()].filter((n) => pattern.test(n.name));
  return {
    kind,
    root,
    clip,
    emitters,
    size: box.getSize(new Vector3()),
    center: box.getCenter(new Vector3()),
    min: box.min.clone(),
    node: (name) => named.get(name) ?? null,
    all,
    families(pattern) {
      const counts = new Map<string, number>();
      for (const n of all(pattern))
        counts.set(family(n.name), (counts.get(family(n.name)) ?? 0) + 1);
      return [...counts].map(([f, c]) => (c > 1 ? `${f}_* × ${c}` : f)).join(', ');
    },
  };
}

/** Emitter names grouped by kind for the overlay: "emitters: smoke, dust, muzzle". */
export function emitterSummary(h: Hooks): string {
  const kinds = [...new Set(h.emitters.map((e) => e.spec.kind))];
  return kinds.length ? ` · emitters: ${kinds.join(', ')}` : '';
}

/** A diorama footprint (authoring space) centred on the model, `hx` along the front axis. */
export function footprint(
  h: Hooks,
  hx: number,
  hy: number,
): { cx: number; cy: number; hx: number; hy: number } {
  // glTF → authoring: x_auth = z, y_auth = x.
  return { cx: h.center.z, cy: h.center.x, hx, hy };
}
