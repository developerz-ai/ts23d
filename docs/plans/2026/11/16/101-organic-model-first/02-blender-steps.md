# 02 — Blender steps: a typed program in the recipe, run headless (core contract + neural, tier 2)

Rule: the recipe says WHAT to do to a mesh as ordered data; Blender does it; the output is a cached input.

## Files
| Path | State | Why |
|---|---|---|
| `src/core/neural-task.ts`, `src/core/neural-ctx.ts` | changed | task `blender`; `mesh.images`, `mesh.pose`; `rig.clips`, `rig.height`; input field `program`, `skeleton` |
| `src/neural/blender-steps.ts` + `.test.ts` | new | step types, `blenderProgram(steps)` → canonical JSON bytes (`t3d-blender-steps/1`), validation |
| `src/neural/blender-skeleton.ts` + `.test.ts` | new | `Armature` → `t3d-skeleton/1` JSON bytes (glTF frame) for `bind` |
| `src/neural/blender-adapter.ts` (+ test) | changed | task `blender` in `BLENDER_TASKS`; `BLENDER_LTS` gains what `t3d doctor` finds supported (5.3 is installed here; decide from the Blender release page, state it) ; script list per task includes `tasks/steps/*.py` |
| `src/neural/validate.ts` | changed | `blender` output: GLB with triangles (+ JSON report) |
| `examples/blender/tasks/steps.py`, `examples/blender/tasks/steps/*.py` | new | dispatcher + one file per op family (io, clean, remesh, deform, uv, bake, bind, lods) |
| `examples/blender/README.md` | changed | the op table |
| `examples/neural-server/plugins/blender_tasks.py` | changed | serve `blender` |
| `src/cli/doctor-cmd.ts`, `src/cli/tier-probe.ts` (+ tests) | changed | report the `blender` task; bake device |

## Depends on
Nothing (parallel with 01).

## Change
Contract:
```ts
readonly blender: NeuralRequestBase & {
  /** The mesh the program starts from (GLB, glTF frame). Absent: the program must start with a build op. */
  readonly mesh?: NeuralInput;
  /** `t3d-blender-steps/1` JSON: the ordered ops. */
  readonly program: NeuralInput;
  /** `t3d-skeleton/1` JSON, when a step binds. */
  readonly skeleton?: NeuralInput;
  /** Refuse an output LOD0 above this. */
  readonly maxTriangles: number;
};
// mesh request gains:   images?: readonly NeuralInput[]  (front, side, back…)   pose?: 'a-pose' | 't-pose'
// rig request gains:    height?: number (m)   clips?: readonly string[] (adapter-specific action names)
```
Steps (TS discriminated union `BlenderStep`, every number in metres / radians, every field plain):

| op | Fields (defaults) | Blender |
|---|---|---|
| `transform` | `matrix` (16, row-major, applied in the asset frame) | object matrix, applied |
| `clean` | `weld` (1e-5), `minShell` (fraction of faces, 0.002), `fillHoles` (edges, 64), `manifold` (true) | merge by distance, delete loose shells, fill, recalc normals |
| `symmetrize` | `axis` ('y'), `side` | bisect + mirror, weld seam |
| `voxelRemesh` | `voxel` (m), `adaptivity` (0) | Remesh modifier VOXEL (keeps source as bake source) |
| `smooth` | `iterations`, `factor`, `kind` ('laplacian' \| 'corrective') | modifier, applied |
| `displace` | `strength`, `scale`, `kind` ('noise' \| 'voronoi' \| 'musgrave'), `seed`, `mask?` (vertex z-range / sphere) | displace modifier with a procedural texture, on a subdivided copy |
| `inflate` | `distance`, `mask?` | shrink/fatten along normals |
| `skinBody` | `bones: [{ head, tail, r0, r1 }]`, `subdiv` (2) | Skin modifier over an edge skeleton → base mesh (the Blender-only body path) |
| `metaballs` | `balls: [{ at, r, stiffness?, negative? }]`, `resolution` | metaball union → mesh |
| `retopo` | `kind` ('decimate' \| 'quadriflow'), `triangles`, `preserveSymmetry?` | Decimate COLLAPSE or `quadriflow_remesh` + triangulate; becomes the LOD0 shell, the previous mesh becomes the bake source |
| `uv` | `kind` ('smart' \| 'unwrap'), `angle` (1.45), `margin` (0.003) | Smart UV Project / seams-by-angle + minimum-stretch unwrap, pack |
| `bake` | `size` (2048), `maps` (['albedo','normal']; also 'ao','roughness'), `cage` (m, 1 % of the bbox diagonal), `samples` (1; AO 32), `margin` (8 px) | Cycles selected-to-active; albedo as EMIT from the source base colour (also from vertex colour when the source has no texture); ORM packed R=AO G=roughness B=metallic |
| `bind` | `maxInfluences` (4), `proxyVoxel?` | parent to the armature built from `skeleton`, automatic weights; on failure a voxel proxy is weighted and weights are transferred; normalise, limit, clean (< 0.01) |
| `lods` | `triangles: [lod1, lod2]` | decimate copies keeping UVs + weights, named `lod1`, `lod2`, same textures |
| `export` | `normalSize?` (downscale), `albedoSize?` | one GLB: nodes `lod0`, `lod1`, `lod2`, PNG images, skin when bound, tangents off (TS computes MikkTSpace) |

- Report JSON (second output): per step `{ op, seconds, triangles }`, bake hit rate, bind method used, weights max influences, bbox, Blender version.
- `blenderProgram` refuses: unknown op, bake before uv, lods before retopo, no export, non-finite numbers (`T3D_RECIPE_INVALID` with the step index and a `fix:`).
- Python: `--factory-startup`, `-t` threads from the job (default 1 for the mesh ops; Cycles bake uses GPU when present, CPU otherwise, device recorded in the report). No add-on beyond the bundled glTF IO.
- Read `docs/research/blender-organic-workflows.md` first (headless facts verified on this box).

## Tests
Failure first (TS, fake tool `src/neural/fake-tool.ts`): program order errors, unknown op, non-finite; adapter refuses a report without outputs. Then: canonical JSON is stable under key order; cache key changes with any step field. Python: `examples/blender/tasks/steps/test_steps.py` runnable as `blender -b --python … -- selftest` on a generated blob (skipped in the gate; documented).
Real smoke (manual, recorded in the PR): the spike program on `~/workspace/lab/neural-models/out/best/wolf_pixal3d_best.glb` → 30 k triangles, three LODs, bound to a 5-bone test skeleton; time and hit rate in `examples/blender/README.md`.

## Checks
`bun test src/neural src/core src/cli` · `bun run verify --only lint,typecheck,boundaries,filesize,placeholders`

## Docs
`docs/idea/12-blender-bridge.md` (steps table, "not sculpt brushes" narrowed to strokes), `docs/idea/08-neural-adapters.md` (task row).

## Done when
`blenderAdapter().run({ task: 'blender', … })` returns a GLB + report for the smoke program on this box; tests green.
