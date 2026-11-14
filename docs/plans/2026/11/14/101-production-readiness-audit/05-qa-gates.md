# 05 — QA gates (qa tier 3, testing tier 4)

Rule: a gate that passes a broken asset is a defect; every finding carries a code and a number.

## Files
| Path | State | Why |
|---|---|---|
| `src/qa/geometry.ts`, `geometry.test.ts` | changed | sample triangle interiors |
| `src/qa/clash.ts`, `clash.test.ts` | changed | big-panel case |
| `src/qa/floating.ts` + its test | changed | sunk parts; gap + nearest part in the finding |
| `src/qa/types.ts` | changed | `Finding.code`, optional `gap` / `nearest` |
| `src/qa/gates.ts`, `measures.ts`, `sanity.ts`, `lods.ts`, `joints.ts`, `occlusion.ts`, and every other file under `src/qa/` that builds a `Finding` + tests | changed | fill `code`; NaN-safe compare; default-gate list |
| `src/qa/index.ts` | changed | exports for the above |
| `src/testing/measure.ts` + its test | changed | bare `Error` at line 15 → `Ts23dError('T3D_ASSERT_INPUT')` |
| `src/testing/*deterministic*` + its test | changed | `assertDeterministic` covers clips and sheet bytes |

## Depends on
01 (tolerance validation and constants; finding-code list in `errors.md`).

## Change
- `surfaceSamples` (`geometry.ts:158-175`) samples vertices, edges and centroids only. Add barycentric interior samples at spacing `step` for triangles whose longest edge exceeds `step`. Repro: a 1.4 m bar spinning about Z through the middle of a 0.2 × 3 × 2 m slab → `clashes()` returns `[]`. Keep the sample count bounded: cap per triangle and note the cost in the header; `recipes` step time must not grow by more than 10 % (baseline 494 s unsharded).
- `floating.ts:26-28`: grounded = some surface within `±CONTACT_EPS` of z = 0, or the part straddles z = 0. A part wholly below `-CONTACT_EPS` gets its own finding ("part is below ground by X m"). Repro: 0.3 m box at `[5, 5, -3]` passes today.
- `Finding`: `readonly code: string` (required), `readonly gap?: number` (metres), `readonly nearest?: string`. Code rule: findings that already embed a `T3D_*` code (connections, joints, mass, weather, art) lift it into the field; every other gate uses `T3D_QA_<GATE>` with the gate name upper-snake (`floating-parts` → `T3D_QA_FLOATING_PARTS`). Finding codes stay outside the `ErrorCode` union, as `T3D_CONNECT_*` findings are today.
- Floating fix text adds: "box and cylinder anchor at their base: `at.z` is the bottom".
- `measures.ts:47`, `gates.ts:79`: compare with `!(err <= tol)` so NaN fails (validation in slice 01 already blocks 0 values; this is the second lock).
- `degenerateTriangles` joins `DEFAULT_GATES` (README lists it as shipped). If committed recipes fail it, list them for the coordinator; the gate still ships.
- `assertDeterministic`: export with clips and the trim sheet so motion and sheet bytes are compared.

## Tests
Failure first:
- Rotor through a panel centre → one `clashes` finding; the existing small-part cases unchanged.
- Sunk box → finding with `code: 'T3D_QA_FLOATING_PARTS'` and a `gap` of 3 ± 0.02; a box resting on z = 0 passes; a post sunk 0.1 m into the ground (straddles) passes.
- Every gate in `DEFAULT_GATES` and `DEFAULT_LOD_GATES`: a table-driven test builds one failing asset per gate and asserts `code` matches `/^T3D_[A-Z_]+$/` and `fix` is non-empty.
- A measure whose computed error is NaN fails.
- `assertDeterministic` fails on an asset whose clip uses `Math.random` through an injected hook (or the nearest existing seam).

## Checks
`bun test src/qa src/testing` · `bun run verify --only lint,typecheck,boundaries,filesize` ·
`bun run verify --only recipes` with timing recorded in `status.yml` evidence.

## Docs
Slice 11: `docs/idea/06-qa.md` (document every default gate by backtick name; finding shape),
defect rows D35 (clash misses face interiors), D36 (underground parts count as grounded).

## Done when
Both repros produce findings; every finding has a code; `recipes` time within +10 %.
