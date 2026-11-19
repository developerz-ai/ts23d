// The one error type. Every failure carries a stable code, the cause, and the exact fix — the
// reader is usually an agent, and an error it can act on is worth ten it has to interpret.

export type ErrorCode =
  | 'T3D_NOT_IMPLEMENTED'
  | 'T3D_GRAMMAR_SYNTAX'
  | 'T3D_GRAMMAR_OVERFLOW'
  | 'T3D_PART_DUPLICATE'
  | 'T3D_PART_UNKNOWN'
  | 'T3D_RECIPE_INVALID'
  | 'T3D_NO_ASSET_EXPORT'
  | 'T3D_QA_FAILED'
  | 'T3D_RENDER_OPTIONS'
  | 'T3D_AMBIENT_RANDOM'
  | 'T3D_RELEASE'
  | 'T3D_BENCH'
  | 'T3D_MATERIAL_INVALID'
  | 'T3D_MATERIAL_UNKNOWN'
  | 'T3D_MATERIAL_CONFLICT'
  | 'T3D_SHEET_FULL'
  | 'T3D_TEXTURE_MISSING'
  | 'T3D_SVG_INVALID'
  | 'T3D_JOINT_MISMATCH'
  | 'T3D_JOINT_GAP'
  | 'T3D_JOINT_OFFSET'
  | 'T3D_JOINT_BURIED'
  | 'T3D_PART_PARAMS'
  | 'T3D_MASS_MISMATCH'
  | 'T3D_PHYSICS_INVALID'
  | 'T3D_ASSERT_INPUT'
  | 'T3D_ART_SILHOUETTE'
  | 'T3D_ART_FOCAL'
  | 'T3D_ART_REST'
  | 'T3D_ART_GROUNDED'
  | 'T3D_ART_SHAPE'
  | 'T3D_CONNECT_INVALID'
  | 'T3D_CONNECT_ISLAND'
  | 'T3D_CONNECT_POINT'
  | 'T3D_CONNECT_GLUED'
  | 'T3D_CONNECT_CREASE'
  | 'T3D_CONNECT_POKE'
  | 'T3D_CONNECT_BURIED'
  | 'T3D_CONNECT_SOCKET'
  | 'T3D_CONNECT_EYE_EXPOSED'
  | 'T3D_CONNECT_EYE_STARE'
  | 'T3D_CONNECT_EYE_GAZE'
  | 'T3D_CONNECT_SEAM'
  | 'T3D_AUDIO_INVALID'
  | 'T3D_AUDIO_MATERIAL'
  | 'T3D_AUDIO_CONFLICT'
  | 'T3D_TUNE_INVALID'
  | 'T3D_IMPORT_GLB'
  | 'T3D_IMPORT_UNSUPPORTED'
  | 'T3D_IMPORT_EMPTY'
  | 'T3D_IMPORT_LICENSE'
  | 'T3D_IMPORT_HASH'
  | 'T3D_IMPORT_MISSING'
  | 'T3D_SIMPLIFY_INVALID'
  | 'T3D_BAKE_INVALID'
  | 'T3D_REFINE_FAILED'
  | 'T3D_DATA_QID'
  | 'T3D_DATA_PROPERTY'
  | 'T3D_DATA_UNIT'
  | 'T3D_DATA_HASH'
  | 'T3D_DATA_DEM'
  | 'T3D_DATA_OSM'
  | 'T3D_FINISH_INVALID'
  | 'T3D_FINISH_MODEL'
  | 'T3D_FINISH_PALETTE_DRIFT'
  | 'T3D_FINISH_MASK_LEAK'
  | 'T3D_WARP_INVALID'
  | 'T3D_RECIPE_NOT_FOUND'
  | 'T3D_RECIPE_THREW'
  | 'T3D_CLI_USAGE'
  | 'T3D_ASSET_DUPLICATE'
  | 'T3D_QUEUE_BUSY'
  | 'T3D_QUEUE_TIMEOUT'
  | 'T3D_GRAMMAR_UNDERFILL'
  | 'T3D_TEAM_COLOUR_HIDDEN'
  | 'T3D_SKIN_INVALID'
  | 'T3D_SKIN_CROSSED'
  | 'T3D_DEFORM_VOLUME'
  | 'T3D_DEFORM_INTERSECT'
  | 'T3D_DEFORM_STRETCH'
  | 'T3D_GAIT_FOOT_SLIDE'
  | 'T3D_NEURAL_MISSING'
  | 'T3D_NEURAL_FAILED'
  | 'T3D_NEURAL_OUTPUT_INVALID'
  | 'T3D_NEURAL_INPUT'
  | 'T3D_REF_SILHOUETTE'
  | 'T3D_REF_VALUE'
  | 'T3D_REF_DETAIL'
  | 'T3D_CRITIQUE_INFLATED'
  | 'T3D_CRITIQUE_REGRESSED'
  | 'T3D_CRITIQUE_BELOW_FLOOR'
  | 'T3D_BAKE_FAILED'
  | 'T3D_STYLE_OUTLIER'
  | 'T3D_SCENE_BUDGET'
  | 'T3D_FUR_SILHOUETTE'
  | 'T3D_TEXTURE_INVALID'
  | 'T3D_MODEL_FIT'
  | 'T3D_MODEL_SKELETON';

export interface ErrorDetails {
  readonly cause: string;
  readonly fix: string;
}

export class Ts23dError extends Error {
  readonly code: ErrorCode;
  readonly fix: string;

  constructor(code: ErrorCode, details: ErrorDetails) {
    super(`${code}: ${details.cause}`);
    this.name = 'Ts23dError';
    this.code = code;
    this.fix = details.fix;
  }

  toJSON(): { code: ErrorCode; message: string; fix: string } {
    return { code: this.code, message: this.message, fix: this.fix };
  }
}

/**
 * True for a Ts23dError from ANY copy of the library. A recipe and the CLI can load different
 * copies (a `bunx -p` CLI over a project's node_modules), and `instanceof` is false across copies,
 * which would turn a coded error into an uncoded one. Brand: name, a `T3D_*` code, fix, toJSON.
 */
export function isTs23dError(e: unknown): e is Ts23dError {
  if (e instanceof Ts23dError) return true;
  if (!(e instanceof Error)) return false;
  const c = e as Error & { code?: unknown; fix?: unknown; toJSON?: unknown };
  return (
    c.name === 'Ts23dError' &&
    typeof c.code === 'string' &&
    c.code.startsWith('T3D_') &&
    typeof c.fix === 'string' &&
    typeof c.toJSON === 'function'
  );
}

/** Placeholder for a planned seam. Names the plan so the agent knows where the work is tracked. */
export function notImplemented(what: string, plan = 'docs/plans/roadmap.md'): never {
  throw new Ts23dError('T3D_NOT_IMPLEMENTED', {
    cause: `${what} is declared but not built yet`,
    fix: `implement it — the spec and its slice are in ${plan}`,
  });
}
