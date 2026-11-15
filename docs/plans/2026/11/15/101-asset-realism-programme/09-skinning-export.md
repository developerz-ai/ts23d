# 09 — Skinning, morph targets, named clips in glTF (passes + export)

Rule: a creature or character ships as one skinned body with ≤ 4 influences per vertex, weights from its own sculpt, and named looping clips.

## Files
| Path | State | Why |
|---|---|---|
| `src/passes/skin-weights.ts` + `.test.ts` | new | per vertex: distance to each bone's roundCone d_i; w_i = exp(−(d_i − d_min)/k), k from the sculpt blend radius; top 4, renormalise, quantise 1/255 |
| `src/passes/skin-heat.ts` + `.test.ts` | new | fallback for imported meshes: voxel geodesic heat diffusion (no bleed across the leg gap) |
| `src/passes/morph.ts` + `.test.ts` | new | re-evaluate the sculpt with a changed parameter (jaw open, blink, breathe), project rest vertices along the field gradient |
| `src/export/skin.ts` + `.test.ts` | new | `skins[]`, `inverseBindMatrices`, `JOINTS_0`/`WEIGHTS_0`, joint nodes from `Skeleton` |
| `src/export/morph-targets.ts` + `.test.ts` | new | sparse `targets`, `weights` animation channel |
| `src/export/clips.ts` + `.test.ts` | new | named `Clip`s (01) → glTF animations; `run` from `Motion` stays as one of them |
| `src/export/glb.ts` | changed | `:208–209` single `run` clip → `clips.ts`; skinned primitive path |
| `src/qa/skin.ts` + `.test.ts` | new | `T3D_SKIN_INVALID`: sums, ≤ 4, every bone used, bind pose reproduces rest positions |
| `src/kinds/creature.ts` is NOT here | — | 05 owns it; it already emits bones; this slice reads `Skeleton` |

## Depends on
01, 05 (skeleton).

## Change
- `skinWeights(mesh, skeleton, { blend })`; `budget.bones` enforced (`T3D_SKIN_INVALID` names the cap).
- Engine contract in the manifest: `skeleton` (bone names + parents), `clips` (name, seconds, loop, root speed m/s).
- Per-bone hitboxes: one capsule per bone fitted to its weighted vertices (covers ≥ 95 % of them), emitted through the existing physics export as children of the joint nodes; manifest lists them. Sockets (`ctx.socket`) may parent to a bone (`hand_r`) so props ride the skeleton.
- Khronos validator passes on skinned + morphed GLB (add to the existing validator test set).

## Tests
Failure first: weights that sum to 0.98 fail; 5 influences fail; bind pose off by 1e-4 fails; skinned cylinder bent 90° keeps volume ≥ 85% (feeds 10).

## Checks
`bun test src/passes/skin-*.test.ts src/passes/morph.test.ts src/export/{skin,morph-targets,clips}.test.ts src/qa/skin.test.ts` · `--only determinism,build,pack`

## Docs
`docs/architecture/gltf-capabilities.md` (skins, morphs, clips); rigger-animator skill.

## Done when
`recipes/wolf` GLB imports into three.js (site viewer) with a skeleton and plays named clips.
