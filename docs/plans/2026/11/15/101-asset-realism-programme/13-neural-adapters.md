# 13 — Neural adapters (ADR 014/015): any model, cached, validated (neural tier 2, cli)

Rule: the library defines tasks, cache and validation; users plug in any model through an adapter. A missing cache never breaks a CPU build.

## Files
| Path | State | Why |
|---|---|---|
| `src/neural/adapter.ts` + `.test.ts` | new | `NeuralAdapter { id, tasks, run(task, req): Promise<Result> }`; job key = sha256(canonical JSON{contract, task, model, weightsSha256, seed, params, input sha256s}) floats rounded 1e-6 |
| `src/neural/http-adapter.ts` + `.test.ts` | new | `t3d-neural/1`: `GET /v1/models` → `[{id, task, licence, weightsSha256, vramGb}]`; `POST /v1/jobs`; `GET /v1/jobs/:id`; timeouts, size caps, `T3D_NEURAL_FAILED` |
| `src/neural/comfy-adapter.ts` + `.test.ts` | new | runs a user's ComfyUI workflow JSON (`/prompt`, `/history`), maps named outputs to task results |
| `src/neural/openai-image-adapter.ts` + `.test.ts` | new | any OpenAI-compatible `/v1/images/generations` endpoint for the `image` task |
| `src/neural/mock-adapter.ts` | new | deterministic fake per task for tests and CI (replaces ad-hoc fixtures) |
| `src/neural/recipe-cache.ts` + `.test.ts` | new | `recipes/<name>/neural/<key>/{output.*, record.json}`; 8 MB cap per recipe; `offline` mode; miss → `{ fallback: true }` + `T3D_NEURAL_MISSING` notice, throw only with `requireNeural` |
| `src/neural/record.ts` + `.test.ts` | new | `record.json`: model, licence (reported, never gated), weights hash, request, output hashes, server version; feeds `src/export/credits.ts` via manifest |
| `src/neural/generator.ts` | changed | `localGenerator` `:27` implemented as a thin wrapper over the `mesh` task (keeps the shipped signature) |
| `src/neural/refine.ts` | changed | becomes a client of `adapter.ts` + `recipe-cache.ts` (`:116` fix text updated) |
| `src/finish/http.ts` | changed | `httpFinish` over the `texture` task |
| `src/cli/config.ts` + `.test.ts` | new | loads `t3d.config.ts` (`defineConfig({ neural: { mesh: http(url, 'pixal3d'), … } })`) |
| `src/cli/neural-cmd.ts` + `.test.ts` | new | `t3d neural run <recipe>` (fills the cache), `t3d neural ls` (models from adapters), `--require-neural` |
| `.gitignore` | changed | drop `/.ts23d/finish/` once finish moves to the recipe cache |

## Depends on
01.

## Change
- Recipes ask through `ctx.neural(task, req)` (added in 15) → cache hit returns validated bytes; miss returns `null` so the recipe takes its CPU path.
- Every output passes task validation before use: mesh (manifold-ish, bounds, triangle cap), texture (size, finite), rig (`T3D_SKIN_INVALID` rules), motion (finite quats, loop), image (decodes).
- Licence: `checkLicence` (`import-licence.ts:39`) stays for imports; for neural it only records. `scripts/recipes.ts` refuses committed outputs whose record says outputs not redistributable (repo policy, ADR 015).

## Tests
Failure first: server returns wrong mime → `T3D_NEURAL_OUTPUT_INVALID`; cache miss offline → fallback + notice, with `requireNeural` → throws; same request twice → same key; key changes with seed.

## Checks
`bun test src/neural src/cli/config.test.ts src/cli/neural-cmd.test.ts` · `--only lint,typecheck,boundaries,determinism,pack` (library still imports under Node; no new runtime deps)

## Docs
`docs/idea/08-neural-adapters.md` rewritten around adapters; README "Bring your own model"; SECURITY.md (network, sizes).

## Done when
A recipe test using `mockAdapter` round-trips every task through the cache; CI has no network.
