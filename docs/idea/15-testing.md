# 15 · Test helpers: agents catch errors with code

A coding agent can't eyeball every triangle. It can run `bun test`. `@developerz.ai/ts23d/testing`
turns "does this look right?" into assertions that fail with a code, the measured value and a
`fix:` line. The agent reads the failure and changes the recipe. All helpers are deterministic,
need no GPU and no dependencies, and work with any runner (`bun test`, vitest, node:test). Each
throws a `Ts23dError` or returns the measurement.

Failures throw `T3D_QA_FAILED` and list every finding (`LOD1 ground [track_l]: 'track_l' reaches
1.4 cm below the ground`) with the first finding's fix. Malformed inputs (a part filter that matches
nothing, bytes that aren't a PNG) throw `T3D_ASSERT_INPUT`.

## A recipe test

```ts
// recipes/t34/t34.test.ts
import { describe, it } from 'bun:test';
import {
  assertCentreOfMassInside, assertClosed, assertLodSilhouette, assertMinThickness, assertOutward,
  assertPartMotionClear, assertQaPass, assertSymmetric, assertTexelDensity, assertUprightOnGround,
} from '@developerz.ai/ts23d/testing';
import { t34 } from './t34.ts';

describe('t34', () => {
  it('passes the build QA', () => assertQaPass(t34));
  it('hull is watertight and wound outward', () => {
    assertClosed(t34, { parts: 'hull' });
    assertOutward(t34);
  });
  it('armour is at least 1 mm', () =>
    assertMinThickness(t34, 0.001, { parts: ['hull', 'turret_body'] }));
  it('running gear is mirror-symmetric', () =>
    assertSymmetric(t34, 'y', 0.01, { parts: ['wheel_*', 'idler_*', 'sprocket_*'] }));
  it('stands and does not tip', () => {
    assertUprightOnGround(t34, { lods: [0] });
    assertCentreOfMassInside(t34);
  });
  it('turret traverses clear', () => assertPartMotionClear(t34, 'turret'));
  it('LOD2 keeps the outline', () => assertLodSilhouette(t34, 0.85));
  it('texel density is even', () => assertTexelDensity(t34, [200, 2000]));
});
```

Every test in this block passes on the shipped `t34`. Write the failing case first: change one
number and confirm the test goes red before you trust it.

## 3D: is the mesh sound?

Each mesh helper takes a `Mesh`, a compiled asset or an `Asset` (LOD0 unless `lod`). It checks one
part at a time; narrow the check with `parts: 'hull' | ['wheel_*']`.

| Helper | Fails when | Notes |
|---|---|---|
| `assertClosed(x)` | An edge has only one triangle (a hole) | Welded by position (0.1 mm). Flat faces own their vertices |
| `assertManifold(x)` | An edge is shared by 3+ triangles, or two neighbours wind the same way | Merged solids sharing a face edge-for-edge trip it too |
| `assertOutward(x)` | A face's winding normal points into its solid (ray parity, 3 tilted rays, majority vote) | Runs per connected shell. Open and self-crossing shells are skipped |
| `assertNoSelfIntersection(x)` | Two triangles of one part cut through each other | Grid-accelerated; pairs that share a vertex are skipped. Overlapping boxes `merge`d into one part fail, which is the point |
| `assertMinThickness(x, m)` | A ray cast inward from a face centre meets the far wall closer than `m` | Same shell rules as `assertOutward` |
| `assertSymmetric(x, axis, tol)` | A surface sample mirrored across `axis = about` lands more than `tol` from the surface | Default axis `y`, about 0 |

## Asset-level checks

| Helper | Fails when |
|---|---|
| `assertUprightOnGround(asset)` | The lowest point floats more than 5 mm above z = 0, or any part reaches below it |
| `assertCentreOfMassInside(asset)` | The centre of mass (volume × strip density, `/physics` `massProperties`) is outside the convex hull of ground contacts, or closer to its edge than `margin` |
| `assertFollows(asset, { part, follows, point })` | A world point on two parts at rest (a rod eye on its crank pin, a small end on its crosshead) drifts more than 2 mm between them anywhere in the clip (exact poses; the export test holds the baked keys to them); returns the worst drift |
| `assertPartMotionClear(asset, part)` | That moving part's baked spin, sway or slide sweeps into another part. This is the QA `clashes` sweep with only that part moving. `assertMotionClear` checks every moving part |
| `assertLodSilhouette(asset, minIoU)` | From any of the six axis views, the LOD2 silhouette (in LOD0's frame, 2× max-pooled) overlaps LOD0's below `minIoU`, i.e. the LOD pops |
| `assertTexelDensity(asset, [lo, hi])` | A part's area-weighted texels per metre on the 4096² sheet falls outside the range. Parts with only vertex colour are skipped |
| `assertBudget(asset)` | Triangles per LOD are over the asset's budget (already shipped) |

## 2D: contours and the trim sheet

| Helper | Fails when |
|---|---|
| `assertPolygonValid(contours, { outer })` | A contour has fewer than 3 points or no area, edges cross (within or across contours), or the winding ignores nesting: outer contours CCW and holes CW by default (`outer: 'cw'` for y-down sources) |
| `assertTileable(image, { rows, axis })` | The mean step across the wrap seam is more than `ratio` (3) times the mean step inside |
| `assertNoBleed(sheet)` | A strip row's gutter (`pad` rows top and bottom) does not repeat that strip's own edge row, so mips sample the neighbouring strip |
| `assertValueRange(sheet, { strips })` | A material strip's mean albedo is outside 30–240 sRGB, its roughness is under 0.05, over 20 % of its texels are half-metal, or more than 1 % of its normals point into the surface. Classic strips multiply the vertex colour and are skipped |

## Renders

| Helper | Fails when |
|---|---|
| `assertNotEmpty(png, region?)` | Under 1 % of the region differs from the background |
| `expectImageClose(png, goldenPath, { tolerance, maxOff })` | More than `maxOff` of the pixels differ from the golden by more than `tolerance`. Writes `<golden>.diff.png` (red = changed). A missing golden is written and passes; `T3D_UPDATE_GOLDEN=1` rewrites goldens |
| `assertSilhouetteMatches(asset, view, maskPng, minIoU)` | The outline from `view` (`'+X'`, `'-Y'` …) overlaps the reference mask below `minIoU`. Both masks are cropped to their bounding box and fitted into the same square, so a traced photo needs no matching camera. The mask is dark or opaque where the asset is |
| `assertNoHoles(asset, { views })` | Background shows through inside the silhouette (enclosed see-through pixels) from an axis view |

## Limits

- Ray parity and inward thickness mean nothing on open sheets or self-crossing shells. Those
  shells are skipped, so run `assertClosed` and `assertNoSelfIntersection` alongside them.
- `assertNoSelfIntersection` does not count coplanar overlaps (two faces on the same plane).
- `assertSilhouetteMatches` normalises framing but not perspective: trace the photo from a long lens.
- `assertTileable` is a statistic. A strong pattern can pass with a seam that a viewer still notices.
  Look at the strip too.
