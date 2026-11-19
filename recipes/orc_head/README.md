# Orc warrior bust — original stylised design (v4, skull pipeline)

## Identity
A scarred orc warrior in the chunky fantasy-game idiom (inspiration only: no character, logo or
likeness copied), read from the 3/4 view by: a **low sloped vault over a massive face**, a **heavy
brow shelf** over **small deep-set ember eyes**, a **broad flat nose**, a **muzzle with an
underbite on a jaw wider than the temples**, **lower tusks rooted in the jaw** (the right one broken
off), **pointed ears swept back**, a **thick neck into trapezius that rise to the ears**, **scars and
warts**; **forged plate pauldrons** with bone spikes, a **leather baldric**, a **fur mantle**, a
**bead necklace**, a **warrior's knot** and card hair; a turned plinth.

## How it is built (the shared skull pipeline, like the human, elf and goblin busts)
| Stage | What | Where |
|---|---|---|
| skull | the CC0 MakeHuman base (docs/research/face-base.md) warped by `ORC_FACE` — cranium, orbits, nose, jaw, lips, ears and neck from one anatomical mesh — placed in the orc frame (menton 0.285 → crown 0.585) | `spec.ts`, `../_lib/face/skull.ts` |
| planes | forehead, temple, cheek, buccal, jaw and chin planes flattened (`forms.planes` 1.4) | `../_lib/face/planes.ts` |
| muscles | supraorbital ridge (`brow` 2.6: the shelf), zygoma, masseter, jaw line, sternocleidomastoid | `../_lib/face/planes.ts` |
| features | lid fold, nasolabial, mentolabial, vermilion; the orc's forehead furrows, under-eye bags, flared nose wings, the sealed mouth and its line, scars, warts and pores as placed VDM stamps (`scarWelt`, `wart`, `poreField`; plan 19) | `../_lib/face/features.ts`, `features.ts` |
| skin | zones: lips, warm flush on the nose and ears, dark sockets, a darker brow band, a grey-green jaw; the painter's curvature + cavity bake (8 mm stencil), mottle and pore-scale speckle | `../_lib/face/zones.ts`, `features.ts`, `skin.ts` |
| body | the orc's own torso (neck leaning into the trapezius hunch, deltoids, pecs, barrel chest) in place of the shared parametric one (`BustRecipe.body`) | `torso.ts` |
| tusks | swept tapered tubes rooted ≈ 3 cm in the mandible behind the lower lip, out through the lip, rising in front of the upper lip; ivory stained brown at the gum line; the right one snapped at 60 % | `tusks.ts` |

## Race deltas vs the human (declared; no orc anthropometry exists)
The orc archetype's shape language is the square and the wedge: brute mass low in the face and
shoulders, a small brain case, a predator's mouth. Every number is a ratio against the measured
human base (`spec.ts` `ORC_FACE`), and each has a reason:

