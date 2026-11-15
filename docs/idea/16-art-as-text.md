# Art as text

ts23d turns art knowledge into text an agent can read, follow and check. A human learns art by eye
over years; an agent learns it from precise words, numbers and gates. Every soft art word gets a
measurable definition, a DSL vocabulary, and a check. Methods come from published practice
([reading list](../research/reading-list.md)); designs are always original.

## The stack

| Layer | What | Where |
|---|---|---|
| Principles | art rules as measurable statements | this page, `docs/research/` |
| Vocabulary | the same concepts as DSL words | `defineAsset`, kinds, `tex`, `tone`, `weather` |
| Playbooks | per object class: research, part tree, signature details, mistakes | `docs/playbooks/` |
| Checks | each principle measured on mesh and renders | `src/qa`, `src/testing` |
| Critique | agent scores itself on a fixed rubric, loops until every score ≥ 8 | `t3d critique`, `critique.json` |

## Definitions (soft word → measurable)

| Word | Definition | Check (status) |
|---|---|---|
| Silhouette reads | LOD2 rendered as a 32×32 solid shape (holes filled, antialiased coverage) keeps soft IoU ≥ 0.85 with LOD0 from front, side, 3/4 | shipped: `silhouetteReads`, `T3D_ART_SILHOUETTE` |
| Focal point | highest local value contrast (std-dev in an H/60 window of the greyscale beauty render) falls on the declared focal part (`art: { focal: 'head' }`): the densest top-5 % cluster sits on it, or ≥ 30 % of the top-5 % pixels do | shipped: `focalPoint`, `T3D_ART_FOCAL` |
| Rest area | cells (H/56 px) with creases (> 25° normal turn) on < 15 % of pixels, bend < 0.05 rad/px and < 1 triangle/px cover ≥ `art.restShare` (25 %) of visible surface, and per-cell detail is not uniform (spread ≥ 0.3) | shipped: `restAreas`, `T3D_ART_REST` |
| Grounded | mean render luminance over 5 world-height bands rises from base to top (least-squares rise ≥ 0); `character`/`creature` kinds or `art.grounded: true` | shipped: `grounded`, `T3D_ART_GROUNDED` |
| Shape language | 128-px outline, Douglas–Peucker: acute share (interior < 70° among convex corners), straight share (outline along its 4 dominant 5° directions), taper. `aggressive` acute ≥ 0.45 (or ≥ 0.3 when not blocky), `stable` straight ≥ 0.5, else `friendly`; must equal `art.shape` | shipped: `shapeLanguage`, `T3D_ART_SHAPE` |
| Proportion | declared ratios (head : body 1:8 heroic, 1:5 brute; jaw ×1.35 human for orcs) within tolerance | partly: `measures`, head ratios |
| Anatomy holds | joints fit (`joints`), limbs carry mass (`T3D_ALLOMETRY`), parts attached (`gaps`, `floating-parts`) | shipped / planned |
| Built right | real units, closed, outward, no clashes, budgets | shipped |
| Story / wear | wear where physics puts it: edges chipped, streaks under bolts, dust on tops, polish where touched | planned (`weather`) |
| Material truth | each surface uses a library material with plausible albedo / roughness / metalness ranges | shipped (`assertValueRange` planned) |

## Running the checks

```ts
import { assertArt } from '@developerz.ai/ts23d/testing';
defineAsset({ …, art: { focal: 'head', shape: 'aggressive', restShare: 0.3 } });
it('reads as art', () => assertArt(orcHead)); // T3D_ART_* with the measured value and a fix
```

`silhouetteReads`, `focalPoint`, `restAreas`, `grounded`, `shapeLanguage` check one each and return
the numbers. `t3d critique` computes the same metrics (beauty at a fixed 800×450, so numbers compare),
writes `silhouette.png`, `value.png` and `detail.png`, a "Measured" table in `rubric.md`, and
`metrics` in `critique.template.json`: the agent's scores start from numbers. Undeclared intent
(`focal`, `shape`) is reported, never failed.

### Calibration (committed gallery, LOD0 vs LOD2, default sheet)

