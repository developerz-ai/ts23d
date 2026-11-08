# Tune demo — a two-handled storage amphora, fitted to a drawing

## Identity
A teaching asset for `t3d tune` (docs/idea/20-tuning.md), not a museum piece: an original
two-handled storage jar whose ten proportions (foot, belly radius and height, shoulder fullness, neck
radius and height, lip flare, handle reach, top and rise) are `tune.params`. The recipe's hand-set defaults make a squat, wide-bellied jar; the
reference is a hand-drawn front outline of a slim amphora (`target_front.svg`). `t3d tune` moves the
params until the model's front silhouette matches the drawing, and commits the numbers to
`tune.json`, which the recipe imports — every build (CLI, gallery, gate) reads the same values.
Signature: high shoulders, a narrow stem foot, a tall neck with a flared lip, two loop handles from
neck to shoulder.

## Specs
| Dimension | Value (m) | Source |
|---|---|---|
| overall height | 0.60 | design choice: typical storage amphorae stand 0.5–0.7 m |
| belly diameter | ≈ 0.28 | target drawing (35 of 150 units half-width at 0.6 m tall) |
| neck diameter | ≈ 0.10 | target drawing |

Only the height is fixed in the recipe; every other proportion comes from the tuned params, and the
silhouette objective is scale-free (both outlines are cropped and fitted before IoU).

Sources:
- https://en.wikipedia.org/wiki/Amphora — form vocabulary (neck, shoulder, belly, foot, handles) and typical sizes

## Photos (by view)
| View | URL | Notes |
|---|---|---|
| front (handles in profile) | https://commons.wikimedia.org/wiki/Category:Amphorae | general form only; the target is an original drawing |

## Parts the engine needs
`body` (turned vessel, closed base and neck floor), `handle_l`, `handle_r` (loops at ±Y).

## Tuning
- Reference: `target_front.svg` (front view, camera on +X: paper right = +Y, paper up = +Z).
- Objective: `silhouette +X` (1 − IoU), weight 1.
- Result: IoU 0.643 → 0.940 (CMA-ES, seed 1, 791 evaluations, ≈ 10 s); `tune-report.md`.
- Reproduce: `bun run t3d tune recipes/tune_demo/tune_demo.ts --evals 800 --seed 1` → `tune.json`,
  `tune-report.md`, `tune-strip.png` (before/after) beside this file, byte-identical; then
  `bun run shots tune_demo`.

## Open questions
None — the drawing is the spec.
