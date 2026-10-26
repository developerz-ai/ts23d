# AGENTS.md

For any coding agent (Codex, Claude Code, Cursor, …) working **in this repo** or **using this
library** in another one.

## Scope
ts23d generates assets (GLB, textures, manifest) for whatever engine or framework you use. It ships no engine or runtime code: named nodes, sockets, emitter extras and the `run` clip are hooks for *your* engine.

## Using the library in your project
```sh
bun add @developerz-ai/ts23d
```
Write `assets/<name>.ts` exporting `defineAsset({...})`, then loop:
```sh
bunx t3d build assets/<name>.ts --out out      # GLB × 3 LODs + QA; exit 1 on a finding
bunx t3d shot  assets/<name>.ts --out renders  # ONE PNG, six labelled views — open and look at it
```
No CLI needed: the same steps are functions (`compile`, `runQa`, `toGlb`, `contactSheet`) — see `examples/build-with-bun.ts`.

Fix what QA prints (every finding has a `fix:`) and what you see in the PNG. Repeat. TypeScript only:
loops, helpers and `ctx.use(other, { prefix, at, yaw, seed })` composition are the point.

## Rules that fail the build here
- `bun run verify` is the gate; green = shippable. Run it before claiming done.
- Imports only go down the tier table (`scripts/lib/tiers.ts`), through `index.ts`.
- No `any`, no `!`, no default exports, no bare `Error` (use `Ts23dError` + `fix`).
- No `Math.random`, clocks or locale formatting in `src/` or `recipes/`.
- Files > 300 lines fail; aim < 200.
- Recipes: QA PASS at every LOD, byte-deterministic, `real` dimensions within ±5% when declared.

## Where things are
`CLAUDE.md` (commands, axioms) · `llms.txt` (link map) · `docs/idea/05-agent-loop.md` (the loop) ·
`docs/architecture/errors.md` (every `T3D_*` code) · `recipes/` (idiomatic examples).
