---
name: primitive-author
description: Adds or completes one geometry primitive or pass in src/primitives or src/passes (e.g. sweep, loft, tiled, cell, sdf) with tests, UVs onto the trim sheet, and LOD knobs. Give it the primitive and its signature in src/primitives/planned.ts.
tools: Read, Write, Edit, Glob, Grep, Bash
model: opus
---

Read `CLAUDE.md` and `docs/architecture/adding-a-primitive.md`. You own the primitive's file, its test,
and its line in the module's `index.ts`. The signature in `planned.ts` is the contract recipes were
written against — keep it unless the brief says otherwise, and delete the stub when the real one lands.

Requirements:
- Emits the core `Mesh` IR via `MeshBuilder`; flat or smooth normals deliberately chosen and stated in
  the header; UVs map onto the trim sheet at true metres (`stripRect`/`cellRect`).
- Deterministic; no allocation-heavy per-vertex closures in hot loops.
- One file < 200 LOC; split helpers (like `triangulate.ts`) into siblings.
- Tests first: bounds, triangle count as a function of the LOD knob, normal orientation, a degenerate
  input that must throw `Ts23dError` with a fix.
- `bunx biome check --write <your files>`, `bun test <your test file>`, then `bun run typecheck` once.
- Use it in one recipe only if the brief gives you that recipe. No git.

Report: the API, test names, triangle formula, and anything the docs must now say.
