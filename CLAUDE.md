# CLAUDE.md

`AGENTS.md` is a symlink to this file: one brain for Claude Code, Codex, Cursor and the rest. In a
project that installed the package, read `node_modules/@developerz.ai/ts23d/CLAUDE.md` (npm does not ship the symlink).

## Rules first
**North star: humans bring ideas, agents ship assets good enough to use as-is.** Every judgement an artist makes (references, proportions, build quality, "does it look right") must be a check the agent can run; no human polish step. **Art is text here:** every art principle has a measurable definition, a DSL word and a check ([16-art-as-text](docs/idea/16-art-as-text.md)).

- **Generate assets, not engines.** Output ends at GLB + textures + manifest for Unity, Unreal, Godot, three.js, Babylon or any glTF reader. No game, engine or runtime code here; the site is an asset gallery, never a game.
- **Code, not data.** Recipes are TypeScript (`recipes/<name>/<name>.ts`), never JSON: loops, functions, `ctx.use` composition.
- **Deterministic or broken.** Same source + seed = same bytes on any CPU and C library. `ctx.rng` only; `dmath.sin` etc., never the `Math.sin` family or `**` (libm's last bit differs per machine); `bun run determinism` refuses the rest.
- **Real units and references.** Metres, Z up, +X front. Vehicles/buildings declare `real` + `sources` + spec `measures`; gates: `proportions` ±5%, `measures` ±2%. Parts touch their supports (`floating-parts`); moving parts clear everything (`clashes`); no slit you can see light through (`gaps`; real openings declared with a `why`).
- **LOD-gate, never decimate.** Recipes read `ctx.lod` and choose what to emit. Imported and model-built meshes (scans, CC0 base meshes, image-to-3D output) are the one exception: they have no recipe to gate, so `simplify` or the Blender `retopo`/`lods` steps may decimate them (gated: bbox, surface, tunnels, UV), never code-built geometry (ADR 011, 016).
- **One material.** Shared trim sheet, vertex colour; one draw per moving pivot (plus one merged static body), capped by `budget.draws`. Exception (ADR 016): a model-built part may carry its own `TextureSet` (albedo, normal, ORM; on every LOD; no `paint`/`finish`); declare `budget.textureSets { count, size }`; one material per set.
- **See the result.** Every asset has a contact sheet (`sheet.png`: six views in the hero's base colours, trim-sheet albedo × vertex colour) and a beauty render (`hero.png`); every error and QA finding has a `T3D_*` code and a `fix:`.
- **Enforce rules.** A rule without a script in `bun run verify` is a suggestion. Every defect found once gets a row in `docs/architecture/defect-catalogue.md` and a check that fails on it before the fix.

## Project and stack
`@developerz.ai/ts23d`, **TypeScript to 3D** (ts23d): free, coding-agent-driven 3D asset generator. Deterministic game-ready GLB: named pivoted parts, baked motion, 3 LODs from one source, shared trim-sheet material, build-failing QA and zero-GPU six-view contact sheets the agent reads.

| Area | Stack / constraint |
|---|---|
| Library | TypeScript; Bun only (pin: `.bun-version`); zero runtime dependencies. The CLI needs Bun; the library imports under Node ≥ 22 (`pack` step proves both) |
| Gallery | Vite + three.js; site may depend on three/vite; compiles recipes in-browser |
| Status | 0.x; anything unbuilt throws `T3D_NOT_IMPLEMENTED` on purpose; `docs/plans/roadmap.md` owns delivery |

## Non-negotiables
- **No `any`, non-null `!` or default exports; `import type` for types.** Biome fails the build.
- **No bare `Error` in `src/`.** Use `Ts23dError(code, { cause, fix })`; shipped `T3D_*` codes stay stable.
- **SRP.** One file, one job; target < 200 LOC, ceiling 300 (`bun run filesize`); header comment states the job.
- **Tests beside source, failure case first.** A test that can't fail isn't one.
- **Planned ≠ shipped.** Label stubs as planned; `notImplemented()` names the plan.
- **No placeholder output.** Full file asked → full file; never `// ...`, "rest of the code", "same as above", `TODO: implement` (`bun run placeholders`). Blocked → `notImplemented()` + name the gap in the PR.
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
| Fill a recipe's model outputs (image, mesh, rig, Blender; ≤ 5 rounds; paid adapters print credits, `--yes-spend` above 50) | `bun run t3d neural run recipes/<name>/<name>.ts` |
| Look at a Blender step program (clay, wire, weights, poses, turnaround PNGs + `review.md`; needs Blender; never cached) | `bun run t3d blender review recipes/<name>/<name>.ts --out review` |
| Chain Blender steps in one open Blender (batches, undo, review; `finish` writes a program, assets still come from `t3d neural run`) | `bun run t3d blender session start --mesh <glb>` · `run <batch.json>` · `undo` · `status` · `finish --out <program.json>` · `stop` |
| Share the machine (several agents) | `t3d queue status` · `t3d queue run [--cpu <n\|all>] [--blender] [--gpu] -- <cmd>` · `t3d queue hold -- <cmd>` · `t3d queue clear --stale`; heavy commands and `bun run verify` queue themselves (`T3D_QUEUE=wait\|fail\|off`, off in CI) |
| One test file | `bun test src/primitives/prism.test.ts` |
| Lint fix | `bun run lint:fix` |
| Gallery | `bun run site:dev` · `bun run site:build` |
| Plan a big change | `/planx <goal>` → `docs/plans/<YYYY>/<MM>/<DD>/<1NN>-<slug>/` → `/feature <overview.md>` |
| Release | `bun run release <x.y.z>` → PR `chore: release x.y.z` → merge; see `PUBLISHING.md` |
| Changelog links + `docs/changelog/` pages (release runs it; `--check` in the gate) | `bun run changelog` |

Gate order (`STEPS` in `scripts/verify.ts`, 11 steps): lint · typecheck · boundaries · determinism · filesize · placeholders · conventions · test · recipes · build · pack. `--only` with an unknown step exits 2. Shards 2..n run only `recipes`; `recipes` also runs each recipe's `*.test.ts`. Pre-push runs only the fast steps.

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
**Organic branch (creature, humanoid; As of 2026-11):** hard surface stays code. Code-sculpted organics did not look right, so the body is **model-first, Blender-first**: concept image (exact side profile for a quadruped, A-pose front for a biped, flat light) → image-to-3D mesh (`keep: 'local'`) → recipe-written `blender` steps (shell `retopo`, `uv`, `bake`, `bind`, `lods`; look with `t3d blender review`, adjust, look) → `importModel` as one textured part per LOD; code keeps scale, skeleton, clips, budgets, QA (`model` gate). Kinds: `modelChain` + `defineModelCreature` (quadruped), `riggedChain` + `defineModelCharacter` (rigged humanoid). Skill: `creature-artist` / `character-artist`; playbook: `docs/playbooks/characters/`. No GPU and no key: Blender-only body (`skinBody`, `metaballs`) or the CPU creature/mannequin, with honest expectations (fused fingers, sculpted hair, no jaw or blink on a fused head).
**Bodies beyond four legs (As of 2026-11):** `defineBodyPlan` builds trees of bone chains (mirrored fins, radial arms, many necks); `swimClips`, `snakeClips`, `hydraClips`, `octopusClips` bake motion from published numbers ([research](docs/research/swim-and-tentacle-animation.md)); `medium: 'water'` turns off ground rules and turns on the `swim` gate.
**Recipes may be long.** Agents write code cheaply: a hero asset is 500–1,500 lines that sculpts its own forms (block-out from separate masses → planes → features → detail), not a one-line preset call. Kinds give defaults; recipes override and add until it looks professional.

## Coordination and CI
- **Finish the job:** fix, test, document, run the gate. Decide and state decisions rather than asking what code/docs answer. Ask only before irreversible/outward-facing acts.
- **Hive** (big tasks: `/feature`): one checkout, never git worktrees; only the top-level agent spawns; exclusive file sets, no git for agents; max 4 parallel; coordinator runs the full gate once at the end. Heavy commands take turns through the machine queue (ADR 017): a `t3d queue: waiting …` line is not a failure, `T3D_QUEUE_BUSY` / `T3D_QUEUE_TIMEOUT` mean a busy machine, not wrong code; never write `sleep`/`pgrep` wait loops, use `t3d queue status`.
- **CI:** free GitHub runners; target < 5 min (As of 2026-11: measured 5.5 min and 67 runner-minutes on 18 shards, slowest job 299 s; since then the costs are that run's GitHub seconds (`bun run scripts/recipe-costs.ts --from-run <id>`), then measured 4.6 min with the slowest job at 269 s, see `docs/maintenance.md`). `ci.yml`: `gate` (18 shards, `T3D_SHARD=k/18`: each runs `bun run verify` — its `bun test --shard` slice plus its recipe units balanced by `scripts/lib/recipe-costs.json`; shard 1 also lint, types, build, pack — then `bun run shots` on its render units, failing on any change under `recipes/*/out` and uploading contact sheets when it fails; docs-only changes skip recipes and shots), `site`, and the aggregate `verify`, the one required check. `pages.yml`: gallery to developerz-ai.github.io/ts23d. `release-tag.yml` (idempotent) + `release.yml` (runs the full gate; refuses a tag not on a green `main` commit): release PR merge → tag → npm via OIDC (no tokens). Every action SHA-pinned; Dependabot moves pins.
- **AI-maintained, for years untouched:** `.dz/maintainer/maintainer.yml` sets the developerz.ai lanes (review + merge on green for every author, triage, `devops.watch: advisories`, weekly `release-due` (Mon), the only lane that cuts releases, monthly `improve` and `cleanup` which also moves the Bun pin and runs a January yearly review). [`docs/maintenance.md`](docs/maintenance.md) maps what decays over a decade to the lane that catches it; keep it true when a lane changes. Only owner settings (rulesets, npm trusted publisher, 1.0.0) stay human.

## Using the library in another project
`bun add @developerz.ai/ts23d`, write `assets/<name>/<name>.ts` exporting `defineAsset({...})`, then
`bunx -p @developerz.ai/ts23d t3d build assets/<name>/<name>.ts --out out` (GLB × 3 LODs + QA, exit 1 on a finding) and
`bunx -p @developerz.ai/ts23d t3d shot` / `hero` / `review` to look. Fix what QA prints (every finding has a `fix:`) and what
you see. No CLI needed: the same steps are functions (`compile`, `runQa`, `toGlb`, `contactSheet`,
`beauty`), see `examples/build-with-bun.ts`; test helpers in `@developerz.ai/ts23d/testing`.
Always scope it (`-p @developerz.ai/ts23d`): the bare binary name outside a project with the package fetches an
unrelated npm package named `t3d`. Skills (artist workflows) ship as plain markdown:
`node_modules/@developerz.ai/ts23d/.claude/skills/<skill>/SKILL.md`. Optional MCP server:
`claude mcp add ts23d -- bunx -p @developerz.ai/ts23d t3d mcp`.
