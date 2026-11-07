// glTF 2.0 binary writer. One material (the trim sheet) for the whole asset, one node per part
// with its pivot as translation, and each part's motion baked as a looping animation clip.
// Extras a stock viewer understands: light sockets → KHR_lights_punctual, glowing parts →
// emissive (+ KHR_materials_emissive_strength), provenance → asset.copyright + KHR_xmp_json_ld.
// Zero dependencies and byte-deterministic: same CompiledAsset in, same bytes out.

import type { CompiledAsset, Part } from '../core/index.ts';
import { quatFromAxisAngle, Ts23dError } from '../core/index.ts';
import type { OptimizeOptions } from '../passes/index.ts';
import { BinWriter, type Json } from './bin-writer.ts';
import { concat, packGlb } from './container.ts';
import { LIGHTS, lightOf } from './lights.ts';
import { EMISSIVE_STRENGTH, type GlowRule, glowMaterial, materialsFor } from './materials.ts';
import { globRe, glowLayer, mergeToPivots } from './merge-pivots.ts';
import { type GlbMeta, metadata } from './metadata.ts';
import { motionChannel } from './motion.ts';
import { type ExportReport, optimizeParts } from './optimize-parts.ts';
import { writePrimitive } from './primitive.ts';
import { type SheetBinding, sheetGltf } from './textures.ts';

// Viewers auto-play the FIRST clip and glTF has no "paused" flag, so the first clip is `rest`: two
// keys holding the root's rest rotation. The file opens still; pick `run` to play it.
// Authoring frame: Z up, +X front. glTF: Y up, +Z front, +X = the asset's left. This root
// rotation maps +X→+Z, +Z→+Y, +Y→+X (verified numerically), so assets face forward in engines.
const Z_UP_TO_Y_UP = [-0.5, -0.5, -0.5, 0.5];
function restClip(bin: BinWriter): Json {
  const input = bin.accessor(new Float32Array([0, 1]), 'SCALAR', undefined, true);
  const output = bin.accessor(new Float32Array([...Z_UP_TO_Y_UP, ...Z_UP_TO_Y_UP]), 'VEC4');
  return {
    name: 'rest',
    samplers: [{ input, output, interpolation: 'STEP' }],
    channels: [{ sampler: 0, target: { node: 0, path: 'rotation' } }],
  };
}

export interface GlbOptions {
  /** Keep every part as its own node (debugging, per-part picking). Default merges to pivots. */
  readonly keepParts?: boolean;
  /**
   * Bake each part's `motion` into a looping `run` clip. Off by default: glTF has no autoplay
   * flag and most viewers play the first clip, while engines usually drive the named pivots
   * from game code. Turn it on for previews, cutscenes and ambient props.
   */
  readonly animations?: boolean;
  /**
   * Bind the painted trim sheet to every material: a `PaintedSheet` embeds the three PNGs (one
   * self-contained file); `{ external: true, prefix? }` references shared `trim_sheet_*.png` by
   * URI. Omitted: no textures, byte-identical to the untextured output.
   */
  readonly sheet?: SheetBinding;
  /**
   * Weld + vertex-cache + vertex-fetch optimisation per primitive (passes/optimize). On by
   * default; `false` writes the meshes exactly as compiled (debugging the IR).
   */
  readonly optimize?: boolean | OptimizeOptions;
  /** Parts that emit light (lamp lenses, lit windows): one emissive material per rule. */
  readonly glow?: readonly GlowRule[];
  /** Provenance: asset.copyright + an XMP packet (title, creators, licence, sources). */
  readonly meta?: GlbMeta;
}

/** The GLB bytes plus what the optimiser did (vertex counts, ACMR before/after, per part). */
export interface GlbResult {
  readonly glb: Uint8Array;
  readonly report: ExportReport;
}

export function toGlb(input: CompiledAsset, o: GlbOptions = {}): Uint8Array {
  return exportGlb(input, o).glb;
}

function checkGlow(rules: readonly GlowRule[]): void {
  for (const r of rules)
    if ((r.strength ?? 4) < 0 || (r.color ?? [0, 0, 0]).some((c) => c < 0 || c > 1))
      throw new Ts23dError('T3D_RECIPE_INVALID', {
        cause: `glow rule for ${JSON.stringify(r.parts)} has a colour outside 0..1 or a negative strength`,
        fix: 'colour is linear 0..1 (hex() converts sRGB); brightness goes in `strength`',
      });
}

