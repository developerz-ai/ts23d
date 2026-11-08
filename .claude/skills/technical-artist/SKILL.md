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
| 9 | Determinism | `ctx.rng` / `ctx.rng.fork(name)` only; `assertDeterministic`, `snapshotHash`; `bun run determinism` | same bytes twice |
| 10 | Performance of the build | `bun run bench`; `optimize` pass; cache meshes via `definePart` | gate < 5 min in CI |
| 11 | Automate | test beside the recipe, failure case first; new rule → script in `bun run verify` | the rule fails a broken asset |

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
