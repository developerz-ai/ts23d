// glTF 2.0 binary writer. One material (the trim sheet) for the whole asset, one node per part
// with its pivot as translation, and each part's motion baked as a looping animation clip.
// Skinned assets add joint nodes + a skin per LOD tree (skin.ts) and their named clips (clips.ts).
// Extras a stock viewer understands: light sockets → KHR_lights_punctual, glowing parts →
// emissive (+ KHR_materials_emissive_strength), provenance → asset.copyright + KHR_xmp_json_ld.
// `exportLodGlb` packs several LODs into ONE file (MSFT_lod alternates sharing materials,
// textures and motion samplers). Paint slots get their own materials and liveries ride
// KHR_materials_variants (variants.ts). A part with its own texture set (ADR 016) gets that set's
// material on every LOD (texture-sets.ts). Zero dependencies and byte-deterministic.

import type { CompiledAsset, Part } from '../core/index.ts';
import { checkMeshAttributes } from '../core/index.ts';
import { AUDIO_EMITTER, writeAudio } from './audio.ts';
import { BinWriter, type Json } from './bin-writer.ts';
import { animationsOf, type ClipTree, Z_UP_TO_Y_UP } from './clips.ts';
import { concat, packGlb } from './container.ts';
import { withCredits } from './credits.ts';
import { checkGlow, checkLods, checkMeshArrays } from './glb-checks.ts';
import {
  GLB_ANIMATIONS_DEFAULT,
  type GlbOptions,
  type GlbResult,
  type LodGlbResult,
} from './glb-options.ts';
import { newDoc, writeHierarchy } from './hierarchy.ts';
import { LIGHTS } from './lights.ts';
import {
  checkCoverage,
  coverageFor,
  defaultCoverage,
  MSFT_LOD,
  SCREEN_COVERAGE,
} from './lod-coverage.ts';
import { type GlowRule, glowMaterial, materialsFor } from './materials.ts';
import { globRe, glowLayer, mergeToPivots } from './merge-pivots.ts';
import { metadata } from './metadata.ts';
import { optimizeParts, summarize } from './optimize-parts.ts';
import { splitWornParts } from './paint-wear.ts';
import { materialExtensions } from './pbr.ts';
import { finishPlan } from './pbr-plan.ts';
import { writePhysics } from './physics.ts';
import { profiled } from './profile.ts';
import { writeSkin } from './skin.ts';
import { textureSetPlan } from './texture-sets.ts';
import { sheetGltf } from './textures.ts';
import { MATERIALS_VARIANTS, paintPlan, unpaintParts } from './variants.ts';

export type { ExportWarning, GlbOptions, GlbResult, LodGlbResult } from './glb-options.ts';

export function toGlb(input: CompiledAsset, o: GlbOptions = {}): Uint8Array {
  return exportGlb(input, o).glb;
}

export function exportGlb(input: CompiledAsset, o: GlbOptions = {}): GlbResult {
  const { glb, reports, physics, warnings } = exportLodGlb([input], o);
  const more = { ...(physics ? { physics } : {}), ...(warnings ? { warnings } : {}) };
  return { glb, report: reports[0] ?? summarize([], false), ...more };
}

/** All LODs in one GLB: LOD0 in the scene, the rest as MSFT_lod alternates outside it. */
export function toLodGlb(lods: readonly CompiledAsset[], o: GlbOptions = {}): Uint8Array {
  return exportLodGlb(lods, o).glb;
}

type Prepared = ReturnType<typeof prepareUncached>;
// `t3d build` writes each LOD alone AND all LODs in one file: merge + optimise each compiled LOD
// once. Keyed by the (immutable) compiled asset, then by the inputs `prepare` reads from options.
const prepared = new WeakMap<CompiledAsset, Map<string, Prepared>>();

/** One LOD prepared for writing: merged + optimised parts and its glow-layer lookup (memoised). */
function prepare(input: CompiledAsset, o: GlbOptions, glow: readonly GlowRule[]): Prepared {
  const key = JSON.stringify([o.optimize ?? null, o.keepParts === true, glow.map((g) => g.parts)]);
  const byKey = prepared.get(input) ?? new Map<string, Prepared>();
  prepared.set(input, byKey);
  const hit = byKey.get(key);
  if (hit) return hit;
  const made = prepareUncached(input, o, glow);
  byKey.set(key, made);
  return made;
}

