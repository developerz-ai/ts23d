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
  | 'T3D_AMBIENT_RANDOM'
  | 'T3D_RELEASE'
  | 'T3D_BENCH';

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

/** Placeholder for a planned seam. Names the plan so the agent knows where the work is tracked. */
export function notImplemented(what: string, plan = 'docs/plans/roadmap.md'): never {
  throw new Ts23dError('T3D_NOT_IMPLEMENTED', {
    cause: `${what} is declared but not built yet`,
    fix: `implement it — the spec and its slice are in ${plan}`,
  });
}
