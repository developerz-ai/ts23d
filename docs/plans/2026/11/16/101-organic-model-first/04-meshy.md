# 04 — Meshy behind the adapter: multi-image, pose, rigging + animation, retexture, remesh (neural)

Rule: hosted steps obey the same cache; tests never spend a credit.

## Files
| Path | State | Why |
|---|---|---|
| `src/neural/meshy-adapter.ts`, `meshy-params.ts`, `meshy-net.ts` (+ tests) | changed | new tasks and params |
| `src/neural/meshy-rig.ts` + `.test.ts` | new | `rig` task: rigging → animations → one GLB with skin + named clips |
| `src/neural/meshy-post.ts` + `.test.ts` | new | `texture` (retexture) and `meshopt`-like remesh mapping |
| `docs/research/meshy.md` | changed | what shipped, measured costs from slice 09's real calls |

## Depends on
02 (request fields `mesh.images`, `mesh.pose`, `rig.height`, `rig.clips`).

## Change
- `mesh`: `images` (1–4) → `v1/multi-image-to-3d`; `pose` → `pose_mode`; keep `target_formats: ['glb']`, `image_enhancement: false` for our own concepts (`docs/research/meshy.md` §2.1).
- `rig`: input = a GLB by sha256 uploaded as a data URI (≤ 100 MB) or the upstream task id when the mesh came from Meshy in the same record chain (`record.json` carries `provider.taskId`); `height` → `height_meters`; `clips` → animation `action_ids` looked up by name in the free library listing; output GLB merges the clips (`import-clips` names them).
- `texture`: `v1/retexture` with `enable_original_uv: true` on OUR mesh.
- Every rule in `docs/research/meshy.md` §1 holds (no re-POST, resume by task id, download at SUCCEEDED, two kinds of 429). The licence string recorded lets the recipes gate accept committed outputs only when the plan grants ownership (state what the docs say; if unclear, outputs stay uncommitted and the recipe says so).
- `balance()` helper (0 credits) for the CLI to print before a run; `t3d neural run` prints estimated credits per request and needs `--yes-spend` above 50.

## Tests
Fake fetch only (`src/neural/meshy-net.test.ts` pattern). Failure first: 429 `NoMoreConcurrentTasks`, FAILED task (refund, no retry), expired URL, rig refused for a non-humanoid. Then the happy chains.

## Checks
`bun test src/neural` · `bun run verify --only lint,typecheck,boundaries,filesize`

## Docs
`docs/research/meshy.md`, `docs/idea/08-neural-adapters.md`.

## Done when
Tests green with zero network; slice 09 can run its chain.
