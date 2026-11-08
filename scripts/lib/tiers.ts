// The executable copy of the module tier table (docs/architecture/README.md). A module may
// import only from strictly lower tiers — never sideways, never up.

export const TIERS: Readonly<Record<string, number>> = {
  core: 0,
  grammar: 1,
  material: 1,
  primitives: 2,
  audio: 2,
  neural: 2,
  passes: 2,
  physics: 2,
  data: 3,
  kinds: 3,
  qa: 3,
  export: 3,
  render: 3,
  testing: 4,
  tune: 4,
  finish: 4,
  cli: 5,
};

/** `src/index.ts` re-exports the public modules; it sits above all of them. */
export const ROOT_TIER = 6;
