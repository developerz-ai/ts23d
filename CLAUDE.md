# CLAUDE.md

## ts23d

`@developerz-ai/ts23d`: a **free 3D asset generator you drive with a coding agent**. Assets are
TypeScript modules (`recipes/*.ts`, never JSON) that compile deterministically to game-ready GLB:
named pivoted parts, baked motion, 3 LODs from one source, one shared trim-sheet material, a QA gate
that fails the build, and a zero-GPU six-view **contact sheet** the agent reads to check its own work.
Bun only. Zero runtime dependencies. Status: 0.x scaffold — `planned.ts` files throw
`T3D_NOT_IMPLEMENTED` on purpose; `docs/plans/roadmap.md` owns what lands when.

## Axioms (override any instinct that conflicts)
1. **Code, not data.** The DSL is TypeScript: loops, functions, `ctx.use` composition. No JSON recipes.
2. **Deterministic or broken.** Same source + seed = same bytes. `ctx.rng` only; `bun run determinism` refuses the rest.
3. **Real units, real references.** Metres, Z up, +X front. Vehicles/buildings declare `real` + `sources` + spec `measures`; the `proportions` (±5%) and `measures` (±2%) gates hold them to it. Parts must physically touch what holds them (`floating-parts`) and moving parts must clear everything (`clashes`).
4. **Detail is LOD-gated, not decimated.** A recipe reads `ctx.lod` and *chooses* what to emit.
5. **One material.** Everything maps onto the shared trim sheet; colour is vertex colour. One draw call per asset.
6. **The agent must be able to see.** Every asset has a contact sheet; every error has a code and a `fix:`.
7. **Enforced, not documented.** A rule that isn't a script in `bun run verify` is a suggestion.

## Commands (repo root)
| Task | Command |
|---|---|
| fresh clone → ready | `bun run setup` |
| **the gate** (≡ CI) | `bun run verify` · one step: `bun run verify --only <step>` · `--json` |
| compile + QA a recipe | `bun run t3d build recipes/t34.ts --out out` |
| contact sheet (READ the PNG) | `bun run t3d shot recipes/t34.ts --out renders` |
| all contact sheets | `bun run shots` |
| one test file | `bun test src/primitives/prism.test.ts` |
| lint fix | `bun run lint:fix` |
| demo site | `bun run site:dev` · `bun run site:build` |
| release | `bun run release <x.y.z>` → PR `chore: release x.y.z` → merge (see `PUBLISHING.md`) |

Gate steps, in order: lint · typecheck · boundaries · determinism · filesize · test · recipes · build
(`STEPS` in `scripts/verify.ts`).

## Layout
```
src/<module>/     the library — one module per responsibility, tiered (below)
src/index.ts      the public barrel; subpaths @developerz-ai/ts23d/<module>
recipes/          gallery assets — TypeScript, one asset per file, CI-gated
refs/             reference dossiers — sourced specs + photo links, written before each recipe
apps/site/        GitHub Pages gallery (Vite + three.js), compiles recipes in the browser
scripts/          the gate and its guards; release/build/setup (Bun TS, tested)
docs/             idea/ (what+why) · decisions/ (ADRs) · architecture/ · plans/roadmap.md
.claude/          agents, commands, skills for this repo · .dz/ developerz.ai bot policy
```

## Module tiers — imports only go DOWN
| Tier | Modules |
|---|---|
| 0 | `core` (IR, asset DSL, transforms, rng, errors) |
| 1 | `grammar` (split, Whyte) · `material` (trim sheet, palettes, generator) |
| 2 | `primitives` · `passes` · `neural` (optional AI adapters) |
| 3 | `kinds` · `qa` · `export` · `render` |
| 4 | `cli` |
Cross-module imports go through `../<module>/index.ts` only. Enforced by `bun run boundaries`;
`scripts/lib/tiers.ts` is the executable copy of this table.

## Non-negotiables
- **No `any`, no non-null `!`, no default exports, `import type` for types.** Biome fails the build.
- **Never throw a bare `Error`** in `src/`: `Ts23dError(code, { cause, fix })`. Codes `T3D_*`, stable once shipped.
- **SRP.** One file, one job, target < 200 LOC, ceiling 300 (`bun run filesize`). Header comment = the job.
- **Tests next to source**, failure case first. A test that can't fail isn't one.
- **No runtime dependencies** in the library. The site may depend on three/vite.
- **Planned ≠ shipped.** Docs label stubs as planned; `notImplemented()` names the plan.
- **Neutral positioning.** Never claim to beat Meshy/Tripo/etc. We're the free, code-based option.

## Recipes — the agent loop
The human names a thing → the agent researches specs + real photos into `refs/<name>.md` →
`real` + `sources` + `measures` → masses → `t3d build` until QA PASS → `t3d shot` → **Read
the PNG** → LOD-gated detail (build once, `place` N times, `merge`) → `grime` → iterate. Full skill:
`.claude/skills/author-recipe/SKILL.md`. Quality bar: competes with real game assets up close, a few
hundred triangles at LOD2.

## How to work
Senior, proactive, finish the job: fix, test, document, run the gate. Decide and state decisions
instead of asking what the code or docs answer. Ask only before irreversible/outward-facing acts.

**Hive rules** (big tasks: `/feature`): one checkout, **never git worktrees**; only the top-level agent
spawns; each agent gets an exclusive file set and no git; max 4 parallel; the coordinator runs the
full gate once at the end.

## CI (free GitHub runners, < 5 min)
`ci.yml` — `verify` (= `bun run verify`) + `shots` (contact-sheet artifact per PR) · `pages.yml` —
gallery to developerz-ai.github.io/ts23d · `release-tag.yml` + `release.yml` — release PR merge → tag →
npm via OIDC (no tokens). Every action pinned by SHA; Dependabot moves pins.
