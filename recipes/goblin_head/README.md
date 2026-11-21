# Goblin bust — original stylised design

## Identity
A sly, scrawny goblin tinker: **huge notched leaf ears** held out sideways, a **long hooked nose**,
a **wide grin of small pointed teeth**, **big amber eyes under heavy drooping lids**, a **worried
creased brow**, **warts**, **pale wisps of hair** off a big dome; a **skinny but muscled neck**
(sternocleidomastoids, windpipe) on **bony
shoulders** in a **linen shirt**, an open **leather vest**, a **hood worn down** and a **knotted red
scarf** — cut as a collectible bust on a turned plinth.

## Proportions: the measured human (docs/research/head-analysis.md) with declared exaggerations
| Feature | Goblin | Human | Exaggeration |
|---|---|---|---|
| head | 0.19 m | 0.23 m | ×0.83 |
| cranium width / vault | 0.779 H / ×1.12 | 0.683 H | ×1.14 |
| eyeball | 0.075 H | 0.052 H | **×1.45** |
| interpupil | 0.331 H (0.063 m, `measures`) | 0.265 H | ×1.25 |
| lids | upper 36 % / lower 14 % of the iris, tilt −7° | 25 % / 12 % | heavy, drooping |
| nose projection / hook | 0.202 H / 0.035 H | 0.072 H | **×2.8** |
| mouth half-width | 0.17 H | 0.10 H | grin |
| jaw / chin | ×0.8 / ×0.7 | — | small, sharp |
| ear | human structure, 2.1 × the length, width 0.6, held out, two notches; root and lobe stay small (root sized by the human ear, lobe ×0.25) | 0.263 H | **×2.1** |
| neck | 0.51 × head width, chin 0.28 H above the scarf | 0.7–0.8 | skinny (declared `NECK`: 0.45–0.6) |

## Skull stage (2026-11)
The head is now the CC0 base warped by `GOBLIN_FACE` (`spec.ts`): vault ×1.12 high and ×1.14 wide,
eyes ×1.45 (orbit, lids, ball) set ×1.28, nose ×2.8 projecting and hooked 5 % H, mouth ×1.4, chin
receding ×0.7, ears swung 48° out with the tips drawn 0.56 H out and back in the ear's own plane and grafted as 44 mm leaves of 5.5 mm cartilage (`GRAFT`, D574), thin neck ×0.8; a heavy brow shelf over deep orbits, lids 3 mm thick, knobbly cheekbones (`STRUCTURE`, D570–D572); hard planes and deep lines (`forms`), the
grin's teeth, worried brow and warts (`features.ts`) placed on the skull's landmarks. It is checked
against `GOBLIN_PROPORTIONS` — the human bands with each delta declared and justified. The table
above records the earlier primitive head.

