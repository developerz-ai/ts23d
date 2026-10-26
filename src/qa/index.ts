// Public API of /qa: the gate every compiled asset passes before it ships.

export {
  DEFAULT_GATES,
  type Finding,
  floatingParts,
  type Gate,
  interpenetration,
  partNames,
  runQa,
  silhouetteIoU,
  triangleBudget,
} from './gates.ts';
