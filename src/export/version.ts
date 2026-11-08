// The package version written into every GLB (`asset.generator`, XMP CreatorTool). Kept as a
// constant because the library may not import package.json (rootDir is src); version.test.ts
// fails the gate when the two disagree, and `bun run release` stamps both.

export const VERSION = '0.4.0';
export const GENERATOR = `@developerz.ai/ts23d ${VERSION}`;