function prepareUncached(input: CompiledAsset, o: GlbOptions, glow: readonly GlowRule[]) {
  // Skin / morph attributes must line up before merging and welding reshuffle them.
  for (const p of input.parts)
    if (p.mesh) {
      checkMeshArrays(p.mesh, `part '${p.name}' in '${input.name}'`);
      checkMeshAttributes(p.mesh, `part '${p.name}' in '${input.name}'`);
    }
  const opt = o.optimize === false ? false : o.optimize === true ? {} : (o.optimize ?? {});
  const merged = o.keepParts
    ? splitWornParts(input)
    : mergeToPivots(
        input,
        glow.map((g) => g.parts),
      );
  const optimized = optimizeParts(merged, opt);
  // optimizeParts copies parts: carry the glow tag across by position.
  const glowRes = glow.map((g) => g.parts.map(globRe));
  const glowOf = (p: Part, i: number): number =>
    glowLayer.get(merged.parts[i] ?? p) ??
    (o.keepParts ? glowRes.findIndex((rs) => rs.some((r) => r.test(p.name))) : -1);
  // Painted parts store colour ÷ slot colour; the slot's material restores it (glow keeps its own).
  const asset = unpaintParts(optimized.asset, (p, i) => glowOf(p, i) >= 0);
  return { asset, report: optimized.report, glowOf };
}

