// Engine export profiles: one word (`--profile unreal`, `toGlb(a, { profile: 'unreal' })`) picks
// the defaults an engine's importer wants — LOD packaging, baked AO on/off, collider naming,
// trim-sheet size. The GLB stays standard glTF 2.0 under every profile; a profile only changes
// defaults, and an explicit option always wins. Per-engine notes: docs/architecture/gltf-capabilities.md.
// Engine layouts (`t3d init --engine <e>`): where recipes and the import folder live in a game
// project, and the engine's naming conventions for files, colliders, LODs and clips, with doc links.

import { posix } from 'node:path';
import { Ts23dError } from '../core/index.ts';
import type { Json } from './bin-writer.ts';
import type { PhysicsOptions } from './physics.ts';
import type { EngineConvention } from './physics-engines.ts';

export type ExportProfile = 'unreal' | 'unity' | 'godot' | 'rt' | 'web';
export const PROFILES: readonly ExportProfile[] = ['unreal', 'unity', 'godot', 'rt', 'web'];

export interface ProfileSettings {
  readonly name: ExportProfile;
  /** How `t3d build` writes LODs: split lodN.glb · single MSFT_lod file · both. */
  readonly lodFiles: 'split' | 'single' | 'both';
  /**
   * Bind the sheet's baked occlusion (occlusionTexture). Off for path tracers, which compute
   * their own; AO a recipe baked into vertex colour (`bakeAo`, `grime`) stays in COLOR_0.
   */
  readonly ao: boolean;
  /** Default trim-sheet size, px. */
  readonly sheetSize: 2048 | 4096;
  /** Collider naming written next to KHR_physics_rigid_bodies when `--physics` is on. */
  readonly conventions: readonly EngineConvention[];
  /** One line for the CLI and docs: what to do on import. */
  readonly note: string;
}

const SETTINGS: Readonly<Record<ExportProfile, ProfileSettings>> = {
  unreal: {
    name: 'unreal',
    lodFiles: 'split',
    ao: true,
    sheetSize: 4096,
    conventions: ['unreal'],
    note: 'import lod0.glb (Interchange); enable Nanite on LOD0 or import lod1/lod2 as LOD slots',
  },
  unity: {
    name: 'unity',
    lodFiles: 'split',
    ao: true,
    sheetSize: 4096,
    conventions: [],
    note: 'import with glTFast; put lod0/1/2.glb in a LOD Group',
  },
  godot: {
    name: 'godot',
    lodFiles: 'split',
    ao: true,
    sheetSize: 4096,
    conventions: ['godot'],
    note: 'drop lod0.glb into the project; -colonly/-convcolonly nodes become collision shapes',
  },
  rt: {
    name: 'rt',
    lodFiles: 'split',
    ao: false,
    sheetSize: 4096,
    conventions: [],
    note: 'path tracers compute occlusion: no occlusionTexture; render lod0.glb',
  },
  web: {
    name: 'web',
    lodFiles: 'single',
    ao: true,
    sheetSize: 2048,
    conventions: [],
    note: 'one <asset>.glb with MSFT_lod alternates for three.js / Babylon / model-viewer',
  },
};

/** The settings of profile `name`; an unknown name throws with the list. */
export function profileSettings(name: string): ProfileSettings {
  const p = PROFILES.find((q) => q === name);
  const s = p ? SETTINGS[p] : undefined;
  if (!s)
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `unknown export profile '${name}'`,
      fix: `use one of: ${PROFILES.join(', ')}`,
    });
  return s;
}

/**
 * What a profile changes inside one GLB: `strip` drops occlusionTexture when the profile bakes no
 * AO, `physics` gains the profile's collider naming unless the caller chose conventions, and
 * `extras` records the profile. No profile: identity, so the bytes are unchanged.
 */
export function profiled(
  profile: ExportProfile | undefined,
  physics: boolean | PhysicsOptions | undefined,
): { strip: (m: Json[]) => Json[]; physics: PhysicsOptions | null; extras: Json } {
  const p = profile ? profileSettings(profile) : undefined;
  const given = physics === true ? {} : physics || null;
  return {
    strip: (materials) =>
      p && !p.ao ? materials.map(({ occlusionTexture: _ao, ...m }) => m) : materials,
    physics:
      given && p?.conventions.length && !given.conventions
        ? { ...given, conventions: p.conventions }
        : given,
    extras: p ? { profile: p.name } : {},
  };
}

export type Engine = 'godot' | 'unity' | 'unreal' | 'three' | 'babylon';
export const ENGINES: readonly Engine[] = ['godot', 'unity', 'unreal', 'three', 'babylon'];

/** A game project's conventions for one engine. Paths are project-relative, '/'-separated. */
export interface EngineLayout {
  readonly engine: Engine;
  readonly profile: ExportProfile;
  /** Recipe folder: `<recipes>/<name>/<name>.ts`. */
  readonly recipes: string;
  /** `--out`: the engine's import folder; `<out>/<asset>/…` and the shared sheet in `<out>/`. */
  readonly out: string;
  /** Files written so the engine's importer skips tool folders (Godot scans the whole tree). */
  readonly ignore: readonly string[];
  readonly naming: string;
  readonly colliders: string;
  readonly lods: string;
  readonly clips: string;
  /** Engine documentation behind each convention. */
  readonly docs: readonly string[];
}

const CLIPS =
  'manifest.json clips[]: name, seconds, loop, speed (m/s) — play by name; loop from the manifest';
const FILES =
  '<out>/<asset>/{lod0,lod1,lod2}.glb + manifest.json; shared <out>/trim_sheet_{albedo,normal,orm}.png';
