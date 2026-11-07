// glTF 2.0 binary writer. One material (the trim sheet) for the whole asset, one node per part
// with its pivot as translation, and each part's motion baked as a looping animation clip.
// Extras a stock viewer understands: light sockets → KHR_lights_punctual, glowing parts →
// emissive (+ KHR_materials_emissive_strength), provenance → asset.copyright + KHR_xmp_json_ld.
// `exportLodGlb` packs several LODs into ONE file (MSFT_lod alternates sharing materials,
// textures and motion samplers). Zero dependencies and byte-deterministic.

import type { CompiledAsset, Part } from '../core/index.ts';
import { Ts23dError } from '../core/index.ts';
import { BinWriter, type Json } from './bin-writer.ts';
import { concat, packGlb } from './container.ts';
import { withCredits } from './credits.ts';
import type { GlbOptions, GlbResult, LodGlbResult } from './glb-options.ts';
import { newDoc, writeHierarchy } from './hierarchy.ts';
import { LIGHTS } from './lights.ts';
import {
  checkCoverage,
  coverageFor,
  defaultCoverage,
  MSFT_LOD,
  SCREEN_COVERAGE,
} from './lod-coverage.ts';
import { EMISSIVE_STRENGTH, type GlowRule, glowMaterial, materialsFor } from './materials.ts';
import { globRe, glowLayer, mergeToPivots } from './merge-pivots.ts';
import { metadata } from './metadata.ts';
import { optimizeParts, summarize } from './optimize-parts.ts';
import { sheetGltf } from './textures.ts';

// Viewers auto-play the FIRST clip and glTF has no "paused" flag, so the first clip is `rest`: two
// keys holding the root's rest rotation. The file opens still; pick `run` to play it.
// Authoring frame: Z up, +X front. glTF: Y up, +Z front, +X = the asset's left. This root
// rotation maps +X→+Z, +Z→+Y, +Y→+X (verified numerically), so assets face forward in engines.
const Z_UP_TO_Y_UP = [-0.5, -0.5, -0.5, 0.5];
function restClip(bin: BinWriter, roots: readonly number[]): Json {
  const input = bin.accessor(new Float32Array([0, 1]), 'SCALAR', undefined, true);
  const output = bin.accessor(new Float32Array([...Z_UP_TO_Y_UP, ...Z_UP_TO_Y_UP]), 'VEC4');
  return {
    name: 'rest',
    samplers: [{ input, output, interpolation: 'STEP' }],
    channels: roots.map((node) => ({ sampler: 0, target: { node, path: 'rotation' } })),
  };
}

export type { GlbOptions, GlbResult, LodGlbResult } from './glb-options.ts';

export function toGlb(input: CompiledAsset, o: GlbOptions = {}): Uint8Array {
  return exportGlb(input, o).glb;
}

export function exportGlb(input: CompiledAsset, o: GlbOptions = {}): GlbResult {
  const { glb, reports } = exportLodGlb([input], o);
  return { glb, report: reports[0] ?? summarize([], false) };
}

/** All LODs in one GLB: LOD0 in the scene, the rest as MSFT_lod alternates outside it. */
export function toLodGlb(lods: readonly CompiledAsset[], o: GlbOptions = {}): Uint8Array {
  return exportLodGlb(lods, o).glb;
}

function checkGlow(rules: readonly GlowRule[]): void {
  for (const r of rules)
    if ((r.strength ?? 4) < 0 || (r.color ?? [0, 0, 0]).some((c) => c < 0 || c > 1))
      throw new Ts23dError('T3D_RECIPE_INVALID', {
        cause: `glow rule for ${JSON.stringify(r.parts)} has a colour outside 0..1 or a negative strength`,
        fix: 'colour is linear 0..1 (hex() converts sRGB); brightness goes in `strength`',
      });
}

function checkLods(lods: readonly CompiledAsset[]): void {
  const names = new Set(lods.map((l) => l.name));
  const levels = lods.map((l) => l.lod);
  if (
    lods.length === 0 ||
    names.size !== 1 ||
    levels.some((l, i) => i > 0 && l <= (levels[i - 1] ?? 0))
  )
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `exportLodGlb got LODs [${levels.join(', ')}] of [${[...names].join(', ')}]`,
      fix: 'pass compile(asset, { lod }) results of ONE asset, highest detail first: LOD0, LOD1, LOD2',
    });
}

