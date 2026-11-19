---
name: blender-artist
description: A Blender technical artist's workflow for ts23d, driven from code — finishing AI-generated or scanned meshes in one open headless session: chained step batches with undo, surface-aware brushes (`stroke`), retopology, UVs, cage bakes, weights, review renders, and replaying the result as a program. Use when working on any `blender` step program, `t3d blender session`, `t3d blender review`, cleaning or brushing a Meshy or local-GPU mesh, fixing bakes or weights, or deciding what Blender should do for an asset.
---

# Blender artist

Use with [examples/blender/README.md](../../../examples/blender/README.md) (every op, field and
gate), [blender-leverage](../../../docs/research/blender-leverage.md) (what was tested, what is
next) and [blender-organic-workflows](../../../docs/research/blender-organic-workflows.md). Blender
is a tool the agent drives by data: no viewport, no hand edits, no step that is not written down.

## When
Finishing a generated mesh, fixing what a generator got wrong, tuning retopology, UVs, bakes or
weights, or looking at any of these. Hard-surface recipes stay code; see
[hard-surface-artist](../hard-surface-artist/SKILL.md).

## Workflow: keep one Blender open
Do not relaunch Blender per change. Work in big batches, look, adjust, and only then replay.

```sh
bun run t3d blender session start --mesh raw.glb --skeleton skeleton.json --software-gpu
bun run t3d blender session run build.json   # clean, stroke, retopo, uv, bake, bind, review
bun run t3d blender session run tweak.json   # weights, isolate, review: under a second here
bun run t3d blender session undo             # one batch back; a failed batch restores itself
bun run t3d blender session finish --out program.json --normal-size 1024
bun run t3d blender session stop             # deletes the session folder and its PNGs
```

| # | Stage | Ops in the batch | Exit |
|---|---|---|---|
| 1 | Clean what the generator left | `clean`, `unweb`, `amputate`, `symmetrize` | one body, limbs apart, report has no surprise |
| 2 | Fix form on the source | `stroke` (below) | clay review reads right |
| 3 | Game mesh | `retopo` with `focus` on face, hands, paws, hips | wire review: density where it bends and where the eye goes |
| 4 | UVs and maps | `uv`, `bake` (`cageFit: true` where parts sit close) | `hitRate` >= 0.98, no speckle between fingers or legs |
| 5 | Skin | `joint` before `bind`; `weights`, `isolate` after | weights and poses reviews are clean |
| 6 | Far versions | `lods`, then `export` when replaying | every LOD gate passes |
| 7 | Make it real | copy the finished steps into the recipe's `steps`, `t3d neural run` | committed output comes from a clean replay, never from session state |

A session is for finding the steps. It never produces a committed asset.

## Brushes: `stroke`
A brush dragged along points on the surface, with falloff measured along the surface, so a stroke on
one leg never touches the leg 3 cm away. Runs before `uv`: on the source (the bake carries it) or on
the shell right after `retopo`.

```json
{ "op": "stroke", "brush": "crease", "path": [[0.62, 0.03, 1.01], [0.64, 0.05, 1.0]],
  "radius": 0.012, "strength": 0.004, "symmetry": "y" }
```

| Artist wants | Brush | Note |
|---|---|---|
| Build up or dig a form | `draw` (negative digs) | the general brush |
| Swell a part along its own normals | `inflate` | lips, eyelids, knuckles |
| Fill a dent up to a plane | `clay` | muscle masses, planes of the head |
| Plane off a lump | `flatten` | generator bumps |
| Cut a line | `crease` | lip line, eyelid fold, finger gaps, armour seams |
| Sharpen an edge | `pinch` | ridges and brow lines |
| Remove noise | `smooth` | not yet measured on noisy surfaces: look at the result |
| Move a mass | `grab` | `path[0]` moves to `path[1]`, no `strength` |
| Stamp detail | `vdm` with `stamp` | scales, warts, sockets |

Take path points from the mesh or the rig, not by guessing. Long thin triangles make the surface
distance uneven: stroke after `voxelRemesh` or on the `retopo` shell when a raw stroke looks patchy.

## Traps (each cost real time)
| Trap | Rule |
|---|---|
| An operator says `FINISHED` and did nothing | measure the result; ops here report facts and gates, read them |
| `bpy.ops.sculpt.*` | crashes or refuses under `-b`; with a window, output changes with thread count. Never in a recipe: use `stroke` |
| Editing op defaults | changes every committed program's request key. New behaviour goes in new ops or fields without defaults |
| A cage wider than the gap between parts | fingers bake each other: use `cageFit`, or lower `cage` and `maxRay` |
| Voxel finer than a generator's tunnels | floods the inside into confetti: let `retopo` measure, or set `voxel` and `close` |
| Bone heat on nearby limbs | it reads distance, not anatomy: `unweb` first, then `isolate` chains |
| A chain generated fused to the body along its length (a tail lying on a thigh) | `unweb` cannot cut it and a hard `isolate` split stretches the joining edges: give `isolate` a `contact` distance (metres, start at 0.04) so the band shares the motion; check stifle volume does not drop |
| Decimating code-built geometry | never; only imported or model-built meshes (ADR 011, ADR 016) |
| GPU work | one job at a time on the shared GPU; `--software-gpu` reviews through lavapipe |

## Test it
```sh
bun run t3d blender session status --json
bun run t3d blender review recipes/<name>/<name>.ts --out review
blender -b --factory-startup -noaudio --python-exit-code 3 \
  --python examples/blender/tasks/steps/test_steps.py -- selftest
```
READ the PNGs and the per-step facts. Tests and CI never start Blender.

## Pairs with
[creature-artist](../creature-artist/SKILL.md) and [character-artist](../character-artist/SKILL.md)
(what a model-first body needs), [rigger-animator](../rigger-animator/SKILL.md) (weights and joint
placement), [technical-artist](../technical-artist/SKILL.md) (budgets, determinism).

## Tool status
Shipped (As of 2026-11): `t3d blender session`, `stroke`, `bake.cageFit`, review without a GPU, every
op in `src/neural/blender-steps.ts`. Blender 5.3 is the tested line; sessions need the Blender app,
not the `bpy` module. The GPL scripts are not in the npm package: installed users pass
`--scripts <checkout>/examples/blender`. Planned, ranked in the research: `lodBake`, `delight`,
`bakeRig`, `skeletonShell`, `corrective`, `scatter`.
