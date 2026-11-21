# Orc warrior bust — original stylised design (v4, skull pipeline)

## Identity
A scarred orc warrior in the chunky fantasy-game idiom (inspiration only: no character, logo or
likeness copied), read from the 3/4 view by: a **low sloped vault over a massive face**, a **heavy
brow shelf** over **small deep-set ember eyes**, a **broad flat nose**, a **muzzle with an
underbite on a jaw wider than the temples**, **lower tusks rooted in the jaw** rising in front of the upper
lip (the left one broken off), **pointed ears swept back**, a **thick neck into trapezius that rise to the ears**, **scars and
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
| tusks | the lower canines (see "Tusk anatomy"): swept tapered tubes rooted ≈ 4 cm in the mandible behind the lower lip, leaving the mouth at the lower lip's top (the lip rolled round the base: `features.ts` `tuskLips`), rising in front of the upper lip and a little outward, the tip curling back at nose-wing height; yellowed ivory: a narrow grime line where the lip lets go, graded over ≈ 6 mm into a darker yellowed root, paling to a chipped tip (D526); the left one snapped at 60 % in a jagged break; the beard parts round both bases (`hair.ts` `beardRegion`); between them six uneven, stained lower teeth stand over the lower lip in front of the upper (`lowerTeeth`, D526) | `tusks.ts`, `../_lib/face/tusks.ts`, `../_lib/face/tusk-breaks.ts` |

## Tusk anatomy (tested: `tusks.test.ts`)
An orc's tusks are its **lower canines** grown long — the game-art convention for orcs, borrowed from the wild boar, whose
lower canines are the long tusks, leaving the lower jaw, rising outside the upper lip and curving
up and back. Rules
the build keeps, each checked against the mouth's own landmarks on the finished head:
root ≥ 1 cm inside the jaw below the mouth line, inside the corners; leaves the face at the lower
lip's top (above halfway from labrale inferius to stomion); ≥ 1.2 cm in front of the upper lip at
labrale superius height; tip at the nose wing's height (alare), 3 mm – 3 cm in front of the face
(not standing off it); the lower lip rolls round the base; the beard keeps a 2.4 cm clearing round
each base. Old ivory, not paper-white: a narrow grime line at the gum graded into a darker
yellowed root, paler toward a chipped tip (a stain over half the tusk read as two-tone pegs in a
brown socket, D526). Six lower incisors between the tusks: blunt, uneven pegs rooted in the lower
lip, crowns ≥ 2 mm proud of the face above the mouth line, clear of the tusks (tested). (Before 2026-11-20 the tusks left the face through the chin inside the beard
and their tips stood 4 cm off the cheek: the hero read one tusk hanging down out of the beard and
one standing beside the face.)

| Reference | Link | Used for |
|---|---|---|
| Warthog: two pairs of tusks protrude from the mouth curving upwards; the far shorter lower pair is honed razor-sharp against the uppers; a tusk curves 90° or more from the root, somewhat backwards | https://en.wikipedia.org/wiki/Common_warthog | the up-and-back curve, a lower canine riding outside the upper lip |
| Wild boar: the canines protrude from adult males' mouths; the lower canines are much sharper and longer (10–12 cm exposed), the uppers short, curving up | https://en.wikipedia.org/wiki/Wild_boar | the LOWER canine as the long tusk, rooted in the lower jaw |
| Orc in fantasy art: lower tusks projecting from an underbite | https://en.wikipedia.org/wiki/Orc | the convention, not a likeness |

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
| broken tusk | left tusk (the whole right one faces the hero camera) | snapped at 60 % of its length, a jagged stepped fracture: four sharp teeth round a cratered break of fresh pale dentine, dirt in the notches (D524) |
| asymmetry | the whole face | `asym` 0.3: seeded per-landmark offsets ≤ 0.36 % H |

## Palette (sRGB)
| Role | Hex |
|---|---|
| skin / warm / cool / crevice | `#5f7a46` / `#7e8c4c` / `#465646` / `#222a1a` |
| skin / warm / cool | `#5a6c44` / `#7a8049` / `#3f4b40` (weathered olive-grey) |
| flush (nose) / ear cartilage / lips / sockets / brow band / warts | `#86784a` / `#8a8650` / `#5a4e36` / `#4a5038` / `#3e4630` / `#5e6a40` |
| eyes: sclera / iris / pupil (+ glow `#ff7a1a` × 2.5, cornea clearcoat) | `#6a3a12` / `#ffb428` / `#1a0c04` |
| tusk ivory / worn tip / gum-line stain / spike bone / scars | `#c9ab6c` / `#ddc99a` / `#3e2810` / `#e4d8b4` / `#b49e80` |
| plate tint on `aluminium` (bare dark steel; `steel_painted` read as grey plastic, D547) / rolled wires / rivets / rubbed edges / rust / soot | `#5c5955` / `#8a857c` / `#7a756c` / `#b5b0a6` / `#573019` / `#2b2927` |
| strap tint on `leather` / thread / necklace cord / fur | `#e6d2b8` / `#c8b48a` / `#3a2618` / `#5c4632` → `#8c7556` |
| hair root → tip / wraps | `#2a2018` → `#6e5842` / `#5b3a22` |

