// CI, a step of every `gate` shard: does this push / PR touch anything the recipe work (recipes
// gate + shots) reads? Reads changed paths (one per line) on stdin, prints `recipes=true|false` for
// $GITHUB_OUTPUT. Docs outside recipes/ cannot change a compile, a QA verdict or a render, so a
// docs-only change skips that work; lint, types, every test and the checks still run (tests read
// README.md, CHANGELOG.md and docs/). No input (unknown diff) means run everything.
//   git diff --name-only "$BASE...$HEAD" | bun run scripts/ci-changes.ts
// Imports nothing, so it runs before or without `bun install`.

/** A path that only documents: Markdown or docs/ outside recipes/ (recipe READMEs are gated). */
export function isDoc(path: string): boolean {
  if (path.startsWith('recipes/')) return false;
  return path.endsWith('.md') || path.startsWith('docs/') || path === 'LICENSE';
}

/** Whether the recipe work must run: anything but docs changed, or nothing is known. */
export function needsRecipes(changed: readonly string[]): boolean {
  const files = changed.map((f) => f.trim()).filter(Boolean);
  return files.length === 0 || !files.every(isDoc);
}

if (import.meta.main) {
  const changed = (await Bun.stdin.text()).split('\n');
  console.log(`recipes=${needsRecipes(changed)}`);
}
