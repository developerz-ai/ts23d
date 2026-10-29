// @developerz-ai/ts23d — the whole DSL from one import. Subpaths (`/core`, `/grammar`, …) exist for
// tree-shaking and for reading one layer at a time.

export { type AssetManifest, manifestOf } from './cli/manifest.ts';
export * from './core/index.ts';
export * from './export/index.ts';
export * from './grammar/index.ts';
export * from './kinds/index.ts';
export * from './material/index.ts';
export * from './neural/index.ts';
export * from './passes/index.ts';
export * from './primitives/index.ts';
export * from './qa/index.ts';
export * from './render/index.ts';
