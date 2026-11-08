---
name: environment-artist
description: An environment artist's workflow for ts23d — scenes, streets, yards, dioramas, terrain, foliage and modular kits. Grid-based block-out, kit lists, reuse with ctx.use / defineFamily / definePart, tiling walls at true texture scale, composition and leading lines, breaking repetition with seeds, LOD at scene scale. Use when building a scene asset, a modular kit, terrain, a forest, a street, a level-dressing set or anything that composes many assets.
---

# Environment artist

Use with the [author-recipe loop](../author-recipe/SKILL.md) and the playbooks under
[`buildings/`](../../../docs/playbooks/README.md) and [`nature/`](../../../docs/playbooks/README.md).
Definitions: [16-art-as-text](../../../docs/idea/16-art-as-text.md). ts23d ships **assets**, not
levels: a scene here is a GLB the engine places, not a game.

## When
A street, rail yard, plaza, ruin, forest patch, mountain diorama, interior set, or a modular kit
(walls, floors, corners, stairs, trims) meant to snap together in an engine.

## Workflow
| # | Environment stage | ts23d | Exit |
|---|---|---|---|
| 1 | Brief + reference board: era, climate, story, mood; real places for scale | dossier; playbooks (road-kerb, fences-walls, station-platform, terrain, trees) | a paragraph of story + scale references |
| 2 | Block-out on a grid with grey boxes; human scale first (doors 2.0–2.1 m, steps, kerbs) | scene asset with `box` / `mass`; grid constant `G` (e.g. 0.5 m or 1 m, *pick and state it*) | `t3d blueprint`: 1.8 m figure reads right |
| 3 | Kit list: what repeats (wall bay, window, pillar, corner, kerb run) | one `defineAsset` or `definePart` per kit piece; pivots at a corner on the grid | every piece's size is a multiple of `G` |
| 4 | Hero pieces: the 1–3 things the eye lands on | dedicated recipes; `ctx.use(hero, { prefix, at })` | hero reads in `hero.png` |
| 5 | Surfaces at true scale | `tiled` (walls, roofs, decks), `mass` (true-scale masonry courses), `opening` (recessed windows), `facade` + `split` grammar | brick course ≈ 75 mm, no stretched texture |
| 6 | Terrain and nature | `heightfield`/`terrainGrid` + `hydraulicErosion`/`thermalErosion` + `terrainColor`; `tree`/`trees` with species presets (`oak`, `pine`, `birch`, `palm`, `willow`) | slopes read, trees grounded |
| 7 | Set dressing and variation | `ctx.use(asset, { seed })` for unique instances; `ctx.rng.fork('props')`; `place` + `merge` | no visible clones side by side |
| 8 | Story and wear | `grime({ ground, zones })` near ground, drains, traffic; `weathered` strips; moss/dirt nature strips | wear follows water and feet |
| 9 | LOD at scene scale | `ctx.lod` drops whole layers (windows, props) at LOD2; `budget.triangles` for the scene | budgets met, silhouette holds |
| 10 | Present | `t3d hero --az … --el …` (a composed view), `t3d shot`, `t3d critique` | scores ≥ 8 |

## Vocabulary → measurable
| Word | Meaning here | Check |
|---|---|---|
| Grid / snap | every kit piece's footprint and height a multiple of the grid; pivot at a corner [GDC Skyrim kits] | a test: `ruler(c).size()` % G ≈ 0 (**no built-in gate**) |
| Human scale | doors 2.0–2.1 m, stair rise 150–220 mm, kerb 100–150 mm *typical, verify per country* | `real.measures`, `t3d blueprint` figure |
| Texel density | same pixels per metre across the scene | `assertTexelDensity(asset, [lo, hi])` |
| Reuse ratio | unique pieces ÷ placed pieces; low is efficient | count `ctx.use` calls vs recipes (by hand) |
| Repetition break | no two identical instances adjacent; vary seed, yaw, wear | seeds per instance; review hero |
| Leading lines | kerbs, rails, rooflines that lead to the focal piece | judge composition in `hero.png` |
| Focal point | one hero piece holds the highest value contrast | **planned** check; judge in critique |
| Rest area | ≥ 25 % of visible surface quiet (plain wall, ground) | **planned** metric |
| Storytelling | wear explains use: worn steps, stains under sills, puddles at low points | critique `wear` criterion |

## Quality bar
- [ ] Grid stated in the dossier; every kit piece snaps; pivots on grid corners.
- [ ] Human-scale features right on `blueprint.png`.
- [ ] Textures at true scale (`tiled`, `mass`), never stretched; texel density even.
- [ ] Repetition broken by seed, not by hand-copied coordinates.
- [ ] Composition: a focal piece, leading lines, rest areas, foreground/midground/background.
- [ ] Every placed thing touches the ground or its support (floating-parts at every LOD).
- [ ] LOD2 drops whole detail layers but keeps skyline and big masses.

## Common mistakes
- Detailing before the block-out reads at human scale.
- Everything snapped to grid: looks mechanical; let props break the grid.
- Identical trees/houses in a row; one seed reused.
- Non-square, odd-sized kit pieces that cannot tile.
- Uniform wear; dirt that ignores gravity and water.
- Building game logic, spawn rules or navmesh: out of scope. Assets only.

## Run order
```sh
bun run t3d build recipes/<name>/<name>.ts --out out        # QA per LOD, exit 1 on a finding
bun run t3d shot recipes/<name>/<name>.ts --out renders     # READ sheet.png
bun run t3d hero recipes/<name>/<name>.ts --out renders     # READ hero.png
bun run t3d blueprint recipes/<name>/<name>.ts --out renders  # READ blueprint.png
bun run t3d hero recipes/<name>/<name>.ts --out renders --az -20 --el 25  # composed view
bun run t3d critique recipes/<name>/<name>.ts --out tmp/critique  # READ every PNG, fill critique.json
bun run shots <name>                      # refresh committed out/
```

## Pairs with
- [architect](../architect/SKILL.md): each building in the scene.
- [prop-artist](../prop-artist/SKILL.md): set-dressing pieces.
- [material-artist](../material-artist/SKILL.md): tiling walls, ground, nature strips.
- [technical-artist](../technical-artist/SKILL.md): scene budgets and LOD layers.
- [art-director](../art-director/SKILL.md): one world, one style.

## Tool status
Shipped: `ctx.use`, `defineFamily`, `definePart`, `tiled`, `cell`, `mass`, `facade`, `setbacks`,
`opening`, `roof`, `heightfield`, erosion, `terrainColor`, `tree`/`trees`, `grime`, nature strips.
Planned: kit grid/snap gate (none today), `variations(n)`, `EXT_mesh_gpu_instancing` scatter,
`weather()` from geometry, city kit and road-network grammar ([roadmap](../../../docs/plans/roadmap.md)).
Neutral positioning: the free code-based option, no claims against other tools.
