// Engine export profiles: one word (`--profile unreal`, `toGlb(a, { profile: 'unreal' })`) picks
// the defaults an engine's importer wants — LOD packaging, baked AO on/off, collider naming,
// trim-sheet size. The GLB stays standard glTF 2.0 under every profile; a profile only changes
// defaults, and an explicit option always wins. Per-engine notes: docs/architecture/gltf-capabilities.md.

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
