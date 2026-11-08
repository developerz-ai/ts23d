# CLAUDE.md

`AGENTS.md` links here: one brain for Claude Code, Codex, Cursor and the rest, in this repo or in a
project that installed the package.

## Rules first
**North star: humans bring ideas, agents ship assets good enough to use as-is.** Every judgement an artist makes (references, proportions, build quality, "does it look right") must be a check the agent can run; no human polish step. **Art is text here:** every art principle has a measurable definition, a DSL word and a check ([16-art-as-text](docs/idea/16-art-as-text.md)).

- **Generate assets, not engines.** Output ends at GLB + textures + manifest for Unity, Unreal, Godot, three.js, Babylon or any glTF reader. No game, engine or runtime code here; the site is an asset gallery, never a game.
- **Code, not data.** Recipes are TypeScript (`recipes/<name>/<name>.ts`), never JSON: loops, functions, `ctx.use` composition.
- **Deterministic or broken.** Same source + seed = same bytes. `ctx.rng` only; `bun run determinism` refuses the rest.
- **Real units and references.** Metres, Z up, +X front. Vehicles/buildings declare `real` + `sources` + spec `measures`; gates: `proportions` ±5%, `measures` ±2%. Parts touch their supports (`floating-parts`); moving parts clear everything (`clashes`); no slit you can see light through (`gaps`; real openings declared with a `why`).
- **LOD-gate, never decimate.** Recipes read `ctx.lod` and choose what to emit. Imported meshes (scans, CC0 base meshes) are the one exception: they have no recipe to gate, so `simplify` may decimate them, never code-built geometry (ADR 011).
- **One material.** Shared trim sheet, vertex colour, one draw call per asset.
- **See the result.** Every asset has a contact sheet and a beauty render (`hero.png`); every error has a code and `fix:`.
- **Enforce rules.** A rule without a script in `bun run verify` is a suggestion. Every defect found once gets a row in `docs/architecture/defect-catalogue.md` and a check that fails on it before the fix.

## Project and stack
`@developerz.ai/ts23d`: free, coding-agent-driven 3D asset generator. Deterministic game-ready GLB: named pivoted parts, baked motion, 3 LODs from one source, shared trim-sheet material, build-failing QA and zero-GPU six-view contact sheets the agent reads.

| Area | Stack / constraint |
|---|---|
| Library | TypeScript; Bun only (pin: `.bun-version`); zero runtime dependencies |
| Gallery | Vite + three.js; site may depend on three/vite; compiles recipes in-browser |
| Status | 0.x; anything unbuilt throws `T3D_NOT_IMPLEMENTED` on purpose; `docs/plans/roadmap.md` owns delivery |

## Non-negotiables
- **No `any`, non-null `!` or default exports; `import type` for types.** Biome fails the build.
- **No bare `Error` in `src/`.** Use `Ts23dError(code, { cause, fix })`; shipped `T3D_*` codes stay stable.
- **SRP.** One file, one job; target < 200 LOC, ceiling 300 (`bun run filesize`); header comment states the job.
- **Tests beside source, failure case first.** A test that can't fail isn't one.
- **Planned ≠ shipped.** Label stubs as planned; `notImplemented()` names the plan.
- **Neutral positioning.** Never claim to beat Meshy/Tripo/etc.; we're the free, code-based option.

## Commands (repo root)
| Task | Command |
|---|---|
| Fresh clone → ready | `bun run setup` |
| Gate (≡ CI) | `bun run verify` · one step: `bun run verify --only <step>` · `--json` |
| Compile + QA recipe | `bun run t3d build recipes/t34/t34.ts --out out` (lod0/1/2.glb + one `<asset>.glb` with all LODs via MSFT_lod; `--lods split\|single\|both`) |
| Contact sheet (READ the PNG) | `bun run t3d shot recipes/t34/t34.ts --out renders` |
| Beauty render (3/4, textured, shadowed) | `bun run t3d hero recipes/t34/t34.ts --out renders` |
| Blueprint (READ it: metre grid, L×W×H, measures green/red, joints, 1.8 m figure) | `bun run t3d blueprint recipes/t34/t34.ts --out renders` |
| AI review pack (READ `review/*.png`, follow `review.md`) | `bun run t3d review recipes/t34/t34.ts --out review` |
| Refresh committed `recipes/*/out/` | `bun run shots [name…]` (the recipes gate fails on stale outputs) |
| One test file | `bun test src/primitives/prism.test.ts` |
| Lint fix | `bun run lint:fix` |
| Gallery | `bun run site:dev` · `bun run site:build` |
| Release | `bun run release <x.y.z>` → PR `chore: release x.y.z` → merge; see `PUBLISHING.md` |

