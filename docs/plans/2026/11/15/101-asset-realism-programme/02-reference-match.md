# 02 — Reference match (render + qa, tier 3)

Rule: "looks like the real thing" is a number per view, computed from committed derived data.

## Files
| Path | State | Why |
|---|---|---|
| `src/render/photo-match.ts` + `.test.ts` | changed | implement the stub at `:23–28` |
| `src/render/camera-solve.ts` + `.test.ts` | new | DLT from ≥ 4 correspondences, refined on IoU |
| `src/qa/ref-fingerprint.ts` + `.test.ts` | new | silhouette mask 128², Lab histogram 16 bins, radial FFT 8 bands, edge density 8×8 |
| `src/qa/ref-gate.ts` + `.test.ts` | new | `T3D_REF_*` checks; replaces `silhouetteIoU` stub body in `gates.ts:108` via coordinator |
| `scripts/ref.ts` + `.test.ts` | new | `bun run ref <recipe>`: reads dossier photo URLs, fetches once, writes `recipes/<name>/ref.json` (derived numbers only + URL, sha256, licence) |
| `src/tune/objectives.ts` | changed | objective `kind: 'photo'` using the solved camera |

## Depends on
01 (codes).

## Change
- `photoMatch(asset, { photo, camera?, marks? })` → `{ png, iou, camera, errorMap }`; with `marks` (≥ 4 2D↔3D pairs) solve the camera, else use `camera`.
- `ref.json`: `{ views: { side|front|top|threeQuarter: { mask: base64 PNG 128², lab: number[48], spectrum: number[8], edges: number[64], camera } }, source: { url, sha256, licence } }`. Photos themselves are never committed (`docs/idea/06-qa.md`).
- Recipe opt-in: `real.ref = { minIou: 0.88, maxValueEmd: 0.12, maxSpectrumGap: 0.15 }`.
- Segmentation in `scripts/ref.ts`: alpha if present, else background flood from corners with Lab ΔE threshold; optional `--adapter` (13) for a GPU segmenter later.

## Tests
Synthetic render with known camera → solve within 1°; shifted mask → IoU drops and `T3D_REF_SILHOUETTE` fires; flat-shaded vs detailed render → spectrum gap fires.

## Checks
`bun test src/render/photo-match.test.ts src/render/camera-solve.test.ts src/qa/ref-*.test.ts scripts/ref.test.ts` · `--only lint,typecheck,boundaries,determinism,filesize`

## Docs
`docs/idea/06-qa.md` (reference metrics), errors.md rows already in 01; roadmap :96 :134 :303 ticks via coordinator.

## Done when
`bun run ref wolf` writes `ref.json`; `t3d review recipes/wolf/wolf.ts` shows photo · model · overlay + per-view numbers.