export function exportLodGlb(lods: readonly CompiledAsset[], o: GlbOptions = {}): LodGlbResult {
  checkLods(lods);
  const top = lods[0] as CompiledAsset;
  const glow = o.glow ?? top.glow ?? [];
  checkGlow(glow);
  const preps = lods.map((l) => prepare(l, o, glow));
  const withSheet = o.sheet !== undefined;
  const mats = materialsFor(
    // A textured part's surface picks among its set's materials, not the sheet's.
    new Set(
      preps.flatMap((p) =>
        p.asset.parts.flatMap((q) => (q.surface && !q.textures ? [q.surface] : [])),
      ),
    ),
    withSheet,
    top.optics,
  );
  const glowAt = mats.materials.length;
  const paint = paintPlan(top.paintSet, glowAt + glow.length, withSheet);
  const finishAt = glowAt + glow.length + paint.materials.length;
  const finish = finishPlan(
    preps.map((p) => p.asset),
    finishAt,
    withSheet,
  );
  const sets = textureSetPlan(lods, finishAt + finish.materials.length, withSheet);
  // A profile (unreal|unity|godot|rt|web) only changes defaults: AO binding, collider naming.
  const { strip, physics: physOpts, extras: profileExtras } = profiled(o.profile, o.physics);
  const materials = strip([
    ...mats.materials,
    ...glow.map((g, i) => glowMaterial(g, i, withSheet)),
    ...paint.materials,
    ...finish.materials,
    ...sets.materials,
  ]);
  const doc = newDoc(new BinWriter());
  // Each LOD tree: parts, then its joint nodes + skin (a skinned asset); clips key both.
  const skins: Json[] = [];
  const trees: ClipTree[] = [];
  const roots = preps.map(({ asset, glowOf }, k) => {
    const { root, index } = writeHierarchy(
      doc,
      asset,
      k === 0 ? asset.name : `${asset.name}_LOD${asset.lod}`,
      {
        withSheet,
        animations: o.animations ?? GLB_ANIMATIONS_DEFAULT,
        materialOf: (part, i) => {
          const own = sets.materialOf(part);
          if (own !== undefined) return own;
          const g = glowOf(part, i);
          if (g >= 0) return glowAt + g;
          const slot = part.paint === undefined ? undefined : paint.slotMaterial.get(part.paint);
          const fin = part.finish === undefined ? undefined : finish.index.get(part.finish);
          return slot ?? fin ?? mats.index.get(part.surface ?? 'opaque') ?? 0;
        },
        primitiveExtensions: (part, i) =>
          part.paint === undefined || glowOf(part, i) >= 0
            ? undefined
            : paint.primitiveExtensions(part.paint),
      },
    );
    trees.push({ parts: index, joints: writeSkin(doc, skins, asset, root, index) });
    return root;
  });
  for (const r of roots) {
    const node = doc.nodes[r];
    if (node) node['rotation'] = Z_UP_TO_Y_UP;
  }
  const coverage: number[] = [];
  const rootNode = doc.nodes[0];
  if (roots.length > 1 && rootNode) {
    const c = o.lodCoverage ?? top.lodCoverage ?? defaultCoverage(lods);
    checkCoverage(c, top.name);
    coverage.push(
      ...coverageFor(
        lods.map((l) => l.lod),
        c,
      ),
    );
    // Alternates stay OUT of the scene's root list: a viewer without MSFT_lod shows LOD0 only.
    rootNode['extensions'] = { [MSFT_LOD]: { ids: roots.slice(1) } };
    rootNode['extras'] = { [SCREEN_COVERAGE]: coverage };
  }

  // Sound emitters (KHR_audio_emitter) on the LOD0 tree's nodes, clips as <name>.wav beside it.
  const audio =
    o.sounds === false
      ? null
      : writeAudio(doc.nodes, top, roots[0] ?? 0, roots[1] ?? doc.nodes.length);
  // Physics reads the unmerged LOD0 parts; its hull/trimesh accessors precede the seal too.
  const phys = physOpts
    ? writePhysics(
        doc,
        top,
        roots[0] ?? 0,
        roots[1] ?? doc.nodes.length,
        physOpts,
        trees[0]?.joints,
      )
    : null;
  // Every accessor — the rest clip's included — must be written BEFORE the buffer is sealed.
  const { bin, lights } = doc;
  const animations = animationsOf(
    doc,
    roots,
    trees,
    (o.animations ?? GLB_ANIMATIONS_DEFAULT) ? (top.clips ?? []) : [],
  );
  const geometry = bin.bytes();
  const sheet = o.sheet ? sheetGltf(o.sheet, bin.views, geometry.byteLength) : null;
  const tex = sets.embed(sheet, bin.views, geometry.byteLength);
  const body = tex?.tail.byteLength ? concat(geometry, tex.tail) : geometry;
  const meta = metadata(top.name, withCredits(top, o.meta ?? top.meta, lods));
  const used = [
    ...materialExtensions(materials),
    ...(lights.length ? [LIGHTS] : []),
    ...(audio ? [AUDIO_EMITTER] : []),
    ...(coverage.length ? [MSFT_LOD] : []),
    ...(paint.root ? [MATERIALS_VARIANTS] : []),
    ...(phys?.used ?? []),
    ...meta.used,
  ]
    .filter((e, i, all) => all.indexOf(e) === i)
    .sort();
  const extensions: Json = {
    ...(lights.length ? { [LIGHTS]: { lights } } : {}),
    ...(audio ? { [AUDIO_EMITTER]: audio } : {}),
    ...(paint.root ? { [MATERIALS_VARIANTS]: paint.root } : {}),
    ...(meta.extensions ?? {}),
    ...(phys?.extensions ?? {}),
  };
  const gltf: Json = {
    asset: meta.asset,
    extras: {
      kind: top.kind,
      lod: coverage.length ? lods.map((l) => l.lod) : top.lod,
      units: 'metres',
      up: 'Z (rotated to glTF Y-up at the root)',
      ...profileExtras,
      ...sets.extras,
    },
    ...(used.length ? { extensionsUsed: used } : {}),
    ...(Object.keys(extensions).length ? { extensions } : {}),
    scene: 0,
    scenes: [{ name: top.name, nodes: [0] }],
    nodes: doc.nodes,
    // glTF forbids empty arrays and a zero-length buffer: a mesh-less LOD writes none of them.
    ...(doc.meshes.length ? { meshes: doc.meshes } : {}),
    ...(skins.length ? { skins } : {}),
    materials,
    ...(tex ? tex.json : {}),
    ...(body.byteLength ? { buffers: [{ byteLength: body.byteLength }] } : {}),
    ...(bin.views.length ? { bufferViews: bin.views } : {}),
    ...(bin.accessors.length ? { accessors: bin.accessors } : {}),
    ...(animations.length ? { animations } : {}),
  };
  const more = {
    ...(phys ? { physics: phys.report } : {}),
    ...(sets.warnings.length ? { warnings: sets.warnings } : {}),
  };
  return { glb: packGlb(gltf, body), reports: preps.map((p) => p.report), coverage, ...more };
}
