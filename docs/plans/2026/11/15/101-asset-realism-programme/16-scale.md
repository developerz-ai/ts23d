# 16 — Scale: style bible, set coherence, scene budgets, OSM city (qa, data, export, kinds)

Rule: a set of assets looks like one game; scenes declare and meet budgets; cities come from pinned real data.

## Files
| Path | State | Why |
|---|---|---|
| `src/qa/coherence.ts` + `.test.ts` | new | per set: palette ΔE2000 membership, texel-density CV, bevel-radius histogram, wear coverage, value-key mean/spread; robust z (MAD) → `T3D_STYLE_OUTLIER` |
| `src/qa/scene-budget.ts` + `.test.ts` | new | unique meshes, instances, draws, on-screen triangles at 3 reference cameras (LOD by projected size), texture memory → `T3D_SCENE_BUDGET` |
| `src/data/osm.ts` + `.test.ts` | new | parse a pinned Overpass JSON extract (footprints, heights/levels, roads, landuse); `verifyPin` (`sha256.ts:69`); ODbL attribution carried to credits |
| `scripts/data-osm.ts` + `.test.ts` | new | `bun run data osm --bbox …` fetch once, pin |
| `src/kinds/city.ts` + `.test.ts` | new | footprints → `mass`/`facade` via `defineFamily`, seed = hash(osm id); DEM ground; scene manifest of instances |
| `src/export/instancing.ts` + `.test.ts` | new | `EXT_mesh_gpu_instancing` for repeated parts |
| `src/kinds/creature-families.ts` + `.test.ts` | new | canid/felid/ursid family presets from Wikidata mass/length (`src/data`), allometric scaling; fox + bear from the wolf skeleton |
| `recipes/sets.ts` | new | declares sets (`bestiary`, `heads`, `rts`) and their style |
| `recipes/city_block/` | new | one OSM block recipe + README + out |

## Depends on
01 (`core/style.ts`), 05.

## Change
- `scripts/recipes.ts` gets a `sets` pass (coordinator wires the call; logic lives in `coherence.ts`).
- City output is assets + instances, never runtime code.

## Tests
Failure first: an off-palette recipe in a set is flagged; a scene over budget fails; footprint IoU vs source ≥ 0.9, heights ± 5%; two neighbours never identical.

## Checks
`bun test` on the files above · `t3d build recipes/city_block/city_block.ts` QA PASS · shot + hero READ

## Docs
environment-artist + art-director skills; `docs/idea/23-real-data.md` OSM.

## Done when
`city_block` and fox/bear family members build; sets pass coherence.
