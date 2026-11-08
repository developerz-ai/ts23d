// Public API of /tune: offline, deterministic black-box tuning of a recipe's declared params
// against measurable objectives (docs/idea/20-tuning.md). The result is committed as plain numbers
// (tune.json); builds read them through ctx.tuned and never run the optimiser.

export { cmaes } from './cmaes.ts';
export { coordinateSearch } from './coordinate.ts';
export { type Eigen, symmetricEigen } from './eigen.ts';
export {
  fitMask,
  type Mask,
  maskOfPng,
  modelMask,
  silhouetteIoU as tuneSilhouetteIoU,
  TUNE_VIEWS,
} from './mask.ts';
export { maskOfSvg } from './mask-svg.ts';
export { loadMasks, type ReadFile } from './masks-load.ts';
export type {
  MinimiseOptions,
  Minimum,
  Objective,
  Step,
  StopReason,
} from './minimise.ts';
export {
  type FittedMasks,
  type ObjectiveValue,
  objectiveName,
  type Score,
  scoreValues,
} from './objectives.ts';
export { convergenceTable, reportMd, tuneEntry, tuneJson } from './report.ts';
export { type Space, spaceOf } from './space.ts';
export { type StripOptions, tuneStrip } from './strip.ts';
export {
  type TuneMethod,
  type TuneOptions,
  type TuneResult,
  type TuneState,
  tune,
} from './tune.ts';
// Tune declaration types live in core (TuneSpec, TuneParam, …) and are exported from there.
