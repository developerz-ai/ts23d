# 16 — Rigged-model characters in the library (kinds, neural, render, qa)

Rule: what the first model-built humanoid carried locally is library code, so the next one is a prompt, a step list and a table of clip names.

## Files
| Path | State | Why |
|---|---|---|
| `src/kinds/model-character.ts` | new | `defineModelCharacter`: model or CPU fallback, clips rewritten per build, surface crease, density from `real.mass` |
| `src/kinds/model-character-body.ts` | new | `riggedBody`, `foldTargets` (from `recipes/ranger/body.ts`); options `boneNames`, `loop`, `lift` |
| `src/kinds/model-character-chain.ts` | new | `riggedChain`: image → mesh (local) → rig (local) → blender → `importModel`, null on any miss |
| `src/kinds/model-character-clips.ts` | new | `onBones`, `liftClip` |
| `src/kinds/model-character.test.ts` | new | refusals, fallback, fold, rename, lift, clip list per build, chain asks |
| `src/neural/import-clips-loop.ts` + `.test.ts` | new | `closeCycle`: a cycle one frame short of its period gets its closing key |
| `src/neural/import-clips.ts`, `import-model.ts` | changed | `closeLoops` option (default on), warning per closed clip |
| `src/render/input-image.ts` + `.test.ts` | changed | `cropped` reads the subject cut by the frame, not a floor band (`croppedPixels`) |
| `src/qa/gait-skin.ts`, `gait.ts` + `.test.ts` | new / changed | in-place clips: the skin of a foot may not go more than 3 mm under the floor |
| `recipes/ranger/**` | changed | on the library: `body.ts`, `clips.ts` deleted; `idle` lifted 6 mm; outputs refreshed |

## Depends on
03 (importModel), 07 (meshVolume), 09 (the ranger), 14 (local outputs).

## Change
- `defineModelCharacter({ …asset, real (with mass), model, part?, clips: { rename, loop?, lift? }, boneNames?, fallback, extra? })` → `Asset` of kind `character`. No `CreatureSpec`: the rig is the model's (`modelBody` `clips: 'model'` still asks for one, `src/kinds/model-body.ts`). Clips are known only inside `build`; the definition's list is rewritten in place per build, as `defineModelCreature` does.
- `riggedBody`: one skinned textured part for the LOD being compiled; leaf bones no clip moves fold into their parent (weights summed, exact); `boneNames` renames bones and follows them in the tracks; `loop` refuses a listed clip that did not import closed; `lift` adds metres to the root's height keys of a clip.
- `riggedChain` repeats the cache conventions of `modelChain` (hash from `sha256` or the bytes in hand, `keep: 'local'`, bytes in `ask.inputs` only when present) with a `rig` ask between mesh and Blender. Same requests, same keys: the ranger's committed cache is hit unchanged. Overlap with `model-chain.ts` (single pass) is deliberate for now: unify once that file settles.
- Loop closing moved from the recipe to the importer. Test for a missing closing frame: moving tracks keyed from 0 to the clip's end one frame apart; last pose ≠ first; the seam jump ≤ 3 × the smaller neighbouring frame step and along the motion. The appended key is key 0, one frame later (whole fps when the keys sit on one). `extras.loop: false` and `closeLoops: false` leave the clip alone.
- `cropped`: the corner flood compares with the corner colour, so a floor that shades away from it stays unflooded and is one region with the subject standing on it (measured on the ranger's concept). Border pixels that continue the flooded background smoothly along the perimeter (≤ 6 levels per pixel) are backdrop; what is left is the subject cut by the frame.
- Gait: clips whose root does not travel were not read for feet at all. Now the vertices each foot's bones carry (> 50 %; a toe bone's heel-to-ball parent included) are posed at 30 fps; lowest vertex under the floor by more than 3 mm is `T3D_QA_GAIT` with the amount to raise the root by. Floor = z 0, or the lowest foot vertex at rest when that is lower.

## Tests
Failure first: a one-shot, an eased stop and a reversed seam stay open; a subject cut by the frame over a floor band is still cropped; an in-place bob 10 mm under the floor fails; a model without rig or textures, a missing clip, a one-shot declared a loop; a miss at each chain stage. Then: the closed cycle, the floor band passing, the dip inside the limit, the fold / rename / lift contract, the chain's asks.

## Checks
`bun test --timeout 120000 src/kinds src/qa src/neural src/render recipes/ranger` · `bun run verify --only typecheck,lint,boundaries,filesize,placeholders,determinism,conventions` · `t3d build recipes/ranger/ranger.ts` QA PASS · `bun run shots ranger`.

## Docs
`recipes/ranger/README.md`. Coordinator: `docs/idea/09-kinds.md` paragraph, barrel lines, `docs/architecture/errors.md` gait row, CHANGELOG (in the slice report).

## Done when
The ranger builds from `defineModelCharacter` with the same GLB bytes as before the move (then differs only by the `idle` lift), and the new gait check passes on it.

## Found
The new gait check fails code creatures whose `idle` breath turns `spine_1` with the fore legs hanging from it (`src/kinds/creature-clips.ts`, the `idle` clip): fore paws go under the floor at frame 45. Not fixed here; listed in the slice report.