| Asset | Silhouette IoU front/side/3/4 | Contrast peak (top part) | Rest share / spread | Grounded rise | Shape (acute, straight) |
|---|---|---|---|---|---|
| tiger_1 | 0.962 / 0.901 / 0.975 | hull (turret_body 27 %) | 0.31 / 0.73 | n/a | stable (0.10, 0.64) |
| boxcar | 0.907 / 0.972 / 0.983 | body (roof 36 %) | 0.42 / 0.79 | n/a | stable (0.21, 0.77) |
| loco_440 | 0.959 / 0.926 / 0.951 | frame (frame 21 %) | 0.35 / 0.69 | n/a | stable (0.36, 0.67) |
| orc_head | 0.958 / 0.933 / 0.961 | pauldrons (head 38 %) | 0.46 / 0.66 | 0.31 | friendly (0.15, 0.44) |
| goblin_head | **0.789 / 0.825 / 0.798** | head (head 89 %) | 0.39 / 0.66 | 0.45 | aggressive (0.37, 0.41) |
| svg_showcase | 0.978 / 0.956 / 0.982 | head (gear 57 %) | 0.75 / 0.66 | n/a | stable (0.13, 0.59) |
| dropship | 0.985 / 0.984 / 0.987 | canopy (canopy 41 %) | 0.63 / 0.71 | n/a | aggressive (0.48, 0.57) |

Bad fixtures in `src/testing/readability.test.ts` fail as they should: a mast dropped at LOD2 (front
IoU < 0.85), a blob of uniform SDF bumps (rest 0.11), a light-base/dark-top figure (rise < 0), a
striped body under a plain head declared `focal: 'head'`, a cube declared `aggressive`. goblin_head
is a true positive: its LOD2 sculpt is 7–10 % smaller on every axis and drops the ear tips.

## Calibrated score

A self-score is a claim; the calibrated score is a measurement. `calibratedScore(vector)`
(`src/qa/critique-calibrate.ts`) maps a **metric vector** (`metricVector`, `src/qa/critique-vector.ts`)
to 0–10 per criterion. The vector is measured on LOD0 and one 640×360 beauty render
(`VECTOR_RENDER`, 1024² trim sheet), the same way in the golden set, `t3d critique` and the gate:

| Metric | Measures | Moves when |
|---|---|---|
| `tris` | log10 LOD0 triangles | decimated |
| `smoothShading` | share of welded vertices whose normals agree (cos ≥ 0.97) | flat-shaded |
| `curvSmooth`, `curvEntropy` | length-weighted dihedral-angle histogram: share under 10°, normalised entropy | decimated, blocky |
| `colourDetail` | mean colour step across mesh edges | blurred colour |
| `texelDensity` | log10 √(welded vertices / m²): colour samples per metre | low-resolution colour |
| `chroma`, `valueKey`, `valueRange` | mean chroma, mean luminance, p95 − p5 luminance in the render | desaturated, flat-lit |
| `hiFreq` | mean \|Laplacian\| of luminance inside the silhouette | blurred, featureless |
| `restShare` | share of interior pixels with 5×5 luminance std < 0.02 | noisy or bare |
| `silhouetteRoughness` | outline length over its 5×5-smoothed outline, − 1 | jagged, faceted |

Reference-photo gaps join the fit when the recipe commits `ref.json` (slice 02): `refGaps`
(`src/qa/critique-ref.ts`) gives the mean outline IoU over the reference views and the value /
spectrum / edge gaps of the beauty image against the photos (`compareFingerprints`). Without
`ref.json` they are imputed (median of golden rows that have them, else "matches the photo"). No
golden row has references yet, so every gap column is constant and its map flat: **today the gaps
are reported in `calibrated.json` but move no score.** They start counting once golden rows carry
photos.

**Fit.** An additive model of per-metric isotonic maps (pool-adjacent-violators), fitted by
backfitting: each map is refitted on what the others leave unexplained, shrunk by 0.3 per step (the
ridge of an additive fit). Metrics whose good direction is known (`tris`, `smoothShading`,
`curvSmooth`, `colourDetail`, `texelDensity`, `chroma`, `valueRange`) only ever raise the score as
they rise; the rest take the direction that fits. One model per panel criterion (silhouette,
proportions, materials, detail, wear) plus overall; `lod` and `technical` take the overall model.
Deterministic; refitted in-process from `src/qa/critique-golden.json`, which commits vectors, render
hashes and scores, never meshes. A plain marginal-isotonic + non-negative ridge combine was tried
first: same Spearman, but it ranked 37 of 160 degraded copies at or above their originals.