export function exportGlb(input: CompiledAsset, o: GlbOptions = {}): GlbResult {
  const glow = o.glow ?? input.glow ?? [];
  checkGlow(glow);
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
  const mats = materialsFor(
    new Set(asset.parts.flatMap((p) => (p.surface ? [p.surface] : []))),
    o.sheet !== undefined,
  );
  const glowAt = mats.materials.length;
  const materials = [
    ...mats.materials,
    ...glow.map((g, i) => glowMaterial(g, i, o.sheet !== undefined)),
  ];
  const bin = new BinWriter();
  const meshes: Json[] = [];
  const nodes: Json[] = [{ name: asset.name, children: [] as number[] }];
  const index = new Map<string, number>();
  const samplers: Json[] = [];
  const channels: Json[] = [];
  const lights: Json[] = [];
  const attach = (parentId: number, id: number): void => {
    const parent = nodes[parentId];
    if (!parent) return;
    parent['children'] = [...((parent['children'] as number[] | undefined) ?? []), id];
  };

  asset.parts.forEach((part: Part, i) => {
    const node: Json = { name: part.name, translation: [...part.at] };
    if (part.yaw) node['rotation'] = [...quatFromAxisAngle([0, 0, 1], part.yaw)];
    if (part.emitter || part.socket) {
      node['extras'] = {
        ts23d: {
          ...(part.emitter ? { emitter: part.emitter } : {}),
          ...(part.socket ? { socket: part.socket } : {}),
        },
      };
    }
    if (part.mesh && part.mesh.indices.length > 0) {
      const g = glowOf(part, i);
      const material = g >= 0 ? glowAt + g : (mats.index.get(part.surface ?? 'opaque') ?? 0);
      meshes.push({
        name: part.name,
        primitives: [writePrimitive(bin, part.mesh, material, o.sheet !== undefined)],
      });
      node['mesh'] = meshes.length - 1;
    }
    nodes.push(node);
    const id = nodes.length - 1;
    index.set(part.name, id);
    attach(part.parent === null ? 0 : (index.get(part.parent) ?? 0), id);
    const lit = lightOf(part);
    if (lit) {
      lights.push(lit.light);
      nodes.push({
        name: `${part.name}_light`,
        rotation: [...lit.rotation],
        extensions: { [LIGHTS]: { light: lights.length - 1 } },
      });
      attach(id, nodes.length - 1);
    }
    if (part.motion && o.animations) {
      const { sampler, channel } = motionChannel(bin, part.motion, id, part.at);
      samplers.push(sampler);
      channels.push({ ...channel, sampler: samplers.length - 1 });
    }
  });

  // Every accessor — the rest clip's included — must be written BEFORE the buffer is sealed.
  const animations = channels.length ? [restClip(bin), { name: 'run', samplers, channels }] : [];
  const geometry = bin.bytes();
  const tex = o.sheet ? sheetGltf(o.sheet, bin.views, geometry.byteLength) : null;
  const body = tex?.tail.byteLength ? concat(geometry, tex.tail) : geometry;
  const meta = metadata(asset.name, o.meta ?? input.meta);
  const used = [
    ...mats.extensionsUsed,
    ...(glow.some((g) => (g.strength ?? 4) !== 1) ? [EMISSIVE_STRENGTH] : []),
    ...(lights.length ? [LIGHTS] : []),
    ...meta.used,
  ].sort();
  const extensions: Json = {
    ...(lights.length ? { [LIGHTS]: { lights } } : {}),
    ...(meta.extensions ?? {}),
  };
  const root = nodes[0];
  if (root) root['rotation'] = Z_UP_TO_Y_UP;
  const gltf: Json = {
    asset: meta.asset,
    extras: {
      kind: asset.kind,
      lod: asset.lod,
      units: 'metres',
      up: 'Z (rotated to glTF Y-up at the root)',
    },
    ...(used.length ? { extensionsUsed: used } : {}),
    ...(Object.keys(extensions).length ? { extensions } : {}),
    scene: 0,
    scenes: [{ name: asset.name, nodes: [0] }],
    nodes,
    meshes,
    materials,
    ...(tex ? tex.json : {}),
    buffers: [{ byteLength: body.byteLength }],
    bufferViews: bin.views,
    accessors: bin.accessors,
    ...(animations.length ? { animations } : {}),
  };
  return { glb: packGlb(gltf, body), report };
}
