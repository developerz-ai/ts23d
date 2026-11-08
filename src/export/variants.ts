// Paint slots → glTF materials, and liveries → KHR_materials_variants (Ratified). Each slot gets a
// default material (baseColorFactor = slot colour); each distinct repaint gets one more. The root
// lists the variants; every painted primitive maps variant indices to its slot's materials. A
// loader without the extension shows the default paint. Never in extensionsRequired. A lacquered
// slot (clearcoat, flake) keeps its lacquer in every livery.

import { type CompiledAsset, type Mesh, type PaintSet, type Part, tone } from '../core/index.ts';
import type { Json } from './bin-writer.ts';
import { paintMaterial } from './materials.ts';

export const MATERIALS_VARIANTS = 'KHR_materials_variants';

export interface PaintPlan {
  /** Materials to append after the trim and glow materials, starting at the given index. */
  readonly materials: readonly Json[];
  /** Default material index of a slot. */
  readonly slotMaterial: ReadonlyMap<string, number>;
  /** `extensions` of a primitive painted with `slot` (undefined: no variant repaints it). */
  readonly primitiveExtensions: (slot: string) => Json | undefined;
  /** Root `extensions.KHR_materials_variants`, or null when the asset has no variants. */
  readonly root: Json | null;
}

const NONE: PaintPlan = {
  materials: [],
  slotMaterial: new Map(),
  primitiveExtensions: () => undefined,
  root: null,
};

const same = (a: readonly number[], b: readonly number[]): boolean => a.every((v, i) => v === b[i]);

export function paintPlan(set: PaintSet | undefined, start: number, withSheet: boolean): PaintPlan {
  if (!set) return NONE;
  const materials: Json[] = [];
  const slotMaterial = new Map<string, number>();
  for (const [slot, color] of Object.entries(set.paint)) {
    slotMaterial.set(slot, start + materials.length);
    materials.push(paintMaterial(`ts23d_paint_${slot}`, color, withSheet, set.finish?.[slot]));
  }
  const names = Object.keys(set.variants);
  // slot → [material, variant indices][] in first-use order.
  const mappings = new Map<string, { material: number; variants: number[] }[]>();
  names.forEach((v, vi) => {
    for (const [slot, color] of Object.entries(set.variants[v] ?? {})) {
      const base = set.paint[slot];
      const def = slotMaterial.get(slot);
      if (!base || def === undefined) continue;
      const list = mappings.get(slot) ?? [];
      mappings.set(slot, list);
      let material = def;
      if (!same(color, base)) {
        // Reuse a material another variant already made for this slot + colour.
        const prior = list.find((m) => {
          const f = (materials[m.material - start]?.['pbrMetallicRoughness'] as Json | undefined)?.[
            'baseColorFactor'
          ] as number[] | undefined;
          return m.material !== def && f !== undefined && same(color, f);
        });
        if (prior) material = prior.material;
        else {
          material = start + materials.length;
          materials.push(
            paintMaterial(`ts23d_paint_${slot}_${v}`, color, withSheet, set.finish?.[slot]),
          );
        }
      }
      const hit = list.find((m) => m.material === material);
      if (hit) hit.variants.push(vi);
      else list.push({ material, variants: [vi] });
    }
  });
  return {
    materials,
    slotMaterial,
    primitiveExtensions: (slot) => {
      const list = mappings.get(slot);
      return list?.length ? { [MATERIALS_VARIANTS]: { mappings: list } } : undefined;
    },
    root: names.length ? { variants: names.map((name) => ({ name })) } : null,
  };
}

function unpaintMesh(m: Mesh, slot: readonly [number, number, number]): Mesh {
  const colors = new Float32Array(m.colors.length);
  for (let i = 0; i < colors.length; i += 3)
    colors.set(tone([m.colors[i] ?? 0, m.colors[i + 1] ?? 0, m.colors[i + 2] ?? 0], slot), i);
  return { ...m, colors };
}

/** Painted parts' COLOR_0 → tone (colour ÷ slot); `skip` keeps glowing parts as they are. */
export function unpaintParts(
  asset: CompiledAsset,
  skip: (p: Part, i: number) => boolean,
): CompiledAsset {
  const set = asset.paintSet;
  if (!set) return asset;
  const parts = asset.parts.map((p, i) => {
    const slot = p.paint === undefined ? undefined : set.paint[p.paint];
    return p.mesh && slot && !skip(p, i) ? { ...p, mesh: unpaintMesh(p.mesh, slot) } : p;
  });
  return { ...asset, parts };
}