## Parts the engine needs
| Part | Pivot | Note |
|---|---|---|
| `head` | origin | skin above the neck seam (fine cell; eyes, ears, mouth meshed finer at LOD0) |
| `bust` | origin | torso below the seam (coarser cell); LOD2 has no split (all in `head`) |
| `tusks` | origin | both tusks, roots buried in the jaw, and the lower teeth between them (LOD0–1) |
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
quarter fewer beard cards). LOD2 (D549, `far.ts`) is built for 30 px, not decimated: each
pauldron a closed dome of revolution with its flared lip and one solid lame band (9 rings), each
spike a cone in its collar, the beard one sculpted mass in the cards' colour (only the brows stay
cards), the head at a 30 mm cell through stage 3 (brow shelf, nose, jaw; ≈ 2.0k of the 4.4k) and
the ember eyes moved out past the orbit's rim so they stay lit. It drops the skin's pore
speckle. `t3d build` ≈ 40 s.

## Wear
Plates (`armour.ts`, D547, D548): each pauldron is a crown plate lapped 7 mm over a skirt plate,
eight domed rivets through the lap, the skirt's and the lames' lower edges rolled over a wire of
brighter steel; LOD0 is hammer-peened (facets 1.2–2.2 mm deep, 2.6–4 cm across) and dented by
five blows a pauldron (3–5 mm). `weather` then lays the wear where it happens, measured in the
manifest: edges rubbed bright (`convex-edges`, 45 %), scratches over the open plate (6 %), rust
under the rivets with 3 cm runs (12 %), soot in the hollows (`cavities`, 50 %). The right
pauldron's raked spike is snapped off short. Fur and strap: `weather` in `build.ts` (mud dried into the fur's low clumps and
the strap's low end, dust on what faces up), the strap blotched near-black with sweat and grease.
Tusks: gum-line stain, a chipped tip and three nicks on the front edge (`tusks.ts`), the left one
broken. Face: scars,
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
The closed lip line is a crease drawn a cell wide in the skin's crevice olive (near-black it read as a ragged seam; the lower teeth now cover it between the tusks, D526); the beard is three card layers (dense
flat base, hanging locks, wiry strays) over a hair-painted chin, coarse brow cards sit on the
shelf (both root on the finished head, not the stage-2 skin); pores are `poreField` stamps on the
nose, cheeks and forehead (LOD0); the tusks are rigid parts, so the `talk` clip's jaw morph opens
the lips round them without moving them; the plates' scratches and rubbed edges are vertex colour on rings about a centimetre apart, so
they read as worn patches, not hairline scratches (a wear texture would need its own strip); the skin is the shared tiling pore strip (matte cheeks, a glossier brow, nose and chin: `../_lib/face/skin-strip.ts`) under one `skin` finish (the shared `skinFinish`: a soft grazing sheen, no clear coat, so cheeks and shoulders stay matte and only the oily strip's T-zone (up to a tenth of the head over the glabella) shines; the scalp above it and behind the ears is on the matte strip, `face_skin_matte`, so a bald or shaven dome has no wet hot spots), not a per-face texture; the
tail's locks are sculpted, not strand cards. Rig: `head` and `bust` carry the blink / talk / breathe morphs under the `face` node
(`headClips('face')`).

## Triangle budget (As of 2026-11-21)
About 115k / 30k / 4.4k (As of 2026-11-19: 114k / 29k / 4.0k; the forged two-plate pauldrons with revolved rivets cost 18k where the single domes with sculpted rivets cost 16.5k, the far head 2.0k where it had 1.3k) (two lames a pauldron, not three: they end where the arm stub does, 1.2 cm outside its axis) against the bust band of 60k / 12k / 1.5k (it was 129k / 37k / 4.7k, and 180k / 46k / 4.8k at the baseline). The head is meshed at a 7.6 mm cell (6.4 mm before). Not reduced further this round: the plate pauldrons (15k), the fur mantle (10k), the strap (7k) and the card beard (17k) were not re-measured at lower densities, so about 20k of LOD0 is still open to cutting.

Budget why: a bust twice the others' volume (0.30 m skull, trapezius to the ears) in full gear: plate pauldrons with bone spikes, fur mantle, strap, necklace, knot and a card beard, each a closed sculpt.

