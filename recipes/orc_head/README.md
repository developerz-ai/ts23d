# Orc warrior bust — original stylised design (v3)

## Identity
A brutish orc warlord in the chunky fantasy-MMO idiom (inspiration only: no character, logo or
likeness copied), read from the 3/4 view by: a **head carried low and forward between trapezius that
rise to the ears**, a **small sloped cranium over a massive face**, a **brow shelf** rolling out of
the forehead plane, **small ember eyes deep in their sockets under heavy scowling lids**, a **broad
flat nose**, a **boat-sail jaw wider than the temples with an underbite**, **lower tusks rooted in
the jaw**, **pointed ears with real cartilage structure**, a **warrior's knot** of sculpted locks;
**forged plate pauldrons** (a domed cap, three flaring lames, rolled beads, rivets, bone spikes in
flared collars), a **leather baldric** with a stitched edge and iron buckle, a **fur mantle** over
the back and a **bead necklace** at the throat — and a battle story (scars, a broken tusk, a torn
ear, worn war paint, dented plates).

## How it is sculpted (stages, like a pro bust)
| Stage | What | Where |
|---|---|---|
| 1 block-out | separate masses: egg cranium + occiput, mid-face block, boat-sail jaw, muzzle, chin; neck leaning forward into the trapezius; rib cage, pecs, deltoids | `skull.ts` `headBlock`, `torso.ts` |
| 2 planes | side planes narrowing to the crown, jaw-side planes, under-jaw plane, sloped forehead, cheek corners, flat muzzle front, flatter back of skull; the brow folded INTO the forehead plane; eye sockets; temple hollows | `skull.ts`, `face.ts` |
| 3 features | lids wrapping separate eyeballs (shared `eye.ts`), broad nose + nostrils, lips round a teeth cylinder, lower teeth, tusks, chin cleft, ears (helix, concha, tragus, lobe) | `face.ts`, `jaw.ts`, `ears.ts` |
| 4 secondary / tertiary | forehead furrows, scowl lines, crow's feet, nasolabial and marionette folds, veins, scars, war paint, flush | `skull.ts`, `face.ts`, `torso.ts`, `defects.ts`, `paint.ts` |
| tone | per-vertex curvature + cavity "bake": warm tops, cool undersides, crevices darker and more saturated, a low mottle, light skin bumps (LOD0); vertex AO across all parts | `../_lib/bust/skin.ts` |

Every stroke from stage 3 on is laid ON the stage-2 surface (projected, `creaseOn`/`clayOn` in
`../_lib/bust/kit.ts`), so creases follow the skin instead of floating or cutting holes.

## Proportions (anchor: the measured human, docs/research/head-analysis.md)
| Feature | Orc | Human anchor | Exaggeration |
|---|---|---|---|
| head (menton → crown) | 0.30 m | 0.23 m | ×1.3 |
| eye line | 0.557 H | 0.540 H | eyes a touch high, the jaw is the mass |
| interpupil | 0.31 H (0.093 m, the `measures` gate) | 0.265 H | ×1.17 |
| cranium width | ≈ 0.60 H | 0.683 H | ×0.88 (small brain case) |
| jaw (bigonial) | ≈ 0.79 H | 0.449 H | **×1.75** |
| nose tip past nasion | 0.127 H | 0.101 H | ×1.25, broad and flat |
| lower lip / chin past the upper lip | +0.063 / +0.027 H | −0.013 H | underbite |
| eyeball | 0.016 m, iris 0.49 of the ball | 0.012 m | ×1.3 (human iris ratio kept) |
| lids | upper over 32 % of the iris, lower 14 %, 12° scowl | 25 % / 12 % | heavier |
| ears | blade ≈ 0.12 m root → tip, × 1.2 the first sculpt (`EAR_SCALE`) | 0.263 H | pointed, bigger against the ×1.75 jaw |

## Defects (deliberate, measured)
| Defect | Where | Amount |
|---|---|---|
| scars (raised pale tissue, central crease) | crown → left brow; across the nose bridge; down the right cheek; through the left upper lip | ≈ 3–4 % of the face's ≈ 0.03 m² |
| brow asymmetry | right brow, outer end | 2 mm lower |
| torn ear | right ear rim, 60 % to the tip | 9 mm V notch |
| teeth | right inner lower tooth missing; right outer crooked | 10° lean |
| broken tusk | right tusk | 30 % short, flat fracture + chip; tusks yellow toward the root |
| worn war paint | claw stripes, crest stripe | ~20 % of dabs gone, faded up to 30 % (seeded) |
| plate dents | 3 per cap, 1 on each of the two upper lames (LOD0) | 2–3.5 mm deep, 12–20 mm wide (seeded) |
| plate wear | every rolled lip | paint chipped to bare iron on ~15 % of its vertices; rust runs 25 mm below each rivet |
| strap | baldric | stitched both edges (LOD0) |

