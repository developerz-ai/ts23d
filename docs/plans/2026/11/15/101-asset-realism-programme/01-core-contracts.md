# 01 — Core contracts and decisions (tier 0)

Rule: every type and code the programme needs exists before any other slice starts.

## Files
| Path | State | Why |
|---|---|---|
| `src/core/errors.ts` | changed | all new codes (only slice that edits the union, `:4–76`) |
| `docs/architecture/errors.md` | changed | rows for every new code, format of `:16` |
| `src/core/skeleton.ts` + `.test.ts` | new | `Bone`, `Skeleton`, `ctx.bone` validation |
| `src/core/clip.ts` + `.test.ts` | new | named keyframe clips (`Clip`, `Track`) |
| `src/core/mesh.ts`, `mesh.test.ts` | changed | optional `joints` (Uint16Array ×4) / `weights` (Float32Array ×4), `morphs` |
| `src/core/definition.ts` | changed | `ctx.bone`, `Budget.bones?`, `Budget.heroTextures?`, `clips?` on asset |
| `src/core/asset.ts` | changed | wire `ctx.bone`, collect clips |
| `src/core/neural-task.ts` + `.test.ts` | new | task names + request/result shapes shared by neural and kinds |
| `src/core/style.ts` + `.test.ts` | new | `defineStyle` types (used by 16) |
| `docs/decisions/012-hero-texture-tier.md` | new | ADR (overview table) |
| `docs/decisions/013-skinned-meshes.md` | new | ADR |
| `docs/decisions/014-neural-outputs-are-cached-inputs.md` | new | ADR; supersedes cache text in 08/22 idea docs |
| `docs/decisions/015-models-by-adapter.md` | new | ADR incl. OSM/ODbL |
| `docs/decisions/README.md` | changed | index rows |

## Depends on
Nothing.

## Change
- `Armature = { bones: Bone[] }` (named `Armature`: `Skeleton` is the shipped body-plan type in `kinds`), `Bone = { name, parent?: string, head: Vec3, tail: Vec3, limit?: JointLimit }` (metres, Z up). `ctx.bone(name, o)` returns the name; duplicate / unknown parent / cycle → `T3D_RECIPE_INVALID`.
- `Clip = { name, seconds, loop: boolean, tracks: Track[] }`, `Track = { bone|part, path: 'rotation'|'translation'|'scale'|'weights', times: Float32Array, values: Float32Array }`. Existing `Motion` stays; export turns it into the `run` clip as today.
- `Mesh.joints?/weights?` must both be present or absent; `morphs?: { name, positions: Float32Array }[]` same vertex count.
- Budget: `bones?: number` (default 64 when a skeleton exists), `heroTextures?: { size: 1024|2048|4096 }`.
- `NeuralTask = 'image'|'mesh'|'texture'|'rig'|'motion'|'hair'|'score'` with typed request/result per task (inputs by sha256; outputs `Uint8Array` + mime).
- New codes (`fix:` text in errors.md):

| Code | Thrown by | Fix says |
|---|---|---|
| `T3D_SKIN_INVALID` | 09 | which vertex/bone; weights must sum to 1, ≤ 4 influences |
| `T3D_DEFORM_VOLUME` / `T3D_DEFORM_INTERSECT` / `T3D_DEFORM_STRETCH` | 10 | joint + pose; add a helper bone or move the pivot |
| `T3D_GAIT_FOOT_SLIDE` | 10 | leg + frame; stride vs speed |
| `T3D_NEURAL_MISSING` | 13 | `t3d neural run <recipe>` with a configured adapter |
| `T3D_NEURAL_FAILED` | 13 | adapter, task, server message |
| `T3D_NEURAL_OUTPUT_INVALID` | 13/15 | which validation failed |
| `T3D_REF_SILHOUETTE` / `T3D_REF_VALUE` / `T3D_REF_DETAIL` | 02 | view + metric + target |
| `T3D_CRITIQUE_INFLATED` / `T3D_CRITIQUE_REGRESSED` / `T3D_CRITIQUE_BELOW_FLOOR` | 03 | predicted vs claimed, baseline, floor |
| `T3D_BAKE_FAILED` | 11 | ray-miss share, cage distance |
| `T3D_STYLE_OUTLIER` / `T3D_SCENE_BUDGET` | 16 | metric + robust z / budget line |
| `T3D_FUR_SILHOUETTE` | 07 | zones that did not break the outline |

## Tests
Failure first: duplicate bone, cycle, joints without weights, morph length mismatch, clip with unsorted times → coded errors. Then a valid skeleton round-trips.

## Checks
`bun test src/core` · `bun run verify --only lint,typecheck,boundaries,filesize,conventions`

## Docs
ADRs 012–015; errors.md rows; `docs/idea/08-neural-adapters.md:56,67` and `22-ai-finish.md:55` point at ADR 014.

## Done when
Every later slice compiles against these types; no recipe output changes.
