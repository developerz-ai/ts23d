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
receding ×0.7, ears ×2.6 swung out 60°, thin neck ×0.8; hard planes and deep lines (`forms`), the
grin's teeth, worried brow and warts (`features.ts`) placed on the skull's landmarks. It is checked
against `GOBLIN_PROPORTIONS` — the human bands with each delta declared and justified. The table
above records the earlier primitive head.

## Built by
`spec.ts`, `torso.ts` (the shared torso with the goblin's stoop: a hump behind the neck's root, a
flat bony chest, the body sat 2.2 cm higher under the head, `LT`), `features.ts` (grin teeth
along the parted lips, worried brow creases, six warts each its own size, the ear tips' cartilage
edge, the far LOD's ear blades), `hair.ts` (wisps), `clothes.ts` (the outfit as layers) and
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
| shirt | `canvas` | linen, sleeves out of the armholes, zigzag and sleeve folds, grime at neck and placket, old stains |
| vest | `leather` | sleeveless 9 mm hide, rolled edges rubbed pale, shoulder seam, sweat-dark under the arms and down the back, two sewn patches |
| hood | `canvas` | wool roll behind the neck, U folds, road dust on top |
| scarf | `canvas` | three flat wraps (sun-faded outer fold), a flat knot, two ragged tails muddy at the ends |
| `toggle` (own part, LOD0) | `plain` | a horn toggle on a thong across the vest's opening |

Vertex colours are tints: the strip's own albedo times the tint gives the colour in the table
below (`on(strip, colour)`).

## LODs and budget
| LOD | Triangles | What changes |
|---|---|---|
| 0 | ≈ 83k (budget 86k) | head 4.6 mm (eyes ×4, ears ×2 finer), garment layers 5–8.5 mm |
| 1 | ≈ 21k (24k) | head 7.5 mm, layers 8–13 mm, a quarter of the hair cards |
| 2 | ≈ 3.6k (4k) | one coarse head; the ears as tapered blades the 16 mm cell can hold (`farEars`); every garment layer in ONE sculpt on `canvas` with flat colour blocks (`far`); the crown wisps and ear tufts as a few wide cards |

## Palette (sRGB)
| Role | Hex |
|---|---|
| skin / warm / cool / crevice / warts | `#9cb84a` / `#b8c860` / `#6a8a4a` / `#3a4a1a` / `#7a8a3a` |
| eyes: sclera / iris | `#f0e6a0` / `#e0a020` |
| teeth | `#e8dcae` |
| hair root → tip | `#b0a890` → `#f0ece0` |
| shirt / vest / hood / scarf | `#d8ccaa` / `#6a4428` / `#4a5a34` / `#9a3020` |
| wear: linen grime / sweat-dark leather / patch / dust / faded scarf / scarf mud / horn | `#7d7052` / `#2e1c10` / `#8a5a34` / `#a8987a` / `#b4553c` / `#4a2a1c` / `#cdbf9a` |

## Known gaps
The skin is one roughness (the shared skin mesher puts it on the `plain` strip and takes no
finish); the vest's cut edges are ragged at the cell's scale even after fairing; stitches are a
groove and a paler line, not thread (a 2 mm stitch is under the layer's cell); the neck is the
base mesh's and stays straight (the stoop is carried by the raised shoulders and the hump); the
mouth's grin is the base's parted lips widened ×1.6, not a re-sculpted smile.

## Triangle budget (As of 2026-11-19)
About 54k / 13.5k / 2.5k against the bust band of 60k / 12k / 1.5k (it was 83k / 21k / 3.6k): LOD0 fits. The head is meshed at a 6 mm cell (4.6 mm before), finer only round the eyes, ears and mouth.

Budget why: LOD1 and LOD2 carry four closed garment layers (shirt, vest, hood, scarf) and the long ears; a head cell over 2.1 cm at LOD2 folds the ear blades, which name the race.

