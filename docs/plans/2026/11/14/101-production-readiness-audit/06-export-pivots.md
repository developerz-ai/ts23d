# 06 — Export pivots (tier 3)

Rule: the GLB node of a part sits where QA and the renderer measured it.

## Files
| Path | State | Why |
|---|---|---|
| `src/export/merge-pivots.ts`, `merge-pivots.test.ts` | changed | reparent pivots whose parent merges away |
| `src/export/hierarchy.ts` + its test | changed | unknown parent is an error, not the root |

## Depends on
01 (`body` reserved in core, so `ROOT = 'body'` at `merge-pivots.ts:73` can no longer collide).

## Change
- `mergeToPivots` (`merge-pivots.ts:~180-184`): when a static meshed parent folds into `body`, each surviving pivot (moving or empty part) gets `parent` = its nearest surviving pivot ancestor or `null`, and `at` / `yaw` recomputed from world transforms relative to that ancestor. Use the world-transform helper core already exports (`worldTransforms`), not a second implementation.
- `writeHierarchy` (`hierarchy.ts:119`): a `parent` name with no node → `T3D_PART_UNKNOWN`, fix: "internal: pivot kept a merged parent; report with the recipe". No silent root fallback.
- The manifest's `pivots[].parent` follows the same reparenting (it is derived from the merged parts; verify, and fix in this slice only if the derivation lives under `src/export/`; if it lives in `src/cli/manifest.ts`, hand the one-line change to slice 07).

Repro: `hull` at `[0,0,1]` yaw 90° with a child `wheel` at `[1,0,0]` + spin. QA world position of
`wheel` is `(0,1,1)`; the GLB node today is at `[1,0,0]` under the root. Shipped asset affected:
`recipes/sound_demo` — `crate_knock` emitter node exported at `[0,0,0.6]`, QA says `[0,0.4,0.7]`.

## Tests
- The hull / wheel asset: exported node world translation equals the QA world position within 1e-6, at every LOD.
- A three-deep chain (static → static → moving) and a moving-under-moving chain (must stay parented).
- `writeHierarchy` with a dangling parent throws.
- Sweep test: for every recipe in a small fixed list (`sound_demo`, `joint_demo`, `t34`), each exported pivot's world position equals `worldTransforms` of the compiled asset.

## Checks
`bun test src/export` · `bun run verify --only lint,typecheck,boundaries,filesize` ·
`bun run t3d build recipes/sound_demo/sound_demo.ts --out out` QA PASS, then validate
`out/sound_demo/lod0.glb` with the bundled `gltf-validator` (0 errors) ·
`bun run t3d shot recipes/sound_demo/sound_demo.ts --out renders` and read the PNG.

## Docs
Slice 11: defect row D37 (pivot under a merged parent exports at the wrong place),
`docs/architecture/glb-production.md` hierarchy section.

## Done when
`sound_demo` exports `crate_knock` at its QA position; the sweep test passes; coordinator refreshes
`recipes/sound_demo/out/` with `bun run shots sound_demo`.