Gate order (`STEPS` in `scripts/verify.ts`): lint · typecheck · boundaries · determinism · filesize · test · recipes · build.

## Layout
| Path | Responsibility |
|---|---|
| `src/<module>/` | Library; one responsibility per module, tiered below |
| `src/index.ts` | Public barrel; subpaths `@developerz.ai/ts23d/<module>` |
| `recipes/<name>/` | One folder per asset: `<name>.ts` (entry; split big assets into sibling modules: `head.ts`, `wings.ts`, `weapon.ts`…) · `README.md` (sourced specs + photo links, written first) · `out/<asset>/` (committed hero.png, sheet.png, manifest.json); CI-gated |
| `recipes/_lib/` | Parts shared by many assets (weapons, armour, rivet rows); not assets themselves |
| `docs/playbooks/` | Per-class research playbooks (forklift, car, house, pallet, tree…): what to research, part tree, motion, signature details, materials, LOD, QA, mistakes |
| `apps/site/` | GitHub Pages asset gallery |
| `scripts/` | Gate/guards, release/build/setup; tested Bun TypeScript |
| `docs/` | `idea/` (what+why), `decisions/` (ADRs), `architecture/`, `plans/roadmap.md` |
| `.claude/` · `.dz/` | Repo agents/commands/skills · developerz.ai bot policy |

## Module tiers — imports only go DOWN
| Tier | Modules |
|---|---|
| 0 | `core` (IR, asset DSL, transforms, rng, errors) |
| 1 | `grammar` (split, Whyte) · `material` (trim sheet, palettes, generator) |
| 2 | `primitives` · `passes` · `physics` (collision shapes, mass) · `audio` (sound synthesis) · `neural` (optional AI adapters) |
| 3 | `kinds` · `qa` · `export` · `render` · `data` (Wikidata, DEM real-data adapters) |
| 4 | `testing` (assertions for users' recipe tests) · `tune` · `finish` |
| 5 | `cli` |

Cross-module imports use `../<module>/index.ts` only. `bun run boundaries` enforces this; `scripts/lib/tiers.ts` is the executable tier table.

## Recipe loop
Human names a thing → research specs + real photos into `recipes/<name>/README.md` → `real` + `sources` + `measures` → masses → `t3d build` until QA PASS → `t3d shot` + `t3d hero` → **Read the PNGs** → `t3d review` → LOD-gated detail (build once, `place` N times, `merge`) → `grime` → iterate → `bun run shots <name>`. Full skill: `.claude/skills/author-recipe/SKILL.md`. Discipline skills (character-artist, creature-artist, hard-surface-artist, architect, technical-artist, …) load a profession's workflow and checks: [skills matrix](docs/research/skills-matrix.md). Quality: competes with real game assets up close; a few hundred triangles at LOD2.
**Recipes may be long.** Agents write code cheaply: a hero asset is 500–1,500 lines that sculpts its own forms (block-out from separate masses → planes → features → detail), not a one-line preset call. Kinds give defaults; recipes override and add until it looks professional.

## Coordination and CI
- **Finish the job:** fix, test, document, run the gate. Decide and state decisions rather than asking what code/docs answer. Ask only before irreversible/outward-facing acts.
- **Hive** (big tasks: `/feature`): one checkout, never git worktrees; only the top-level agent spawns; exclusive file sets, no git for agents; max 4 parallel; coordinator runs the full gate once at the end.
- **CI:** free GitHub runners, < 5 min. `ci.yml`: `verify` (= `bun run verify`) + `shots` (contact-sheet artifacts), each as 12 parallel shards (`T3D_SHARD=k/12`: shard 1 runs every step, all shards check their slice of the recipes). `pages.yml`: gallery to developerz-ai.github.io/ts23d. `release-tag.yml` + `release.yml`: release PR merge → tag → npm via OIDC (no tokens). Every action SHA-pinned; Dependabot moves pins.

## Using the library in another project
`bun add @developerz.ai/ts23d`, write `assets/<name>.ts` exporting `defineAsset({...})`, then
`bunx t3d build assets/<name>.ts --out out` (GLB × 3 LODs + QA, exit 1 on a finding) and
`bunx t3d shot` / `hero` / `review` to look. Fix what QA prints (every finding has a `fix:`) and what
you see. No CLI needed: the same steps are functions (`compile`, `runQa`, `toGlb`, `contactSheet`,
`beauty`), see `examples/build-with-bun.ts`; test helpers in `@developerz.ai/ts23d/testing`.