/** One LOD prepared for writing: merged + optimised parts and its glow-layer lookup. */
function prepare(input: CompiledAsset, o: GlbOptions, glow: readonly GlowRule[]) {
  const opt = o.optimize === false ? false : o.optimize === true ? {} : (o.optimize ?? {});
  const merged = o.keepParts
    ? input
    : mergeToPivots(
        input,
        glow.map((g) => g.parts),
      );
  const { asset, report } = optimizeParts(merged, opt);
  // optimizeParts copies parts: carry the glow tag across by position.
  const glowRes = glow.map((g) => g.parts.map(globRe));
  const glowOf = (p: Part, i: number): number =>
    glowLayer.get(merged.parts[i] ?? p) ??
    (o.keepParts ? glowRes.findIndex((rs) => rs.some((r) => r.test(p.name))) : -1);
  return { asset, report, glowOf };
}

export function exportLodGlb(lods: readonly CompiledAsset[], o: GlbOptions = {}): LodGlbResult {
  checkLods(lods);
  const top = lods[0] as CompiledAsset;
  const glow = o.glow ?? top.glow ?? [];
  checkGlow(glow);
  const preps = lods.map((l) => prepare(l, o, glow));
  const withSheet = o.sheet !== undefined;
  const mats = materialsFor(
    new Set(preps.flatMap((p) => p.asset.parts.flatMap((q) => (q.surface ? [q.surface] : [])))),
    withSheet,
  );
  const glowAt = mats.materials.length;
  const materials = [...mats.materials, ...glow.map((g, i) => glowMaterial(g, i, withSheet))];
  const doc = newDoc(new BinWriter());
  const roots = preps.map(({ asset, glowOf }, k) =>
    writeHierarchy(doc, asset, k === 0 ? asset.name : `${asset.name}_LOD${asset.lod}`, {
      withSheet,
      animations: o.animations === true,
      materialOf: (part, i) => {
        const g = glowOf(part, i);
        return g >= 0 ? glowAt + g : (mats.index.get(part.surface ?? 'opaque') ?? 0);
      },
    }),
  );
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

  // Every accessor — the rest clip's included — must be written BEFORE the buffer is sealed.
  const { bin, lights, samplers, channels } = doc;
  const animations = channels.length
    ? [restClip(bin, roots), { name: 'run', samplers, channels }]
    : [];
  const geometry = bin.bytes();
  const tex = o.sheet ? sheetGltf(o.sheet, bin.views, geometry.byteLength) : null;
  const body = tex?.tail.byteLength ? concat(geometry, tex.tail) : geometry;
  const meta = metadata(top.name, withCredits(top, o.meta ?? top.meta));
  const used = [
    ...mats.extensionsUsed,
    ...(glow.some((g) => (g.strength ?? 4) !== 1) ? [EMISSIVE_STRENGTH] : []),
    ...(lights.length ? [LIGHTS] : []),
    ...(coverage.length ? [MSFT_LOD] : []),
    ...meta.used,
  ].sort();
  const extensions: Json = {
    ...(lights.length ? { [LIGHTS]: { lights } } : {}),
    ...(meta.extensions ?? {}),
  };
  const gltf: Json = {
    asset: meta.asset,
    extras: {
      kind: top.kind,
      lod: coverage.length ? lods.map((l) => l.lod) : top.lod,
      units: 'metres',
      up: 'Z (rotated to glTF Y-up at the root)',
    },
    ...(used.length ? { extensionsUsed: used } : {}),
    ...(Object.keys(extensions).length ? { extensions } : {}),
    scene: 0,
    scenes: [{ name: top.name, nodes: [0] }],
    nodes: doc.nodes,
    meshes: doc.meshes,
    materials,
    ...(tex ? tex.json : {}),
    buffers: [{ byteLength: body.byteLength }],
    bufferViews: bin.views,
    accessors: bin.accessors,
    ...(animations.length ? { animations } : {}),
  };
  return { glb: packGlb(gltf, body), reports: preps.map((p) => p.report), coverage };
}