| Feature | Orc | Reason |
|---|---|---|
| head | H 0.30 m (×1.3 human 0.23) | a big brute; the gear was built for this frame |
| vault | height ×0.74, depth ×0.84 | a low sloped brain case: the face, not the skull, is the mass |
| brow | 8 % H forward, 2.8 % H down | the shelf that shadows the eyes (the archetype's scowl) |
| eyes | size ×0.86, lids open ×0.76, outer corners 1.2 % H down | small, deep-set and hooded under the shelf |
| nose | width ×2.6, projection ×0.62, bridge sunk 3 % H | broad, flat and porcine: a boxer's, not a hook (a ×2.2 nose still read human) |
| muzzle | lips, nose base and chin 6 % H forward | prognathism: the predator's mouth leads the face |
| jaw | bigonial ×1.9, dropped 11 % H; chin ×1.75 wide, 7.5 % H forward; zygoma ×1.18 | the jaw wider than the temples (the square silhouette) |
| mouth | ×1.35 wide, lips +2 % H, lower lip 5.5 % H ahead (underbite) | the underbite that carries the lower tusks |
| ears | ×1.4 long, tip pulled back and up, swung out 22° | pointed, swept back: the race's read in silhouette |
| neck / traps | neck ×1.7, trapezius 18 % H higher | a neck that merges into a hunch rising to the ears |

Measured on the built head against `ORC_PROPORTIONS` (the human bands, each orc delta declared;
`checks` in `orc_head.ts`, test in `tusks.test.ts`):

| Ratio | Orc band | Built | Human band |
|---|---|---|---|
| eye line (pupil ÷ menton → vertex) | 0.50–0.62 | 0.62 | 0.45–0.53 |
| eye fissure ÷ head breadth | 0.12–0.20 | 0.15 | 0.17–0.23 |
| intercanthal ÷ fissure | 0.9–1.7 | 1.65 | 0.85–1.3 |
| glabella → subnasale ÷ subnasale → menton | 0.6–1.0 | 0.68 | 0.75–1.15 |
| "neck" ÷ head breadth (a third down from the jaw angle: the trap shelf) | 2.6–3.8 | 3.45 | 0.66–0.86 |
| glabella ahead of the eyeball | 14–50 mm | 46.7 mm | 8–24 mm |
| eyeball | 22–30 mm | 25.1 mm | 22–26 mm |

## Defects (deliberate, measured)
| Defect | Where | Amount |
|---|---|---|
| scars (`scarWelt` VDM stamps, one per segment, 2.2 mm proud; painted pale) | crown → left brow; across the nose bridge; down the right cheek to the jaw | 3 strokes, not mirrored |
| warts | left cheek, right cheekbone, crown | 3 lobed `wart` stamps, radius 6–8 mm × seeded 0.75–1.25 |
| broken tusk | right tusk | snapped at 60 % of its length, a flat fracture |
| asymmetry | the whole face | `asym` 0.3: seeded per-landmark offsets ≤ 0.36 % H |

## Palette (sRGB)
| Role | Hex |
|---|---|
| skin / warm / cool / crevice | `#5f7a46` / `#7e8c4c` / `#465646` / `#222a1a` |
| skin / warm / cool | `#5a6c44` / `#7a8049` / `#3f4b40` (weathered olive-grey) |
| flush (nose) / ear cartilage / lips / sockets / brow band / warts | `#86784a` / `#8a8650` / `#5a4e36` / `#4a5038` / `#3e4630` / `#5e6a40` |
| eyes: sclera / iris / pupil (+ glow `#ff7a1a` × 2.5, cornea clearcoat) | `#6a3a12` / `#ffb428` / `#1a0c04` |
| tusk ivory / root stain / scars | `#e4d8b4` / `#7a5a2e` / `#b49e80` |
| plates on `steel_painted` (gunmetal) / lips / rivets / bare / rust | `#4a4842` / `#6a665e` / `#b0a898` / `#d8d4cc` / `#7a4422` |
| strap tint on `leather` / thread / necklace cord / fur | `#e6d2b8` / `#c8b48a` / `#3a2618` / `#5c4632` → `#8c7556` |
| hair root → tip / wraps | `#2a2018` → `#6e5842` / `#5b3a22` |

## Parts the engine needs
| Part | Pivot | Note |
|---|---|---|
| `head` | origin | skin above the neck seam (fine cell; eyes, ears, mouth meshed finer at LOD0) |
| `bust` | origin | torso below the seam (coarser cell); LOD2 has no split (all in `head`) |
| `tusks` | origin | both tusks, roots buried in the jaw |
| `eye_l`, `eye_r` | eyeball centres, yawed to converge 1.5 m ahead | finish `cornea` + glow; `socket` joints into `head` (LOD0) |
| `pauldrons`, `spikes`, `harness`, `mantle`, `necklace`, `hair_knot`, `hair`, `plinth` | origin | static; `hair` is the card hair (cutout) |

The seam between `head` and `bust` (`landmarks.ts` `seamN`/`seamZ`) runs under the necklace at the
front, below the massive jaw, and under the fur mantle at the back.

Intended creases (`creases.ts`): the skull stage's folds (`skullCreases`), the orc's forehead
furrows, mouth line, underbite, the jaw's underside, the skull's base and the neck's
sternocleidomastoid, scars, warts and tusk roots; pectoral and deltoid borders; spike collars;
baldric and buckle; fur clumps and the spine; the necklace; scalp lock, bun, wraps and tail locks.
Every region ≤ 3 cm.

## LODs and budget
Cells: head 6.4 / 11.5 / 30 mm, bust 12 / 20 / 32 mm. LOD0 ≈ 129k triangles (the skull-stage head
≈ 50k with its eye, ear and mouth boxes, card beard and brows ≈ 17k, plates 15k, spikes, fur, the
knot), LOD1 ≈ 37k, LOD2 ≈ 4.7k (budget 130k / 38.5k / 5k; 2026-11: down from 180k / 46k by
coarser cells on the smooth skin, 26 instead of 36 steps round the plates, 6-segment beads and a
quarter fewer beard cards). LOD2 builds each pauldron as closed solids (`farShell`: a cap of a
sphere and the outer half of a sleeve), not plates a cell thick, and drops the skin's pore
speckle. `t3d build` ≈ 40 s.

## Wear
Plates: hammer peening, dents, paint chipped to bare iron on the lips, rust under the rivets
(`plates.ts`). Fur and strap: `weather` in `build.ts` (mud dried into the fur's low clumps and
the strap's low end, dust on what faces up), the strap blotched near-black with sweat and grease.
Tusks: root stain, three nicks on the front edge (`tusks.ts`), the right one broken. Face: scars,
war paint.

## References (stylised anatomy, not likeness)
| Topic | Link | Used for |
|---|---|---|
| CC0 base head and its landmarks | docs/research/face-base.md | the skull every delta warps |
| Measured human head (ratios) | docs/research/head-analysis.md (Lee Perry-Smith scan, CC BY 3.0) | the anchor every exaggeration is stated against |
| Brute proportions, fat vs muscle, gear scaled to the frame | docs/research/stylised-creatures.md §7 | trapezius, low forward head, oversized plates |
| Orc: widen head and jawline, bony forms early | https://www.creativebloq.com/3d/how-create-orc-zbrush-61411834 | jaw, cheekbones |
| Stylised orc head study | https://blenderartists.org/t/orc-head-study-stylized-characters/1655542 | massing check |
| Stylised orc busts (method, not likeness) | https://www.zbrushcentral.com/t/orc-bust/371776 · https://80.lv/articles/sculpting-texturing-a-broken-orc-bust-in-zbrush-3ds-max-substance-3d-painter/ | primary → secondary → tertiary, hand-painted tone |

## Known gaps
The closed lips still alias a little at the tusks' exits; the beard is three card layers (dense
flat base, hanging locks, wiry strays) over a hair-painted chin, coarse brow cards sit on the
shelf (both root on the finished head, not the stage-2 skin); pores are `poreField` stamps on the
nose, cheeks and forehead (LOD0); the tusks are rigid parts, so the `talk` clip's jaw morph opens
the lips round them without moving them; the plates' dents are smooth radial pushes (no hammer
facets); the skin is one roughness (the shared skin mesher puts it on the `plain` strip); the
tail's locks are sculpted, not strand cards. Rig: `head` and `bust` carry the blink / talk / breathe morphs under the `face` node
(`headClips('face')`).

## Triangle budget (As of 2026-11-19)
About 112k / 30k / 4.1k against the bust band of 60k / 12k / 1.5k (it was 129k / 37k / 4.7k, and 180k / 46k / 4.8k at the baseline). The head is meshed at a 7.6 mm cell (6.4 mm before). Not reduced further this round: the plate pauldrons (15k), the fur mantle (10k), the strap (7k) and the card beard (17k) were not re-measured at lower densities, so about 20k of LOD0 is still open to cutting.

Budget why: a bust twice the others' volume (0.30 m skull, trapezius to the ears) in full gear: plate pauldrons with bone spikes, fur mantle, strap, necklace, knot and a card beard, each a closed sculpt.

