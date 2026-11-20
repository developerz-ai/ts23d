// manifest.json per asset: what an engine pipeline or an agent needs without opening a GLB —
// files, triangles per LOD, pivots (the names game code binds to), emitters, joints, surfaces, the
// texture sets parts carry (ADR 016: maps, sizes, bytes), QA, measures with their measured values,
// sources, paint slots and switchable variants, and for a skinned asset the engine contract:
// skeleton (bones + parents), clips, per-bone hitboxes. Every number at MANIFEST_ROUNDING.
// Location-independent: every path in `files` is relative to the manifest's own folder
// (<out>/<asset>/), so two builds into two --out dirs write the same bytes. Per-LOD arrays
// (triangles, drawCalls, lodCoverage) are indexed like `lods`, the levels actually built.
// Triangles, draw calls and `clips` are what the GLBs hold (export's `glbContents`), not what the
// recipe compiled to: the writer merges, drops dead triangles and skips empty meshes; a clip is
// listed when at least one built LOD's file keeps a channel of it (clip-channels.ts), and none is
// when the GLBs are written without animations: `--no-animations`, or a library `toGlb` call that
// does not ask for them (`manifestOf` shares the writer's default, GLB_ANIMATIONS_DEFAULT).

import {
  type Asset,
  type CompiledAsset,
  LOOP_SECONDS,
  type Lod,
  linearToHex,
  MANIFEST_ROUNDING,
  pngHeader,
  roundJson,
  STRETCH_TOLERANCE,
  TEXTURE_MAPS,
  textureSetsOf,
} from '../core/index.ts';
import {
  clipPlays,
  clipSummary,
  fitHitboxes,
  GLB_ANIMATIONS_DEFAULT,
  type GlbContents,
  glbContents,
  mergeToPivots,
  skeletonOf,
  soundUses,
} from '../export/index.ts';
import { type Finding, measure } from '../qa/index.ts';
import { type WeatherSummary, weatherOf } from './manifest-weather.ts';

export type { WeatherSummary } from './manifest-weather.ts';

export interface AssetManifest {
  readonly name: string;
  readonly kind: string;
  readonly description?: string;
  readonly tags: readonly string[];
  /** The levels built (`--lods`): entry i of every per-LOD array is LOD `lods[i]`. */
  readonly lods: readonly Lod[];
  /** Paths relative to this manifest's folder. */
  readonly files: {
    readonly lods: readonly string[];
    /** All built LODs in one GLB (MSFT_lod), when `--lods single|both`. */
    readonly single?: string;
    readonly hero?: string;
    readonly sheet?: string;
    readonly thumb?: string;
    /** `<clip>.wav` files the GLBs' KHR_audio_emitter entries reference. */
    readonly sounds?: readonly string[];
  };
  /** Triangles in each LOD's GLB (after the optimiser dropped degenerate and duplicate ones). */
  readonly triangles: readonly number[];
  /**
   * Triangles the recipe compiled to, which `budget.triangles` is checked against; present only
   * when the optimiser dropped some, so it differs from `triangles`.
   */
  readonly trianglesCompiled?: readonly number[];
  /** MSFT_screencoverage written into `files.single`: where each LOD hands over (last = cull). */
  readonly lodCoverage?: readonly number[];
  readonly drawCalls: readonly number[];
  readonly pivots: readonly { name: string; parent: string | null; motion?: string }[];
  readonly emitters: readonly { name: string; kind: string; when: string }[];
  readonly sockets: readonly { name: string; kind: string; parent: string | null }[];
  /** Sound sources (KHR_audio_emitter): node, clip, what starts it; absent when none. */
  readonly sounds?: readonly {
    node: string;
    clip: string;
    trigger: string;
    loop: boolean;
    seconds: number;
  }[];
  /** Declared connections (`ctx.joint`), checked by QA `joints`; absent when none. */
  readonly joints?: readonly {
    name: string;
    from: string;
    to: string;
    kind: string;
    at: readonly number[];
  }[];
  readonly surfaces: readonly string[];
  /**
   * Texture sets parts carry on every LOD (ADR 016), each one material: per map its edge in
   * pixels and PNG bytes, `bytes` their sum (embedded once per GLB file); absent when none.
   */
  readonly textureSets?: readonly {
    name: string;
    size: number;
    maps: Readonly<Record<string, { size: number; bytes: number }>>;
    bytes: number;
    credit?: string;
  }[];
  /** Bones in joint order (skinned assets); absent when none. */
  readonly skeleton?: readonly { name: string; parent: string | null }[];
  /** Joint limits whose QA `deform` stretch tolerance was raised, with the declared why. */
  readonly deformTolerances?: readonly { bone: string; stretch: number; why: string }[];
  /** glTF animations after `rest`: name, seconds, loop, root ground speed m/s; absent when none. */
  readonly clips?: readonly { name: string; seconds: number; loop: boolean; speed: number }[];
  /** Per-bone capsule triggers (written with `--physics`): bone, radius, cap distance, coverage. */
  readonly hitboxes?: readonly { bone: string; radius: number; height: number; coverage: number }[];
  /** Paint slots → default colour (sRGB hex); each is one material, one draw per pivot using it. */
  readonly paint?: Readonly<Record<string, string>>;
  /** KHR_materials_variants liveries in the GLBs: name → the slots it repaints (sRGB hex). */
  readonly variants?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly real?: { length: number; width: number; height: number };
  readonly measures: readonly {
    label: string;
    spec: number;
    measured: number | null;
    source?: string;
  }[];
  readonly sources: readonly string[];
  /**
   * Measured weathering at LOD0 per effect (`weather(ctx, …)`): declared `target` (coverage
   * fraction; dents depth, sag/warp max in m), `actual`, the `eligible` selector, its `area` (m²);
   * `by` splits it per weathered target when there are several.
   */
  readonly weather?: Readonly<Record<string, WeatherSummary>>;
  readonly qa: { readonly pass: boolean; readonly findings: readonly Finding[] };
}

