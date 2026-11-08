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

## Built by
`spec.ts`, `features.ts` (grin teeth, worried brow creases, seeded warts), `hair.ts` (wisps),
`clothes.ts` (shirt, hemmed vest, soft hood roll, scarf) and `creases.ts` (the intended folds as
≤ 3 cm regions from the same geometry) on the shared bust library `../_lib/bust/`. Eye `socket`
joints as on every bust.

## Palette (sRGB)
| Role | Hex |
|---|---|
| skin / warm / cool / crevice / warts | `#9cb84a` / `#b8c860` / `#6a8a4a` / `#3a4a1a` / `#7a8a3a` |
| eyes: sclera / iris | `#f0e6a0` / `#e0a020` |
| teeth | `#e8dcae` |
| hair root → tip | `#b0a890` → `#f0ece0` |
| shirt / vest / hood / scarf | `#d8ccaa` / `#6a4428` / `#4a5a34` / `#9a3020` |

## Known gaps
The vest and shirt are sculpted onto the torso (paint + an offset layer); the vest's edge is a soft
hem fillet, not sewn cloth; ears alias slightly along their thin rim at LOD0.
