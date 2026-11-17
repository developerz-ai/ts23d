# 14 — Local outputs in the recipe cache (neural, cli, gate)

Rule: an output too big to commit stays on the machine that made it; its sha256 is still committed, and a build is the same build with or without the file.

## Files
| Path | State | Why |
|---|---|---|
| `src/core/neural-task.ts`, `neural-ctx.ts` | changed | `NeuralOutput.sha256` / `.absent`; `NeuralCtxAsk.keep: 'local'` |
| `src/neural/record.ts` + `.test.ts` | changed | `"local": true` per output, file `local-<i>.<ext>`; old records load unchanged |
| `src/neural/recipe-cache.ts` + `.test.ts` | changed | cap 12 MB of committed bytes; absent local → hit; `keep` carried from miss to fill; `absentLocal()` |
| `src/cli/neural-store.ts` | changed | builds never read local files; a fill writes `neural/.gitignore` |
| `src/cli/neural-local.ts` | new | a miss fed by an absent local output: not sent, its own notice |
| `src/cli/neural-cmd.ts` + `.test.ts` | changed | rounds skip those misses; `=` lines mark absent local outputs |
| `scripts/lib/neural-cache.ts` + `.test.ts`, `scripts/recipes.ts` | new / changed | the committed-cache gate: hashes, cap, tracked local files |
| `src/neural/wire.ts`, `t3d.config.example.ts` | changed | the 64 MB reply cap's `fix:` names `http(url, model, { maxBytes })` |
| `.gitignore` | changed | `recipes/*/neural/*/local-*` |
| `docs/decisions/014-neural-outputs-are-cached-inputs.md`, `docs/idea/08-neural-adapters.md` | changed | amendment 2026-11-16; cache section |

## Depends on
02 (the `blender` task whose `mesh` input is the local output). Consumed by 07 (`sha256`, `absent`, `keep`) and 08–11 (chains).

## Change
- Chain: concept `image` (≈ 1 MB) → raw `mesh` (70–106 MB at 1 M faces) → `blender` steps (≈ 8 MB, what the build uses). `ctx.neural('mesh', request, { inputs, keep: 'local' })` keeps the raw mesh local; `keep` is storage policy and never enters the key.
- Fill: outputs of a `keep: 'local'` ask are written as `<key>/local-<i>.<ext>`; `record.json` marks each `"local": true` with sha256 and byte length; they do not count toward the cap (12 MB of committed bytes, was 8).
- Ignore: one repo rule (`recipes/*/neural/*/local-*`) plus `neural/.gitignore` (`*/local-*`, constant bytes) written with the first local output, so projects that use the package are covered too.
- Read: every served output carries `sha256`. A local output whose file is not loaded is `{ bytes: empty, mime, sha256, absent: true }` and the request is a hit. Builds (`provideRecipeNeural`) never load local files, so the build does not depend on the machine; `t3d neural run` loads them to send on.
- `t3d neural run`: a miss whose request names an absent local output is not sent; `missing` holds "input <sha> is a local output not on this machine" with the upstream key directory in the `fix:`. A fresh clone with the downstream output committed is all hits.
- Gate (`neuralCacheViolations`): record parses, present files match their sha256, a committed output must exist, committed bytes ≤ cap, no local file is tracked (`git ls-files`; git failing is a violation, not a pass).
- `httpAdapter` keeps its 64 MB default reply cap (it bounds an untrusted reply; `SECURITY.md` states it); a config raises it per adapter with `http(url, model, { maxBytes })`.
- `recipes/**` untouched: slice 08 moves `wolf_hybrid` to a local raw mesh.

## Tests
Failure first: a tracked local file fails the gate; a missing or changed committed output fails; a changed local file fails; `local` and the file name must agree in `record.json`. Then: absent local → hit with `absent`; cap ignores local bytes; `keep` is not in the key; old records load; a chain run with the upstream file removed is all hits; with the downstream output removed too, the specific notice and no adapter call.

## Checks
`bun test src/neural src/core src/cli scripts` · `bun run verify --only typecheck` · `bun run verify --only lint,boundaries,filesize,placeholders,conventions,determinism`

## Docs
ADR 014 amendment, `docs/idea/08-neural-adapters.md`. Coordinator: `README.md:398` and `SECURITY.md:27` still say 8 MB.

## Done when
Tests green; `neuralCacheViolations` passes on `recipes/wolf_hybrid` and `recipes/human_head` unchanged; slice 08 can commit a chain whose raw mesh never enters git.