const tris = (a: CompiledAsset): number =>
  a.parts.reduce((s, p) => s + (p.mesh ? p.mesh.indices.length / 3 : 0), 0);

export { drawCallsOf } from '../export/index.ts';

export interface ManifestOptions {
  /**
   * The GLBs carry animations: pass what `toGlb` got (`GlbOptions.animations`; default, like the
   * writer's, `GLB_ANIMATIONS_DEFAULT` = false). `t3d build` bakes them unless `--no-animations`.
   */
  readonly animations?: boolean;
}

function fields(
  asset: Asset,
  lods: readonly CompiledAsset[],
  files: AssetManifest['files'],
  findings: readonly Finding[],
  lodCoverage?: readonly number[],
  options: ManifestOptions = {},
): AssetManifest {
  const top = lods[0];
  const merged = top ? mergeToPivots(top) : null;
  const held = lods.map(glbContents);
  const compiled = lods.map(tris);
  return {
    name: asset.name,
    kind: asset.kind,
    ...(asset.description ? { description: asset.description } : {}),
    tags: asset.tags ?? [],
    lods: lods.map((l) => l.lod),
    files,
    triangles: held.map((h) => h.triangles),
    ...(compiled.some((n, i) => n !== held[i]?.triangles) ? { trianglesCompiled: compiled } : {}),
    ...(lodCoverage?.length ? { lodCoverage } : {}),
    drawCalls: held.map((h) => h.draws),
    pivots: (merged?.parts ?? [])
      .filter((p) => !p.emitter && !p.socket && !p.audio)
      .map((p) => ({
        name: p.name,
        parent: p.parent,
        ...(p.motion ? { motion: p.motion.kind } : {}),
      })),
    emitters: (top?.parts ?? []).flatMap((p) =>
      p.emitter ? [{ name: p.name, kind: p.emitter.kind, when: p.emitter.when ?? 'always' }] : [],
    ),
    // From the merged parts: `parent` must name a node the GLB has.
    sockets: (merged?.parts ?? []).flatMap((p) =>
      p.socket ? [{ name: p.name, kind: p.socket.kind, parent: p.parent }] : [],
    ),
    ...soundsOf(top),
    ...(top?.joints?.length
      ? {
          joints: top.joints.map((j) => ({
            name: j.name,
            from: j.from,
            to: j.to,
            kind: j.kind ?? 'flush',
            at: j.at.map((v) => Math.round(v * 1e4) / 1e4),
          })),
        }
      : {}),
    surfaces: [...new Set((top?.parts ?? []).map((p) => p.surface ?? 'opaque'))].sort(),
    ...textureSetsIn(lods),
    ...rigOf(top, (options.animations ?? GLB_ANIMATIONS_DEFAULT) ? held : []),
    ...paintOf(top),
    ...(asset.real
      ? { real: { length: asset.real.length, width: asset.real.width, height: asset.real.height } }
      : {}),
    measures: (asset.real?.measures ?? []).map((m) => ({
      label: m.label,
      spec: m.value,
      measured: top ? measure(top, m) : null,
      ...(m.source ? { source: m.source } : {}),
    })),
    sources: asset.sources ?? [],
    ...weatherOf(top),
    qa: { pass: findings.length === 0, findings },
  };
}

