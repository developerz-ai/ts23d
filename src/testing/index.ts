// Public API of /testing: assertions for users' own recipe tests (`bun test`, vitest, node:test —
// framework-agnostic: each throws a Ts23dError with findings and a fix, or returns quietly).

export {
  assertBudget,
  assertMeasure,
  assertMotionClear,
  assertParts,
  assertQaPass,
  type QaOptions,
} from './assert.ts';
export { ALL_LODS, compileLods, describeFinding, type LodOptions } from './compiled.ts';
export { hashBytes } from './hash.ts';
export { assertDeterministic, type SnapshotOptions, snapshotHash } from './snapshot.ts';
