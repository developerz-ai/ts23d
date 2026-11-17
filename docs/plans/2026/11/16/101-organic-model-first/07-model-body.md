# 07 — modelBody: skeleton into a model mesh, weights, clips, gates (kinds + qa, tier 3)

Rule: the model is the surface; the sourced skeleton, the motion and the judgement are code.

## Files
| Path | State | Why |
|---|---|---|
| `src/kinds/model-fit.ts` + `.test.ts` | new | register a model mesh to a creature plan: similarity (reuse the approach of `recipes/wolf_hybrid/register.ts`: yaw starts + trimmed ICP against the code body), returns the 4×4 for the Blender `transform` step |
| `src/kinds/model-skeleton.ts` + `.test.ts` | new | snap each joint of the plan's armature to the mesh's medial axis (ray pairs across the limb), keep bone order/names, clamp moves, report residuals |
| `src/kinds/model-body.ts` + `.test.ts` | new | `modelBody(ctx, …)`: emits the skinned textured body per LOD, bones, sockets; falls back by returning `false` |
| `src/kinds/model-bind.ts` + `.test.ts` | new | weights in TS when the Blender output is unbound (`passes/skin-heat.ts`, `skin-weights.ts`), ≤ 4 influences |
| `src/kinds/model-chain.ts` + `.test.ts` | new | the request chain as one call: concept → mesh → blender, hashing outputs into the next request; returns `null` on any miss |
| `src/qa/model.ts` + `.test.ts` | new | gates below |
| `src/qa/checks.ts` or the gate table file | changed | register the gates |

## Depends on
01, 02, 03 (05/06 for the visible result).

## Change
```ts
modelChain(ctx, { concept: NeuralRequest<'image'>, surface: Omit<NeuralRequest<'mesh'>, 'image'>,
                  steps: (fit: ModelFit) => readonly BlenderStep[], spec: CreatureSpec, models?: {...} }): ImportedModel | null
modelBody(ctx, { model: ImportedModel, spec: CreatureSpec, name?: 'body', clips?: 'creature' | 'model' | readonly Clip[],
                 real: RealDimensions, eyes?: 'model' | 'code', density?: number }): ModelBodyInfo
```
- Mass: from `real.mass` (the mesh volume × density would count fur as flesh); part density back-solved so QA `mass` reads the sourced number.
- Clips: `'creature'` = `creatureClips` on the FITTED bones (gait IK reads the fitted limb lengths); `'model'` = the imported clips (Meshy humanoid).
- Jaw / eyes: v1 keeps the model's fused head (no jaw clip: `bite` dropped from the clip list, said in the manifest); a later slice may cut the jaw. Blink dropped likewise.
- Gates (`T3D_MODEL_*`, each with a `fix:`): `fit` residual (median surface distance model↔code body ≤ 6 % of height), `skeleton` (every joint inside the mesh, limb bones within 25 % of plan length), `texture` (albedo not blank: luminance std > threshold; bake hit rate from the report ≥ 0.98), `weights` (existing `skin` gate), `deform` (existing gate over the clips), `ground` (four paws within 1 cm of z = 0 in rest pose).
- LOD: lod0/1/2 from the Blender `lods` step; triangle budgets from `budget.triangles`.

## Tests
Failure first: a mesh rotated 90° about Z still registers; a mesh with a missing leg fails `T3D_MODEL_SKELETON`; a blank albedo fails `T3D_MODEL_TEXTURE`. Fixtures: a capsule-built quadruped mesh generated in the test (no Blender).

## Checks
`bun test src/kinds src/qa` · `bun run verify --only lint,typecheck,boundaries,filesize,determinism`

## Docs
`docs/idea/09-kinds.md` (model tier), `docs/architecture/defect-catalogue.md` rows for each new gate.

## Done when
Slice 08 builds on it without recipe-local registration code.
