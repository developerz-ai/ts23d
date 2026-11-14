# 04 — Untrusted input and network (neural tier 2, data tier 3, finish tier 4)

Rule: a hostile file or a silent server costs one coded error, never a hang, an OOM or a raw throw.

## Files
| Path | State | Why |
|---|---|---|
| `src/neural/glb-read.ts`, `import-glb.ts`, `import-glb.test.ts` | changed | bounds, caps, scale checks |
| `src/neural/refine.ts`, `refine.test.ts` | changed | timeout, body errors |
| `src/finish/http.ts`, `cache.ts` + their tests | changed | timeout, reply shape |
| `src/data/wikidata.ts`, `wikidata.test.ts` | changed | statement ranking |
| `scripts/textures-zip.ts`, `textures-zip.test.ts` | changed | inflate cap, header bounds |
| `scripts/textures-ambientcg.ts`, `textures-polyhaven.ts`, `data-dem.ts`, `data-wikidata.ts` | changed | fetch timeouts |

## Depends on
01.

## Change
- `glb-read.ts:120,144-160,187`: `count`, `byteOffset`, `byteLength` must be integers ≥ 0 and lie inside their bufferView; an accessor without a bufferView is capped at 2^24 elements; `atob` failure on a data URI is caught. All → `T3D_IMPORT_GLB` through the existing `bad()`. Today: `count: -1` and `byteOffset: -4` throw `RangeError`, a bad data URI throws `DOMException`, `count: 1e10` attempts a ~120 GB allocation.
- `import-glb.ts:107-128`: `scale`, `height`, `fit` finite and > 0 → `T3D_IMPORT_UNSUPPORTED`, fix: "mirror with `place({ scale: [-1,1,1] })`, which flips winding". Today `height: -2` returns signed volume −6 and `scale: 0` returns 0 triangles.
- `refine.ts` public option types: replace the DOM `RequestInit` / `Response` references with a local structural type, so `dist/neural/refine.d.ts` type-checks without the DOM lib (slice 09's smoke test checks it).
- `refine.ts:100-103`: option `timeoutMs` (default 600 000) via `AbortSignal.timeout`; abort and `res.arrayBuffer()` rejection → `T3D_REFINE_FAILED`, fix names the endpoint and the option.
- `finish/http.ts:68-76`: option `timeoutMs` (default 300 000) → `T3D_FINISH_MODEL`; reject a reply whose `images.length !== views.length` before `cache.ts` stores it. CLI flag for it is slice 07 (`--timeout <s>`).
- `wikidata.ts:~80` `best()`: filter to snaks with a `datavalue` before ranking; a unitless (`1`) length statement is skipped when another usable statement exists, and only throws `T3D_DATA_UNIT` when none does.
- `textures-zip.ts`: `inflateRawSync(…, { maxOutputLength })` from the entry's declared size (cap 256 MB); header offsets bounds-checked; scripts may throw plain `Error` but the message names the file.
- Network scripts: `AbortSignal.timeout(60_000)` on every `fetch`.

## Tests
- Four malformed GLB fixtures built in-test (negative count, negative offset, bad base64, huge count) → `T3D_IMPORT_GLB`; the huge-count case must return in < 1 s.
- `importGlb(src, { height: -2 })`, `{ scale: 0 }` throw.
- A `Bun.serve` that never answers + `timeoutMs: 50` → coded error within 1 s, for both `refine` and the finish HTTP model. Finish reply with one image for six views → rejected, cache stays empty.
- Wikidata: first statement `somevalue`, second normal-rank metres → second is returned.
- Zip with a declared size smaller than its inflated size → error, not a 1 GB buffer.

## Checks
`bun test src/neural src/finish src/data scripts/textures-zip.test.ts scripts/textures.test.ts scripts/data.test.ts` ·
`bun run verify --only lint,typecheck,boundaries,determinism,filesize` ·
`bun run t3d build recipes/import_demo/import_demo.ts --out out` QA PASS.

## Docs
Slice 11: `SECURITY.md` (import and adapters are shipped; what the reader bounds), defect rows D33
(malformed GLB escapes uncoded / OOM), D34 (no network timeout).

## Done when
No path from a file or a socket reaches a raw throw, an unbounded allocation or an unbounded wait.
