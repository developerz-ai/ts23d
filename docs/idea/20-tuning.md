# Tuning: machine search over recipe knobs, committed as numbers

A recipe is code, and code has numbers someone guessed: a jaw width, a belly height, where a handle
starts. An agent tunes them by eye, one render at a time. `t3d tune` does that part by search: the
recipe declares which numbers may move and what "better" means as a measurement; a black-box
optimiser tries values, measures, and commits the best ones to `tune.json` beside the recipe.

## Why offline

- **Deterministic or broken.** Builds must give the same bytes for the same source and seed. A model
  or optimiser in the build would make every build depend on its run. Here the search runs once,
  offline, and its result is plain numbers in a committed file; every build, the gallery and the
  gate read those numbers and never run the optimiser.
- **Reproducible search.** The optimiser itself is deterministic: normal samples come from the core
  mulberry32 RNG, ties sort by index, values snap to each param's step. Same recipe + `--seed` +
  `--evals` → byte-identical `tune.json` (tested).
- **Reviewable.** `tune.json` diffs like code; `tune-report.md` says what moved and by how much;
  `tune-strip.png` shows it.

## The DSL

```ts
import saved from './tune.json'; // `t3d tune` writes it; starts as {}

export const amphora = defineAsset({
  …,
  tune: {
    params: {
      bellyR: { min: 0.08, max: 0.24, default: 0.2, step: 0.0005 },
      neckZ: { min: 0.65, max: 0.88, default: 0.7 },
    },
    objectives: [{ kind: 'silhouette', view: '+X', mask: 'target_front.svg' }],
    saved,
  },
  build(ctx) {
    const belly = ctx.tuned('bellyR'); // trial value → tune.json → default
  },
});
```

The recipe imports `tune.json` itself, so Bun, the CLI, the gallery's in-browser compiler and the
gate all see the same values with no file access from core. `compile(asset, { tuned })` overrides
them (that is how the optimiser tries values, and how a test can pin them). Bad declarations throw
`T3D_TUNE_INVALID`: min ≥ max, a default outside its range, an undeclared name, a stale or
out-of-range `tune.json` entry.

## Objectives

Each returns a number to minimise; the optimiser minimises the weighted sum (`weight`, default 1).

| kind | value | notes |
|---|---|---|
| `silhouette` | 1 − IoU of the outline from `view` vs a reference mask | Views as the image assertions: `+X` front (paper right = +Y), `-Y` side (paper right = +X, the front). Mask: inline `<svg>`, or a `.svg`/`.png` beside the recipe. Both masks are cropped to their bounding box and fitted into one 128² square, so the drawing's scale and framing do not matter (proportions do). SVG fill: shapes union; a shape entirely inside an odd number of others is a hole. |
| `measures` | mean relative error of `real.measures` at LOD0 | a missing part counts 1 |
| `art` | (1 − worst LOD2 silhouette IoU) + rest-share shortfall + (1 − focal share if `art.focal`) | the [art-as-text](16-art-as-text.md) metrics; renders a beauty per trial, so slower |
| `budget` | triangles at `lod` ÷ `target` (default the budget) | small weight: a tie-breaker towards leaner |
| `custom` | `score(lod0)` | any measurable intent: symmetry, clearance, a ratio |

## The optimiser

CMA-ES (Hansen's (μ/μ_w, λ) with rank-one + rank-μ covariance updates and cumulative step-size
adaptation) on the unit box `[0, 1]^n` of the declared ranges, starting at the defaults with
σ₀ = 0.3. Bounds: the clamped point is evaluated and a quadratic penalty pulls the search back
inside. Stops on the evaluation budget, a collapsed search radius, a stall or a target. Trials are
cached by their snapped values. `--method coordinate` runs a compass search (no randomness) as the
simple fallback. Tests: shifted sphere and Rosenbrock minima found within tolerance, box minima
land on the edge, same seed → same path.

```
bun run t3d tune recipes/tune_demo/tune_demo.ts --evals 800 --seed 1
```

prints a convergence table and writes `tune.json`, `tune-report.md` and `tune-strip.png` (top row
defaults, bottom row tuned; per silhouette objective grey = both, orange = model only, blue =
reference only; last column the beauty render). Then refresh the committed outputs:
`bun run shots <name>`.

## Demo: `recipes/tune_demo`

An amphora with ten params (foot, belly radius and height, shoulder fullness, neck radius and
height, lip flare, handle reach, top and rise). Defaults make a squat jar; the target is a hand-drawn
front outline. CMA-ES, seed 1, 800 evaluations (≈ 10 s): front IoU **0.643 → 0.940**. The rest is
structural — a drawn handle band is not a swept tube — which is the point: tuning finds the best
numbers the recipe's code can express; when the fit stalls, the code needs a new shape, not more
search.

## Limits

- One process, one trial at a time (≈ 10 ms per trial for the demo). Parallel trials via Bun
  workers are planned; results would be collected in submission order to stay deterministic.
- CMA-ES needs roughly 10–100 × n evaluations; keep n ≤ ~12 knobs per run, or tune in stages.
- A silhouette is scale-free by design; pair it with `measures` (or fixed dimensions in the recipe)
  when absolute size matters.

## Next steps

- **AI critics as objectives.** A vision model scores the renders ("reads as a wolf", appeal,
  concept match) offline; its score is one more weighted objective, so tuning no longer needs an
  agent reviewing every iteration. The committed result is still numbers.
- **Inverse procedural modelling.** A local generator (`/neural`: TRELLIS, Hunyuan3D) turns an idea
  or concept art into a rough mesh; the optimiser fits recipe params to its silhouettes and depth
  maps → a clean, code-built, LOD-gated asset with the generated look.
- **Learning from critique data.** `critique.json` + measured metrics across the gallery as a
  dataset: a small model predicts scores and proposes the next knob to move or the next fix.