export const manifestOf: typeof fields = (...a) => roundJson(fields(...a), MANIFEST_ROUNDING);

/** Sets by name across the LODs built, first use first (LOD0 leads). */
function textureSetsIn(lods: readonly CompiledAsset[]): Pick<AssetManifest, 'textureSets'> {
  const sets = textureSetsOf(lods.flatMap((l) => l.parts));
  if (!sets.length) return {};
  return {
    textureSets: sets.map((set) => {
      const maps = Object.fromEntries(
        TEXTURE_MAPS.flatMap((m) => {
          const png = set[m];
          return png ? [[m, { size: pngHeader(png)?.width ?? 0, bytes: png.byteLength }]] : [];
        }),
      );
      return {
        name: set.name,
        size: maps['albedo']?.size ?? 0,
        maps,
        bytes: Object.values(maps).reduce((s, m) => s + m.bytes, 0),
        ...(set.credit ? { credit: set.credit } : {}),
      };
    }),
  };
}

/**
 * `files`: what each animated LOD file holds ([] without animations). The baked `run` clip when
 * one has it (a belt alone runs too, by morph targets); a declared clip when one keeps a channel.
 */
function rigOf(
  top: CompiledAsset | undefined,
  files: readonly GlbContents[],
): Pick<AssetManifest, 'skeleton' | 'deformTolerances' | 'clips' | 'hitboxes'> {
  if (!top) return {};
  const clips = clipSummary(
    (top.clips ?? []).filter((c) => files.some((f) => clipPlays(c, f.clipTargets))),
    files.some((f) => f.run),
    LOOP_SECONDS,
  );
  const hitboxes = fitHitboxes(top).map(({ bone, radius, height, coverage }) => ({
    bone,
    radius,
    height,
    coverage,
  }));
  const raised = (top.skeleton?.bones ?? []).flatMap((b) =>
    b.limit?.stretch !== undefined && b.limit.stretch > STRETCH_TOLERANCE.default
      ? [{ bone: b.name, stretch: b.limit.stretch, why: b.limit.why ?? '' }]
      : [],
  );
  return {
    ...(top.skeleton ? { skeleton: skeletonOf(top) } : {}),
    ...(raised.length ? { deformTolerances: raised } : {}),
    ...(clips.length ? { clips } : {}),
    ...(hitboxes.length ? { hitboxes } : {}),
  };
}

function soundsOf(top: CompiledAsset | undefined): Pick<AssetManifest, 'sounds'> {
  const uses = top ? soundUses(top) : [];
  if (!uses.length) return {};
  return {
    sounds: uses.map((u) => ({
      node: u.node,
      clip: u.clip.name,
      trigger: u.trigger,
      loop: u.loop,
      seconds:
        Math.round((u.clip.samples.length / u.clip.channels / u.clip.sampleRate) * 1e3) / 1e3,
    })),
  };
}

const hexes = (slots: Readonly<Record<string, readonly [number, number, number]>>) =>
  Object.fromEntries(Object.entries(slots).map(([k, c]) => [k, linearToHex(c)]));

function paintOf(top: CompiledAsset | undefined): Pick<AssetManifest, 'paint' | 'variants'> {
  const set = top?.paintSet;
  if (!set) return {};
  const variants = Object.entries(set.variants);
  return {
    paint: hexes(set.paint),
    ...(variants.length
      ? { variants: Object.fromEntries(variants.map(([v, slots]) => [v, hexes(slots)])) }
      : {}),
  };
}