## Palette (sRGB)
| Role | Hex |
|---|---|
| skin / warm / cool / crevice | `#62803a` / `#80913f` / `#3f5c3a` / `#24341a` |
| flush / ear cartilage / lips | `#7a7038` / `#8c8c40` / `#5a5a30` |
| eyes: sclera / iris / pupil (+ glow `#ff7a1a` × 2.5, cornea clearcoat) | `#6a3a12` / `#ffb428` / `#1a0c04` |
| bone (tusks, teeth, spikes) / root | `#e4d8b4` / `#b8a06a` |
| scars / war paint | `#a08a64` / `#7d1a12` |
| plates on `steel_painted` (gunmetal) / lips / rivets / bare / rust | `#4a4842` / `#6a665e` / `#b0a898` / `#d8d4cc` / `#7a4422` |
| strap tint on `leather` / thread / necklace cord / fur | `#e6d2b8` / `#c8b48a` / `#3a2618` / `#5c4632` → `#8c7556` |
| hair root → tip / wraps | `#2a2018` → `#6e5842` / `#5b3a22` |

## Parts the engine needs
| Part | Pivot | Note |
|---|---|---|
| `head` | origin | skin above the neck seam (fine cell) |
| `bust` | origin | torso below the seam (coarser cell); LOD2 has no split (all in `head`) |
| `eye_l`, `eye_r` | eyeball centres, yawed to converge 1.5 m ahead | finish `cornea` (clearcoat) + glow |
| `pauldrons`, `spikes`, `harness`, `mantle`, `necklace`, `hair`, `plinth` | origin | static |

The jaw is no longer a separate hinged part: v2's jaw split drew a seam round the mouth; this bust
is a static collectible. Eye `socket` joints are not declared yet: the joints gate now measures a
local section (the ball against its orbit), but this orbit has no bore behind the ball — the lids
fill it — so the human, elf and goblin busts carry the joints and the orc does not (planned).

Intended creases (`creases.ts`): one small region (≤ 3 cm) per sculpted fold, from the landmarks
and geometry that sculpt it — lids, brow shelf, nose, nasolabial folds, mouth line and underbite,
tusk roots, cheekbone arch, jawline, skull base, nuchal furrow, ears and rings; pectoral and
deltoid borders; spike collars; baldric and buckle frame; each fur clump; scalp lock, bun, wraps,
tail locks. The warrior's knot is a bun of three wound turns with two leather wraps over the
tail's root and five tail locks lying down the skull (LOD0; LOD1 three, LOD2 one).

## LODs and budget
Cells: head 5.7 / 11.5 / 40 mm, bust 9.5 / 18 / 32 mm, plates are lofted profiles (36 / 22 / 8
steps). LOD0 ≈ 128k triangles (a hero bust: face, plates, fur and hair all carry detail), LOD1 ≈ 42k,
LOD2 ≈ 3.7k keeping the silhouette (art check: LOD2 IoU vs LOD0 0.87–0.90 front/side/3/4).

## References (stylised anatomy, not likeness)
| Topic | Link | Used for |
|---|---|---|
| Measured human head (ratios) | docs/research/head-analysis.md (Lee Perry-Smith scan, CC BY 3.0) | the anchor every exaggeration is stated against |
| Brute proportions, fat vs muscle, gear scaled to the frame | docs/research/stylised-creatures.md §7 | trapezius, low forward head, oversized plates |
| Orc: widen head and jawline, bony forms early | https://www.creativebloq.com/3d/how-create-orc-zbrush-61411834 | jaw ×1.75, cheekbones |
| Stylised orc head study | https://blenderartists.org/t/orc-head-study-stylized-characters/1655542 | massing check |
| Stylised orc busts (method, not likeness) | https://www.zbrushcentral.com/t/orc-bust/371776 · https://80.lv/articles/sculpting-texturing-a-broken-orc-bust-in-zbrush-3ds-max-substance-3d-painter/ | primary → secondary → tertiary, hand-painted tone |
| Dreams SDF sculpting (Evans, SIGGRAPH 2015) | https://advances.realtimerendering.com/s2015/AlexEvans_SIGGRAPH-2015-sml.pdf | ordered smooth-min edits |

## Known gaps
Ears alias at the LOD0 cell along the thin rim; the fur mantle reads as a hide with a ragged edge
more than individual fur clumps; skin pores are a light displacement, not alpha stamps; the plates'
hard edges come from lofted profiles but the dents are smooth radial pushes (no hammer facets).
