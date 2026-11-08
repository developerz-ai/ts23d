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

## How an agent uses this
1. Pick the playbook for the object class; research specs and photos into the dossier.
2. State intent in code: proportions, `focal`, shape language, materials, wear.
3. Build big masses first; check silhouette before any detail.
4. Add planes, features, detail with rest areas; paint value and tone.
5. Run QA and critique; fix what the numbers say; repeat until every score ≥ 8.

Adding a principle means adding all three: the definition here, the DSL word, and the check.
