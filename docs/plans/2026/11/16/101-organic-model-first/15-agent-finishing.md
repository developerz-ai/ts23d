# 15 — Agent finishing loop in Blender: script, rig adjustments, review renders (neural + examples)

Rule: an agent finishes a model the way an artist does — look, adjust, look again — and every adjustment is a step in the recipe.

## Files
| Path | State | Why |
|---|---|---|
| `src/neural/blender-steps.ts`, `blender-step-fields.ts` (+ tests) | changed | steps `script`, `joint`, `weights`, `review` |
| `examples/blender/tasks/steps/script.py`, `rigfix.py`, `review.py` | new | the ops |
| `examples/blender/tasks/blender.py`, `examples/blender/README.md` | changed | dispatch + op table |
| `src/core/neural-task.ts` | changed | `blender` may return `image/png` review outputs after the GLB and the report |
| `src/neural/validate.ts` (+ test) | changed | allow them |
| `src/cli/blender-review-cmd.ts` (+ test) | new | `t3d blender review <recipe>`: run the recipe's program with a `review` step appended, write the PNGs to `--out` (never cached, never in a build) |

## Depends on
02, 07.

## Change
| op | Fields | Blender |
|---|---|---|
| `script` | `python` (source text), `why` (required) | runs after the previous step with `obj` (active mesh), `source` (bake source), `arm` (armature or None), `bpy`, `bmesh`, `mathutils` in scope; must leave one mesh active; gated like any step (counts, bbox, weights) |
| `joint` | `bone`, `head?`, `tail?` (asset frame, metres) | edit-bone move before `bind` |
| `weights` | `kind` ('assign' \| 'smooth' \| 'scale'), `bone`, `mask` (sphere / box / below-plane), `value?`, `iterations?` | vertex-group edit after `bind`; renormalise, limit 4 |
| `review` | `views` (['clay','wire','weights','poses']), `size` (1024), `poses?` ([{ bone, axis, degrees }]) | Workbench matcap + cavity, wireframe overlay, per-bone weight heat map sheet, posed frames; PNG outputs |

- `script` source is part of the program JSON, so it is part of the cache key; the report records its sha256 and stdout tail. No network, no file access outside the job directory (documented, not sandboxed: a recipe is code).
- `t3d blender review` needs Blender on this machine; without it: `T3D_NEURAL_FAILED` with the `t3d setup tools` fix.

## Tests
Failure first: `script` without `why`; `weights` before `bind`; `joint` after `bind`; a script that deletes the mesh fails the gate with the step index. Fake tool in `bun test`; `test_steps.py` self-test covers the ops on a generated blob.

## Checks
`bun test src/neural src/core src/cli` · `verify --only typecheck,lint,boundaries,filesize,placeholders,conventions`

## Docs
`docs/idea/12-blender-bridge.md`; creature-artist and rigger-animator skills get the loop (slice 13).

## Done when
On the wolf: a review sheet shows clay, wire, weights and three poses; one `weights` fix and one `script` fix visibly change the next review.