## Built by
`spec.ts`, `torso.ts` (the shared torso with the goblin's stoop: a hump behind the neck's root, a
flat bony chest, the body sat 2.2 cm higher under the head, `LT`), `features.ts` (the `teeth` part,
LOD0/1: small pointed upper teeth each its own length, lean and stain hanging over the lower lip,
and two short lower fangs — small curved tusks, the lower lip swollen round their bases — rising
in front of the upper lip: the underbite; sculpted cones finer than the head cell had vanished, worried brow creases, six warts each its own size, the lips as rolls round the mouth's dark gap (D576), the ears' leaves,
the far LOD's ear blades), `hair.ts` (wisps), `clothes.ts` (the outfit as layers) and
`creases.ts` (the intended folds as ≤ 3 cm regions from the same geometry) on the shared bust
library `../_lib/bust/`. Eye `socket` joints as on every bust.

## Outfit: one closed solid per material (2026-11)
The garments are no longer sculpted into the skin. `outfitLayers` (`clothes.ts`) returns each layer
with its trim-sheet strip; `build.ts` meshes each on that strip, fairs it (`fair`: a cut edge a
cell thick meshes as a saw-tooth), weathers it (`weather`: dust on what faces up, scuffs on convex
edges) and merges them as the `clothes` part under the `face` node, so they breathe with the
chest. The skin under them is cut away (`hiddenBody`), so no triangle is spent on a hidden chest.

| Layer | Strip | What it carries |
|---|---|---|
| shirt | `bust_linen` (`LINEN`, ../_lib/bust/cloth-strips.ts: plain weave, roughness 0.82) | linen, sleeves out of the armholes, zigzag and sleeve folds, grime at neck and placket, old stains |
| vest | `leather` | sleeveless 9 mm hide, rolled edges rubbed pale, shoulder seam, sweat-dark under the arms and down the back, two sewn patches |
| hood | `bust_wool` (`WOOL`: coarse twill, roughness 0.94) | wool roll behind the neck, U folds, road dust on top |
| scarf | `bust_wool` | three flat wraps (sun-faded outer fold), a flat knot, two ragged tails muddy at the ends |
| `toggle` (own part, LOD0–1) | `plain` | a horn toggle on a thong across the vest's opening |

No garment takes a finish: the cloth strips carry their own roughness. Vertex colours are tints:
the strip's own albedo times the tint gives the colour in the table below (`on(strip, colour)`;
the cloth strips' near-white ground is `CLOTH_ALBEDO`).

## LODs and budget
| LOD | Triangles | What changes |
|---|---|---|
| 0 | ≈ 54.7k (budget 58k) | head 6 mm, finer round the eyes, ears and mouth (head ≈ 28k, bust ≈ 2.1k); garment layers 6–10 mm (≈ 16.7k); hair cards ≈ 1.4k |
| 1 | ≈ 14.0k (14.5k) | head 10 mm (≈ 3.9k), layers 10–16 mm (≈ 6.2k), a few hair cards (≈ 0.2k) |
| 2 | ≈ 2.6k (2.7k) | head 21 mm; the ears as tapered blades that cell can hold (`farEars`); every garment layer in ONE sculpt on `bust_wool` at a 2.6 cm cell, coloured by the garment on top with flat colour blocks (`far`, ≈ 1.1k); no toggle; the crown wisps and ear tufts as a few wide cards |

## Palette (sRGB)
| Role | Hex |
|---|---|
| skin / warm / cool / crevice / warts | `#9cb84a` / `#b8c860` / `#6a8a4a` / `#3a4a1a` / `#7a8a3a` |
| eyes: sclera / iris | `#f0e6a0` / `#e0a020` |
| teeth (yellowed enamel) / stained necks | `#d6c48e` / `#8a6a3a` |
| hair root → tip | `#b0a890` → `#f0ece0` |
| shirt / vest / hood / scarf | `#d8ccaa` / `#6a4428` / `#4a5a34` / `#9a3020` |
| wear: linen grime / sweat-dark leather / patch / dust / faded scarf / scarf mud / horn | `#7d7052` / `#2e1c10` / `#8a5a34` / `#a8987a` / `#b4553c` / `#4a2a1c` / `#cdbf9a` |

## Known gaps
The skin's detail is the shared tiling pore strips (`pores: true`: true-scale pores and micro-relief, clear skin off the nose and cheeks (D520); matte cheeks, a glossier T-zone, fine thin skin and lines round the eyes, wet lips) under one olive `skin`
finish (the shared `skinFinish`: a soft grazing sheen, no clear coat, so cheeks and shoulders stay matte and only the oily strip's T-zone (up to a tenth of the head over the glabella) shines; the scalp above it and behind the ears is on the matte strip, `face_skin_matte`, so a bald or shaven dome has no wet hot spots), not a per-face texture; the hero is a portrait camera (`../_lib/bust/hero.ts`); the vest's cut edges are ragged at the cell's scale even after fairing; stitches are a
groove and a paler line, not thread (a 2 mm stitch is under the layer's cell); the neck is the
base mesh's and stays straight (the stoop is carried by the raised shoulders and the hump); the
mouth's grin is the base's parted lips widened ×1.6, not a re-sculpted smile.

## Triangle budget (As of 2026-11-19)
About 54.7k / 14.0k / 2.6k (budget 58k / 14.5k / 2.7k) against the bust band of 60k / 12k / 1.5k (it was 83k / 21k / 3.6k): LOD0 fits. The head is meshed at a 6 mm cell (4.6 mm before), finer only round the eyes, ears and mouth.

Budget why: LOD1 carries four closed garment layers (shirt, vest, hood, scarf) and the long ears; LOD2 merges the garments into one far sculpt (`outfitLayers`' `far` layer, ≈ 1.1k) but keeps the ear blades, and a head cell over 2.1 cm folds them, and they name the race.

