# Defect catalogue

Zero defects by mistake-proofing: every defect found once becomes a check, so it can never ship
again. A defect is not fixed until its check exists and fails on a reproduction.

**Rule:** add a row here, write the failing test or gate first, then fix the asset or library.
"Perfect" means no catalogued defect class gets through and the critique scores every criterion ≥ 8.

| # | Symptom | Root cause | Caught by | Status |
|---|---|---|---|---|
| D1 | Wheels and gun barrels render hollow in engines | lathe winding / mirrored transforms flipped triangles | `normals-match-winding` gate; `applyAffine` flips on det < 0 | shipped |
| D2 | Container doors stop short of the roof rail | door height measured from the wrong rail | `gaps` gate (`T3D` slit finding with width, length, parts) | shipped |
| D3 | Keypad floats 1.75 cm off its panel | placed on the panel's old face | `floating-parts` gate | shipped |
| D4 | See-through slit between mudguard and hull | parts placed independently | `gaps` gate (see-through) | shipped |
| D5 | Door leaf swings into its own post | clash sector padded by an extra bin | `clashes` gate (real edge angles) | shipped |
| D6 | Dragon wings sit on the back, not attached | wing root placed without a shoulder | `connections` gate (`T3D_CONNECT_GLUED` / `_CREASE` on `wing*`, `_POINT` for edge-only contact) + `joints` gate + `assertGrown` / `assertTouches` | shipped |
| D7 | Teeth float at the lip line | teeth not rooted in the jaw | `connections` gate (`T3D_CONNECT_ISLAND` per shell — a merged tooth row hides loose teeth from `floating-parts`; `_GLUED` / `_POKE` on `tooth*`), `floating-parts`, `assertConnected` | shipped |
| D8 | Hand far too big or small for its wrist | parts sized separately | `joints` (`T3D_JOINT_MISMATCH`) | shipped |
| D9 | A 57 t tank geometry weighs 200 t | solid volume for a hollow hull | `mass` gate (`T3D_MASS_MISMATCH`) | shipped |
| D10 | Committed renders don't match the recipe | outputs not refreshed | recipes gate (stale outputs, critique hashes) | shipped |
| D11 | Empty `out/` after a failed render run | output deleted before rendering | `shots` renders to a temp dir and swaps on success | shipped |
| D12 | Painted part brighter than its livery slot clamps | colour ÷ slot > 1 | paint check (`T3D_RECIPE_INVALID`) | shipped |
| D13 | Normals wrong under non-uniform scale | transform used the matrix, not its inverse transpose | transform test (audit fix) | in progress |
| D14 | LOD2 loses silhouette, camouflage or markings | far LOD dropped signature parts | thumbnail silhouette check (`silhouetteReads`, critique metrics) | shipped |
| D15 | Flat toy colours, no wear | single colour per part, no library materials | value / material checks + critique | in progress |
| D16 | Detail noise everywhere, no calm areas | uniform greebles | rest-area density check (`restAreas`) | shipped |
| D17 | Textures stretched on curves | per-part UVs not at true scale | texel-density check (`assertTexelDensity`) | planned |
| D18 | Assets credited to the wrong source or licence | missing sources in the dossier | dossier + GLB credits | partly |
| D19 | Horns, spines, claws look glued on (seam ring at the base) | appendage placed on the surface instead of growing from a blended boss | `connections` gate: `T3D_CONNECT_GLUED` (root ring visible %), `T3D_CONNECT_CREASE` (no boss/fillet, suggested blend radius), `T3D_CONNECT_SEAM` (unblended sculpt edits); `connectionsOverlay`; `assertGrown` | shipped |
| D20 | Eyes look stuck on: full white ring, no lids, eyes diverge | eyeball placed on the surface, no socket or lids | connections gate eye rules (enclosure, lid coverage, gaze convergence) + `kind: 'socket'` joints; socket joints measure the local opening (`src/core/joint-fit.ts` LOCAL_REACH + `opening()`); busts declare `eye_*_orbit` | shipped (orc pending) |
| D21 | Face reads as blobs pushed together (seams forehead→brow→nose→mouth); teeth hang below the jaw | features added as separate masses with small blend radii, no underlying planes | within-mesh seam detector in the connections gate (`T3D_CONNECT_SEAM`; declared creases must lie along the fold: centre or ≥ 80 % of the trace) + poke check; the bust head was hollow above the neck and the jaw planes sliced the mid-face — fixed in `recipes/_lib/bust`; `checkNeck` enforces neck width ÷ head width per race | shipped |
| D22 | Mass doubles on creatures (dragon LOD0 19.5 t vs ~7 t) | overlapping solids merged into one part are summed; open shells counted as hulls | physics: union occupancy (`src/physics/occupancy.ts`: +Z ray intervals, exact closed-shell integrals + sampled overlap/open correction, `volumeError` bound); tests: overlapping cubes 1.5 m³, cube in cube, touching cubes exact (dragon LOD0 8.30 t, LOD1 8.13 t) | shipped |
| D23 | Long hinged panel (1.4 m hood) "clashes" with everything a few cm under it, forcing huge `clearOf` lists | sway swept volume kept per 5° bin as the max radius from the hinge, so near-hinge skin at steep angles filled the fan out to the tip | `clashes`: sector occupancy grid (slice × 1 cm ring × ≤ 5 mm-arc bin, `src/qa/clash-sector.ts`), travel ends and rings tested with CLASH_EPS in metres; tests: 1.4 m panel with a bay 3 cm / 5 mm below → pass, block in the arc → clash | shipped |
| D24 | Orange/tinted coats look muddy | the `fur` creature strip has a brown albedo that multiplies the vertex colour | `CREATURE_MATERIALS.fur_neutral` (near-white, chroma < 2 %, strand relief kept; `fur` id unchanged) so vertex colour carries the coat; test `src/material/creature.test.ts` fails `fur` and passes `fur_neutral`; `recipes/wolf` uses it; `assertValueRange` on tinted coats still to wire | shipped |

Related: [errors.md](errors.md) (every `T3D_*` code), [16-art-as-text](../idea/16-art-as-text.md)
(measurable art definitions), `docs/idea/06-qa.md` (gate table).
