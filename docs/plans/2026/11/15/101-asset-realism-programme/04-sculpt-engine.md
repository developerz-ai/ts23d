# 04 — Sculpt engine: C2 blends, strokes, detail regions, fairing (primitives/passes, tier 2)

Rule: sculpted forms carry planes, creases and tight joins; triangles go where the detail is.

## Files
| Path | State | Why |
|---|---|---|
| `src/primitives/sdf-ops.ts` | changed | `smoothWeight` `:59–61` + `smoothUnion/Subtract` `:124–140` gain `kernel: 'quad'|'cubic'` (cubic = C2) |
| `src/primitives/sdf-ops.test.ts` | changed/new | Lipschitz + continuity |
| `src/primitives/sculpt-edit.ts` | changed | `kernel?` per edit/sculpt; new shapes `roundCone`, `superellipsoid` (`:8`) |
| `src/primitives/sculpt-stroke.ts` + `.test.ts` | new | `crease`, `clay`, `inflate`, `flatten`, `pinch` along a polyline with radius/depth taper, declared Lipschitz |
| `src/primitives/sdf-grid.ts` | changed | `detail: { bounds, factor: 2|4 }[]` regions; fix `:3` comment (BLOCK = 4) |
| `src/primitives/surface-nets.ts` | changed | per-level nets + transition ring stitch |
| `src/primitives/sculpt.ts` | changed | pass `kernel`, `detail` through |
| `src/passes/fair.ts` + `.test.ts` | new | feature-preserving bi-Laplacian fairing (fixed iterations, crease-weighted) |

## Depends on
01.

## Change
- Default kernel stays `'quad'` so no recipe output moves in this slice; flagships opt in in 05/06/17.
- Stroke: `{ stroke: 'crease', path: Vec3[], radius: [r0, r1], depth, kernel? }`; culling uses the declared Lipschitz bound; a test proves an under-declared bound is caught.
- Detail regions: total triangle budget unchanged by caller choosing coarser base cell; check `T3D_QA_CHECK` "detail-density" (head:flank triangle density ≥ declared) as a recipe check helper exported from `src/kinds`.
- Fairing: `fair(mesh, { iterations, keep: 'creases' })`, deterministic order.

## Tests
Failure first: cubic kernel second derivative continuous at blend boundary (quad fails); stroke with wrong Lipschitz caught; stitched mesh watertight (`closed.ts`); fair keeps volume within 1%.

## Checks
`bun test src/primitives src/passes/fair.test.ts` · `--only lint,typecheck,boundaries,determinism,filesize,recipes`

## Docs
`docs/idea/10-sculpting.md` next-steps 1, 3, 5, 8, 9 marked shipped.

## Done when
No committed output changes; new options covered by tests.
