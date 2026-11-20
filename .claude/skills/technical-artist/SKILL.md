---
name: technical-artist
description: A technical artist's workflow for ts23d — budgets (triangles, draw calls, materials, texture memory), LOD policy and switch distances, MSFT_lod single-file GLBs, batching and pivots, naming contracts for engines, physics colliders, determinism, validation and automation. Use when setting or fixing budgets, LODs, export options, draw calls, engine import, performance, determinism failures, or writing tests/gates for assets.
---

# Technical artist

Use with [glb-production](../../../docs/architecture/glb-production.md),
[gltf-capabilities](../../../docs/architecture/gltf-capabilities.md),
[performance-audit](../../../docs/architecture/performance-audit.md), [06-qa](../../../docs/idea/06-qa.md)
and the [`/verify` command](../../commands/verify.md) (`bun run verify`). The TA is the
bridge between art and engine: the asset must be beautiful **and** cheap, and a rule without a
script is a suggestion.

## When
Budgets, LOD strategy, draw calls, export flags, engine import problems, colliders/mass,
determinism or hash failures, slow builds, writing a test or a gate for an asset class.

## Workflow
| # | TA stage | ts23d | Exit |
|---|---|---|---|
| 1 | Set budgets per class and LOD before modelling | `budget: { triangles: [l0, l1, l2] }`; `BUDGETS` presets | budget written in the recipe with a reason |
| 2 | LOD policy: what each LOD keeps | read `ctx.lod`; `ctx.pick([a, b, c])` for segments/counts/bevels; never decimate | LOD0 dense, LOD1 lean, LOD2 silhouette |
| 3 | Switch distances | `lodCoverage: [a, b, c]` (screen-height fractions, strictly descending) or derived | `--lods single` writes MSFT_lod + screen coverage |
| 4 | Draw calls and materials | one trim-sheet material; extra draws only per `paint` slot, `surface`, `finishes`, `optics` per pivot | draw calls in the manifest match intent |
| 5 | Hierarchy and naming | snake_case names; `ctx.group` pivots for anything engines move; `axle_*`, `wheel_*`, `door_*`, `rotor_*`; `ctx.socket`, `ctx.emitter` | `part-names` gate; static parts batch into pivots |
| 6 | Physics | `physics: { body, shell, density }`, part `collider`, `real.mass`; `t3d build --physics` | QA `mass` PASS; colliders fitted |
| 7 | Validate | `t3d build` (QA per LOD, exit 1 on a finding), glTF validator in tests, `assertQaPass`, `assertBudget` | zero findings |
| 8 | LOD quality | `assertLodSilhouette(asset, 0.85)`, `t3d review` (LOD strip, popping warnings), critique `lod` | no visible pop at game distance |
| 9 | Determinism | `ctx.rng` / `ctx.rng.fork(name)` only; `dmath.sin` etc., never the `Math.sin` family or `**`; `assertDeterministic`, `snapshotHash`; `bun run determinism` | same bytes twice, on any CPU and C library |
| 10 | Performance of the build | `bun run bench`; `optimize` pass; cache meshes via `definePart` | gate < 5 min in CI |
| 11 | Automate | test beside the recipe, failure case first; new rule → script in `bun run verify` | the rule fails a broken asset |

## Textured parts and model-built assets (ADR 016; As of 2026-11)
The trim sheet stays the default. A model-built part (kinds `modelBody`, `riggedBody`; `importModel`) may carry its
own `TextureSet`; the budget, export and gates change:
| Topic | Rule | Check |
|---|---|---|
| Declare | `budget.textureSets: { count, size }` (size 1024, 2048 or 4096; maps are square power-of-two PNGs <= size); a textured part is `opaque` or `cutout`, no `paint`, no `finish` | `T3D_TEXTURE_INVALID` names the option to drop or the budget line to add |
| Typical set | albedo 2048 (sRGB), normal 1024 (glTF green-up), ORM 1024 (R occlusion, G roughness, B metallic) | `export` step `normalSize` / `ormSize` downscale |
| Every LOD | the set rides all three LODs: one material per set, one draw per pivot per set; LOD1/2 share LOD0's maps, so a collapse across a UV seam can smear a few texels (per-LOD atlases: planned) | manifest draws; `bun run t3d build` |
| Triangles | Blender `lods` decimate (gated: bbox 1 % / 2 % of the diagonal, no lost surface, no new tunnel, <= 8 % UV-degenerate faces); never decimate code-built geometry | the step fails and names the measure |
| Gates | QA `model` (texture not blank, joints inside the mesh, mesh registered, no doubled feature, feet on z = 0), `skin`, `deform`, `gait` (in-place skin sink <= 3 mm) | `model`: `T3D_MODEL_TEXTURE`, `T3D_MODEL_SKELETON`, `T3D_MODEL_FIT`, `T3D_MODEL_DOUBLED` |
| Repository weight | committed neural outputs <= 12 MB per recipe; raw 70-100 MB meshes stay local (`keep: 'local'`, git-ignored, sha256 committed); a fresh clone resolves the chain from the committed Blender output | `bun run verify --only recipes` |
| Determinism | a model or Blender output is a cached INPUT (ADR 014): the cache key holds Blender's version and the scripts' hash; GPU runs and GPU bakes differ, so the committed bytes are the truth | `bun run determinism` |
| Look | the raster beauty, the path tracer and the contact sheet sample texture sets | `t3d hero`, `t3d shot` |

