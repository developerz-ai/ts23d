# 01 — Vision

**Plug ts23d into Claude Code (or Codex) and build game-ready 3D assets, then the game, from TypeScript.** Use the LLM you already pay for to write every asset your game needs (vehicles, buildings, props, whole streets), optimised by construction. The agent writes each asset as a TypeScript module; ts23d compiles it, deterministically, to game-ready glTF and renders a contact sheet so the agent can check its own work.

Proof it reaches a game: the [drivable demo](https://developerz-ai.github.io/ts23d/#play), a tank composed from the gallery recipes, its wheels and turret driven through the recipe's named parts.

## From prompt to game

| Step | You do | ts23d gives you |
|---|---|---|
| 1. Install | `bun add @developerz-ai/ts23d`; copy `node_modules/@developerz-ai/ts23d/.claude/skills/author-recipe` into `.claude/skills/` (Claude Code), or point your `AGENTS.md` at `node_modules/@developerz-ai/ts23d/AGENTS.md` (Codex) | The agent knows the loop |
| 2. Ask | `/new-recipe Tiger I, mid-production 1943, fully stowed` · "add a 4-4-0 steam loco with tender and make it run on a loop" · "compose a 1940s city street with townhouses and gas lamps" (townhouse, lamp, street recipes: landing) | A recipe that passes QA, three LODs, a contact sheet |
| 3. Bind | Load the GLB, find `turret`, `gun`, `road_wheel_*` by name, play the baked `run` clip | Engine-agnostic node names; three.js, Godot and Unity read the same file |

The three.js snippet: [README](../../README.md#3-bind-the-parts-in-your-engine).

## The pitch

| You bring | ts23d gives you |
|---|---|
| A coding agent (Claude Code, Codex, any model that writes TS) | A DSL that agent already knows: TypeScript |
| A description, a reference photo, real dimensions | GLB × 3 LODs, named + pivoted parts, baked loop animations |
| A machine with Bun | No GPU, no credits, no account, no service |
| A target engine | One texture set, batched draw calls, LODs, compact core-glTF buffers: high detail, cheap to draw |
| Git | Assets as diffable source; same seed → same bytes |

## The promise, both halves

| Half | Means | How |
|---|---|---|
| **High definition up close** | Hero detail: rivets, rods, window sashes, real proportions | Code places detail N times for free; `real` dimensions + the `proportions` gate; painted trim sheet |
| **Cheap to draw** | Games pay per draw call, per vertex fetch, per byte | One shared material, static geometry batched into its pivot, so draw calls = the parts your engine moves (a static building: 1); 3 LODs from one source; u16 indices and colours today; welded, vertex-cache-ordered buffers via `optimize`, an opt-in web profile (quantisation + meshopt) and LOD switch hints planned (M2) |

## No Blender for most of the work

**The DSL does the modelling.** For hard-surface assets (vehicles, buildings, props, whole scenes) the LLM writes TypeScript, and ts23d does the rest:

| Blender-era step | In ts23d |
|---|---|
| Modelling | `primitives` + `kinds`, real units, pivots where parts hinge |
| LODs | `ctx.lod`: the same recipe re-run at lower detail |
| UV unwrap | UVs land on the shared trim sheet by world metres, automatically |
| Batching / joining meshes | `toGlb` merges static geometry into its nearest pivot |
| Checking | QA gates + contact sheet |
| Export | `toGlb`, zero dependencies |

Blender stays useful for organic sculpting: people, animals, hero rocks. Those come in through the planned [`/neural` adapter or `importGlb`](08-neural-adapters.md).

## One pipeline, no other libraries

**A game developer should need nothing else between "describe the asset" and "drop it in the engine".**

| Stage | Module | Status (2026-10) | Replaces |
|---|---|---|---|
| Geometry | `primitives`, `kinds` | Shipped: `box`, `lathe`, `prism`, `beam`, `planar`, `sweep`, `loft`, `heightfield`, facades, vehicles, Weber–Penn trees. Planned: `sdf`, roofs, hulls, creatures | Blender modelling |
| Materials and textures | `material` (generator) | Shipped: procedural albedo / normal / ORM trim sheet, embedded or shared PNGs, palettes, `grime`. No KTX2 yet | Substance / texture tools |
| Optimisation | `passes/optimize`, `export` | Shipped: u16 indices, u16 colours, batching. Planned, M2: weld, vertex-cache reorder, ACMR; opt-in `web` profile (quantisation + meshopt) | meshoptimizer / gltfpack |
| LODs | `ctx.lod` | Shipped | Decimators |
| QA | `qa` | Shipped: budget, surface-contact floating parts, motion clashes, names, proportions, spec measures. Silhouette IoU and ACMR planned | Manual review |
| Renders and photo match | `render` | Contact sheet shipped. Photo match planned, M2 | — |
| GLB export | `export` | Shipped: core glTF only, faces +Z, seamless loops, trim-sheet textures, 0 glTF-Validator errors (tested) | — |
| Engine adapters | `threeMaterialSource` (TSL), `godotShaderSource` | Shipped: shader sources. Planned: Unity import settings | — |

Every stage has zero runtime dependencies ([ADR 005](../decisions/005-zero-runtime-deps.md)).

## Origin

Inspired by an in-house pipeline that started on AI mesh generation (Meshy plus an image model) and moved to a JSON recipe compiler. Why it moved:

| Problem with generated meshes | What a recipe compiler does instead |
|---|---|
| Credit cost per attempt, per iteration | Free; iteration costs a rebuild |
| No reproducibility: same prompt, different mesh | Same source + seed → same bytes |
| One fused mesh, no named parts | `turret`, `gun`, `axle_0`: pivoted, animatable |
| A texture per asset → a draw call per asset | One shared trim sheet → one material |
| Every mesh needed repair (holes, scale, pivots, topology) | Built correct: real units, pivots set where parts hinge |

ts23d keeps that pipeline's ideas and goes one step further: recipes are **TypeScript, not JSON** ([ADR 002](../decisions/002-typescript-not-json.md)).

## Ideas carried over

| Idea | Where it lives | Status (2026-10) |
|---|---|---|
| CGA split grammar for facades: `"pier:0.9 \| {arch:2.5}* \| door:3 \| pier:~"` | `grammar/split.ts`, `kinds/building.ts` | Shipped |
| Domain-native params: Whyte `4-4-0` for locomotives | `grammar/whyte.ts`, `kinds/vehicle.ts` | Shipped |
| Masses, then details | Recipe convention; `setbacks` + `facade` | Shipped |
| Real units (metres) | Everywhere | Shipped |
| Real dimensions with sources, held by QA | `defineAsset({ real, sources })`, `proportions` + `measures` gates | Shipped |
| Era/region palettes | `material/palette.ts` | Shipped (4 palettes) |
| LODs by re-running the recipe at a detail level | `compile(asset, { lod })` | Shipped |
| A QA gate that fails the build | `qa/gates.ts` | Shipped (7 gates incl. recipe `checks`); more planned |
| Closed-loop agent iteration with multi-view renders | `render/sheet.ts`, `t3d shot` | Shipped |
| Weber–Penn botanical skeletons | `kinds/vegetation.ts` → `tree`, `trees` | Shipped |
| Photo match: photo · model · overlay in one PNG, plus silhouette IoU | `render` → `photoMatch` | Planned, M2 |
| Reverse direction: a VLM infers recipe params from photos, scored by silhouette IoU | builds on `photoMatch` | Planned, M6 |

## Principles

- **Code is the asset.** The GLB is a build artefact. Recipes are committed; `out/` is not.
- **Deterministic.** No ambient entropy, no wall clock. Byte-identical output for the same source + seed.
- **Errors are instructions.** Every failure carries a `T3D_*` code, the cause and the fix ([errors](../architecture/errors.md)).
- **The agent is the user.** Contact sheets, `--json`, and fix lines exist for an agent reading them, not for a human at a GUI.
- **Zero runtime dependencies** ([ADR 005](../decisions/005-zero-runtime-deps.md)).
- **Honest about fit.** Strong on hard-surface; weak on living things ([what fits](07-what-fits.md)).

## Non-goals

- Beating image-to-3D models at organic, sculpted forms. Use them, or the planned [neural adapter](08-neural-adapters.md).
- A modelling GUI. The editor is your agent; the viewer is the [gallery](https://developerz-ai.github.io/ts23d/).
- Photoreal hero assets. Target: game-ready, stylised-to-realistic props at consistent texel density.
- A hosted service. Everything runs on your machine.