**Golden set** (2026-11-15). `bun scripts/golden.ts fetch|measure|panel|check|baseline`. 40 CC0
assets from Poly Haven (busts, animal heads, statues, rock, fruit, furniture, tools, appliances; URL,
author, licence and packed-GLB sha256 per asset in `sources`), each with four degraded copies
(QEM-decimated to 8 %; faceted: QEM to 25 % + flat shading; desaturated; vertex colour blurred ×40),
plus 12 in-house recipes as anchors for the procedural vertex-colour look: 212 rows. Meshes live in
the gitignored `.ts23d/golden/`. Panel: three independent blind agent reviews (tiles shuffled per
asset, sheets renamed, rubric of `critique-rubric.ts`), median per tile and criterion (`reviewer:
"agent-panel"`); pairwise reviewer Spearman 0.90–0.95. A row's panel score is bound to the sha256 of
the render it judged: re-measuring a changed render drops it. Kenney and Quaternius refuse scripted
downloads (HTTP 403 / Google Drive), so they are not in the set yet.

**How good it is — honestly.** Leave-one-asset-out Spearman **0.584** over all 212 rows (target 0.7:
not reached; the test holds the measured floor `LOO_SPEARMAN_FLOOR = 0.55`, which only rises).
Within one asset the ranking of original vs its degraded copies averages 0.735, and no degraded copy
scores above its original. Between different assets the metrics see little: every in-house anchor
predicts 5.9–6.3 while the panel spread them 5.0–7.3, and `human_head` (panel 5.3) predicts 6.0.
Anatomy errors (a long neck, eyes forward of the orbits) are invisible to image statistics: they need
the reference-photo gaps (slice 02) in the vector, and a golden set with photos.

**Who decides.** Metrics cannot see anatomy (a long neck, eyes forward of the orbits), so the
flagship floor is judged by the **blind agent panel**: `bun run golden brief <recipe>` renders the
critique pack and writes a self-contained `brief.md` per asset (rules, image paths, rubric, QA
summary, output shape; no network, no calibrated score shown) under `.ts23d/panel/`; three
independent agents each write `review-<k>.json`; `bun run golden attest <recipe>` writes
`critique.json` with `reviewer: "agent-panel"`, the median per criterion, every reason, the three
individual scores (`panel.reviews`) and the render hashes (stale as soon as hero.png or sheet.png
change). The calibrated score is the sanity check beside it, with a wider band for the panel.

**Gate** (`scripts/lib/critique.ts`, recipes step):

| Code | When | Today |
|---|---|---|
| `T3D_CRITIQUE_INFLATED` | claimed overall − calibrated > 1.5 (self-score) or > 2.5 (agent panel: it legitimately sees what metrics cannot) | enforced on flagships; elsewhere with the critique phase-in |
| `T3D_CRITIQUE_REGRESSED` | calibrated < `recipes/critique-baseline.json` − 0.5 and the README has no `Critique why: …` line | enforced |
| `T3D_CRITIQUE_BELOW_FLOOR` | a flagship (wolf, amur_tiger, dragon, human/elf/goblin/orc heads) without a fresh agent-panel critique, or with a panel median under 8.5 | reported; enforced from slice 17 (`FLOOR_ENFORCED`) |

The baseline is a ratchet: `bun run golden baseline [name…]` (after `bun run shots`) writes max(recorded, today), so
scores only go up; the floor only rises. `t3d critique` prints the calibrated score beside the claimed
one and writes `calibrated.json` (vector + per-criterion scores) into the pack.

## How an agent uses this
1. Pick the playbook for the object class; research specs and photos into the dossier.
2. State intent in code: proportions, `focal`, shape language, materials, wear.
3. Build big masses first; check silhouette before any detail.
4. Add planes, features, detail with rest areas; paint value and tone.
5. Run QA and critique; fix what the numbers say; repeat until every score ≥ 8.

Adding a principle means adding all three: the definition here, the DSL word, and the check.
