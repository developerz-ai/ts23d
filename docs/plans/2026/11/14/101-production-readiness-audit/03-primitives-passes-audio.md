# 03 — Primitives, passes, audio (tier 2)

Rule: no primitive or pass returns NaN, inside-out or silently empty geometry; it throws.

## Files
| Path | State | Why |
|---|---|---|
| `src/primitives/lathe.ts`, `box.ts`, `prism.ts`, `heightfield.ts` + their tests | changed | size / segment validation |
| `src/passes/optimize.ts`, `optimize.test.ts` | changed | `weldEpsilon` range |
| `src/passes/bake-ao.ts`, `grime.ts` + their tests | changed | sample / strength ranges |
| `src/audio/engine.ts`, `impact.ts`, `mechanism.ts` + their tests | changed | default names unique per parameter set |

## Depends on
01.

## Change
Reuse `count()` / `positive()` / finite checks from `src/primitives/check.ts` (already used by
sweep, loft, tiled, lattice, sdf, text). All throw `T3D_RECIPE_INVALID` unless noted.

| Site | Today | After |
|---|---|---|
| `lathe.ts:39-75` `segments` | `0` → NaN, `-3` → empty, `2.5` → malformed | `count('lathe segments', n, 3, 1024)`; profile points finite; radius ≥ 0 with at least one > 0 |
| `cylinder({ radius: 0 })` | 48 degenerate triangles | throws |
| `box.ts:39` size | `[-1,2,3]` → signed volume −6; NaN → NaN positions | each size finite and > 0 |
| `prism` `depth` | `-1` → volume −1 | finite and > 0 |
| `heightfield.ts:25` `rect` | `[4,4,0,0]` → flipped triangles | `x1 > x0`, `y1 > y0` |
| `optimize.ts:57` `weldEpsilon` | `0` or `1e9` welds two boxes 5 m apart into 12 triangles | finite, `0 < ε ≤ 0.01` m |
| `bake-ao.ts:88,145` | `samples: 0` → NaN; `strength: 5` → colour −0.125 | `samples` integer ≥ 1, `strength ∈ [0,1]` → `T3D_BAKE_INVALID` |
| `grime.ts:24,32` | zone `strength: 2` → −0.134; `groundStrength: -5` → 3.0 | strengths in `[0,1]`; result clamped to `[0,1]` |
| audio default names (`engine.ts:102`, `impact.ts:120`, `mechanism.ts:135`) | seed / force / roughness omitted → two variants collide → `T3D_AUDIO_CONFLICT` at export | name token includes seed and every non-default parameter |

Also tighten `audio/mechanism.test.ts`: the loop `seamJump < 1.5` bound passes at measured 1.07–1.10;
set it to the measured value + 10 %.

## Tests
One failing-input test per table row first (the "Today" column is the repro), then the valid case.
Audio: `engine({ cylinders: 8, rpm: 900, seed: 1 }).name !== engine({ …, seed: 2 }).name`; default
parameters keep today's name so committed recipe outputs do not move.

## Checks
`bun test src/primitives src/passes src/audio` ·
`bun run verify --only lint,typecheck,boundaries,determinism,filesize` ·
`bun run verify --only recipes` (a recipe passing a negative size on purpose would surface here;
report to the coordinator).

## Docs
Slice 11: defect row D32 (unvalidated primitive / pass options build inside-out or NaN geometry).
`docs/architecture/adding-a-primitive.md`: "validate with `check.ts` before emitting".

## Done when
Every "Today" input throws a coded error; no committed recipe output changes.
