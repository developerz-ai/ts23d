# 23 — "Use ts23d and let's build a game": the agent's asset department inside any game project (cli tier 5 + docs)

Rule: a coding agent building a game (Godot, three.js, Unity, Unreal, Babylon) uses ts23d as its asset department: one command to set up, a plan derived from the game brief, assets rebuilt on save into the engine's import folder, and a manifest the agent reads to write game code. ts23d still ships assets only, never game or engine code.

## Files
| Path | State | Why |
|---|---|---|
| `src/cli/init-cmd.ts` + `.test.ts` | new | `t3d init [--engine godot|unity|unreal|three|babylon]`: creates `assets/` (recipes), `assets/style.ts` (style bible scaffold, 16), `assets/PLAN.md` (template), `t3d.config.ts` (output dir = the engine's import folder, profile, optional adapters), `.mcp.json` entry (22), a `package.json` script; idempotent, never overwrites |
| `src/cli/plan-template.ts` + `.test.ts` | new | `assets/PLAN.md` template: game brief → sets (characters, creatures, buildings, props, terrain, FX sockets) → per asset: kind, real refs, budget per platform tier, clips needed, sockets/hitboxes the game code will use; `t3d plan check` validates it against existing recipes (missing / extra / over budget) |
| `src/cli/watch.ts` + `.test.ts` | new | `t3d build --watch`: rebuild changed recipes (and dependants via import graph) into the import folder; debounce; prints QA findings with fix; never exits on a failing recipe |
| `src/export/profile.ts` | changed | engine profiles grow conventions: folder layout, file naming, collider suffixes (`-col` Godot, `UCX_` Unreal), LOD naming, clip naming, manifest copy beside each GLB |
| `docs/guides/game-project.md` | new | the agent's playbook: brief → plan → style → build → look → critique → integrate; per-engine import notes with snippets (docs only) |
| `examples/game-starter/` | new | a tiny three.js scene (not shipped in the package) that loads a built asset + plays its clips from the manifest — proof the contract is enough to write game code; excluded from `files` |

## Depends on
09/10 (clips, hitboxes, sockets in the manifest), 16 (style bible, sets, scene budgets), 22 (MCP).

## Change
- `t3d init` output is plain files the agent edits; no hidden state.
- Watch mode uses the same build path as `t3d build` (same bytes).
- Neutral wording: no engine is favoured; each profile is a convention table with sources (engine docs links).

## Tests
Failure first: `init` in a folder with an existing `assets/` refuses to overwrite and lists what it skipped; `plan check` flags a planned asset with no recipe and a recipe over its platform budget; watch rebuilds only the changed recipe and its dependants; Godot profile names colliders `-col`.

## Checks
`bun test src/cli/{init-cmd,plan-template,watch}.test.ts src/export/profile.test.ts` · `--only lint,typecheck,boundaries,pack` · manual: in a scratch Godot project, an agent runs `t3d init --engine godot`, plans three assets from a one-line brief, builds them with `--watch`, and the starter scene shows them animated.

## Done when
"Use ts23d and let's build a small game" works end to end for an agent in a fresh project, with assets that import into the chosen engine without hand fixes.