## Vocabulary → measurable
| Word | Meaning here | Check |
|---|---|---|
| Triangle budget | max triangles per LOD, per asset | `triangle-budget` gate, `assertBudget` |
| Draw call | one mesh × material submission; ts23d target 1 per pivot per material | manifest; `optimize` report |
| LOD pop | visible change when switching LOD | `t3d review` LOD-popping warning; `assertLodSilhouette` |
| Screen coverage | fraction of screen height the asset fills; drives LOD switch | `lodCoverage` → `MSFT_screencoverage` |
| Texel density | px per metre, consistent across assets of a project | `assertTexelDensity` |
| Pivot | node origin engines rotate about; at the real hinge/axle | `ctx.group`, `clashes` |
| Collider | simple shape (box/sphere/capsule/cylinder/hull) fitted per pivot | `collider`, `fitCollider` |
| Deterministic | same source + seed → same GLB bytes | `assertDeterministic`, recipes gate hashes |
| Manifold / closed / outward | watertight, consistent winding | `assertClosed`, `assertManifold`, `assertOutward`, `assertNoSelfIntersection` |

## Quality bar
- [ ] Budget per LOD declared and met with headroom; triangles spent where the camera sees.
- [ ] LOD2 is a few hundred triangles and keeps the outline (IoU ≥ 0.85).
- [ ] One trim-sheet material; each extra draw call has a reason (paint slot, glass).
- [ ] Every moving or attachable thing is a named pivot/socket; names follow the engine contract.
- [ ] glTF validator clean; `t3d build` exit 0; deterministic hash stable.
- [ ] Physics opt-in correct: body kind, mass within ±15 % of `real.mass`.
- [ ] A test exists that fails when this asset regresses.

## Common mistakes
- Decimating LOD0 instead of authoring LODs from `ctx.lod`.
- Raising the budget to pass instead of dropping invisible detail.
- A `paint` slot per tiny part: draw calls explode.
- Pivots at the mesh centre on doors and lids.
- `Math.random`, `Date.now` or object-key iteration in a recipe.
- Building engine runtime code; ts23d stops at GLB + textures + manifest.

## Test it
```ts
import { assertBudget, assertDeterministic, assertLodSilhouette, assertQaPass } from '@developerz.ai/ts23d/testing';
it('QA clean at every LOD', () => assertQaPass(asset));
it('same bytes twice', () => assertDeterministic(asset));
it('LOD2 keeps the outline', () => assertLodSilhouette(asset, 0.85));
```

## Run order
```sh
bun run t3d build recipes/<name>/<name>.ts --out out        # QA per LOD, exit 1 on a finding
bun run t3d shot recipes/<name>/<name>.ts --out renders     # READ sheet.png
bun run t3d hero recipes/<name>/<name>.ts --out renders     # READ hero.png
bun run t3d blueprint recipes/<name>/<name>.ts --out renders  # READ blueprint.png
bun run bench                             # build cost per recipe
bun run verify --only recipes             # determinism + committed outputs
bun run t3d critique recipes/<name>/<name>.ts --out tmp/critique  # READ every PNG, fill critique.json
bun run shots <name>                      # refresh committed out/
```

## Pairs with
- [rigger-animator](../rigger-animator/SKILL.md): pivots and motion.
- [presentation-artist](../presentation-artist/SKILL.md): LOD strip and review warnings.
- [art-director](../art-director/SKILL.md): budgets and texel range per set.
- [material-artist](../material-artist/SKILL.md): sheet size and texture budgets.
- [environment-artist](../environment-artist/SKILL.md): scene-level LOD layers.

## Tool status
Shipped: all named above, `--lods split|single|both`, `--sheet external|embed|none`,
`--sheet-size`, `--physics`, `--no-animations`. Planned: `--profile unreal|unity|godot|rt|web`
export profiles, collision naming (UCX_), `EXT_mesh_gpu_instancing`, skins (≤ 4 influences),
cross-machine hash comparison, texture compression formats.
Neutral positioning: the free code-based option, no claims against other tools.