const LAYOUTS: Readonly<Record<Engine, EngineLayout>> = {
  godot: {
    engine: 'godot',
    profile: 'godot',
    recipes: 'assets',
    out: 'models',
    ignore: ['.ts23d/.gdignore', 'node_modules/.gdignore'],
    naming: `${FILES}; res://models/<asset>/lod0.glb is the scene to instance`,
    colliders:
      '--physics: <pivot>-convcolonly (convex) · <pivot>-colonly (trimesh) → CollisionShape3D',
    lods: 'instance lod0.glb (Godot generates mesh LODs on import) or lod0/1/2 under VisibilityRange',
    clips: `${CLIPS}; AnimationPlayer holds every clip; set Animation.loop_mode from 'loop'`,
    docs: [
      'https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/importing_3d_scenes/node_type_customization.html',
      'https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/importing_3d_scenes/available_formats.html',
    ],
  },
  unity: {
    engine: 'unity',
    profile: 'unity',
    // Not `assets/`: on case-insensitive disks it is Unity's `Assets/`, which imports every file.
    recipes: 'ts23d',
    out: 'Assets/Models/ts23d',
    ignore: [],
    naming: `${FILES}; glTFast imports each .glb as a prefab`,
    colliders:
      '--physics: KHR_physics_rigid_bodies (no Unity name convention); add colliders from extras.ts23d.collider',
    lods: 'lod0/1/2.glb into one LOD Group',
    clips: `${CLIPS}; glTFast imports clips as legacy Animation by default (Mecanim in its import settings)`,
    docs: [
      'https://docs.unity3d.com/Packages/com.unity.cloud.gltfast@latest',
      'https://docs.unity3d.com/Manual/class-LODGroup.html',
    ],
  },
  unreal: {
    engine: 'unreal',
    profile: 'unreal',
    recipes: 'assets',
    // Source files stay outside Content/; Interchange imports them and reimports on change.
    out: 'SourceArt/ts23d',
    ignore: [],
    naming: `${FILES}; import lod0.glb with Interchange into /Game/ts23d/<asset>`,
    colliders: '--physics: UCX_<pivot>_NN convex hulls → simple collision',
    lods: 'lod0.glb as the mesh (Nanite optional), lod1/lod2 into LOD slots',
    clips: `${CLIPS}; each clip becomes an AnimSequence on the imported skeleton`,
    docs: [
      'https://dev.epicgames.com/documentation/en-us/unreal-engine/fbx-static-mesh-pipeline-in-unreal-engine',
      'https://dev.epicgames.com/documentation/en-us/unreal-engine/interchange-framework-in-unreal-engine',
    ],
  },
  three: {
    engine: 'three',
    profile: 'web',
    recipes: 'assets',
    out: 'public/models',
    ignore: [],
    naming: '<out>/<asset>/<asset>.glb (MSFT_lod) + manifest.json; shared <out>/trim_sheet_*.png',
    colliders:
      '--physics: KHR_physics_rigid_bodies; nodes with extras.ts23d.collider are hidden helpers',
    lods: 'GLTFLoader draws LOD0; the MSFT_lod alternates need a plugin (three-gltf-extensions)',
    clips: `${CLIPS}; gltf.animations by name into an AnimationMixer`,
    docs: [
      'https://threejs.org/docs/pages/GLTFLoader.html',
      'https://npmjs.com/package/three-gltf-extensions',
    ],
  },
  babylon: {
    engine: 'babylon',
    profile: 'web',
    recipes: 'assets',
    out: 'public/models',
    ignore: [],
    naming: '<out>/<asset>/<asset>.glb (MSFT_lod) + manifest.json; shared <out>/trim_sheet_*.png',
    colliders:
      '--physics: KHR_physics_rigid_bodies; nodes with extras.ts23d.collider are hidden helpers',
    lods: 'the glTF loader reads MSFT_lod natively (progressive LOD)',
    clips: `${CLIPS}; result.animationGroups by name`,
    docs: [
      'https://doc.babylonjs.com/features/featuresDeepDive/importers/glTF',
      'https://doc.babylonjs.com/features/featuresDeepDive/importers/glTF/glTFFileLoader',
    ],
  },
};

/** The layout of engine `name`; an unknown name throws with the list. */
export function engineLayout(name: string): EngineLayout {
  const e = ENGINES.find((q) => q === name);
  if (!e)
    throw new Ts23dError('T3D_CLI_USAGE', {
      cause: `unknown engine '${name}'`,
      fix: `use one of: ${ENGINES.join(', ')}`,
    });
  return LAYOUTS[e];
}

/**
 * D53: a GLB in `glbDir` (project-relative) references the shared sheet as `../trim_sheet_*.png`.
 * Returns where that lands in the project; throws when it leaves the project, which an engine
 * cannot open (Godot: "Can't open file from path 'res://../trim_sheet_albedo.png'"). Keep every
 * GLB in `<out>/<asset>/` with `<out>` inside the project, or build with `--sheet embed`.
 */
export function sheetInProject(glbDir: string): string {
  const at = posix.normalize(
    posix.join(glbDir.replaceAll('\\', '/'), '..', 'trim_sheet_albedo.png'),
  );
  if (posix.isAbsolute(glbDir) || at.startsWith('../'))
    throw new Ts23dError('T3D_TEXTURE_MISSING', {
      cause: `a GLB in '${glbDir}' points at ${at}: outside the project, the engine cannot open it`,
      fix: 'keep GLBs in <out>/<asset>/ with --out inside the project (e.g. --out models), or --sheet embed',
    });
  return at;
}
