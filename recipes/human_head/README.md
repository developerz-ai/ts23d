# Human hero bust — original stylised design

## Identity
A young adventurer, read from the 3/4 view by: **classical proportions pushed slightly heroic**
(square jaw, strong brow, thick neck), **defined arched eyebrows**, **swept-back hair** in chunky
tapered two-tone locks over a rounded hairline, a **clipped beard with chin volume and a drooping
moustache**, clear blue eyes, a **blue tunic** with a standing leather collar, placket and brass
buttons, and a **red mantle** over the shoulders pinned with a brass brooch.

## Design spec (head units: 1 = chin to crown = 0.23 m, adult human)
| Feature | Value (units) | Metres | Note |
|---|---|---|---|
| chin → crown | 1.00 | 0.230 | adult menton–vertex ≈ 0.22–0.24 m |
| overall bust L × W × H | — | 0.247 × 0.464 × 0.439 | `real`, ±5 % |
| cranium width / depth | 0.66 / 0.86 | 0.152 / 0.198 | adult head breadth ≈ 0.15 m, length ≈ 0.19–0.20 m |
| eye line | 0.50 | — | Loomis: half height |
| eyeball radius / spacing | 0.052 / 0.135 | 0.012 / pupils 0.062 apart | human eyeball ≈ 24 mm; IPD ≈ 62 mm |
| eye line → nose base | 0.18 | 0.041 | thirds: brow / nose / chin |
| jaw half-width | 0.22 | 0.051 | bigonial ≈ 0.10 m |
| ears | round, 0.27 long | 0.062 | between brow and nose base |
| neck radius | 0.27 | 0.062 | heroic: thicker than average |

## Palette (sRGB)
| Role | Hex |
|---|---|
| skin / shade / lips | `#d9a07a` / `#a8644a` / `#b86b5c` |
| eyes: sclera / iris | `#ece6dc` / `#3d6e9e` |
| hair + beard (two-tone locks ×1.5) | `#5a3a22` |
| tunic / mantle / collar, placket / brooch, buttons | `#2e4f8a` / `#7a2420` / `#6b4428` / `#c9a24a` |

## Parts the engine needs
| Part | Pivot | Motion |
|---|---|---|
| `bust` | origin, base on z = 0 | static |
| `head` | origin | static (skull, neck, ears, hair) |
| `jaw` | jaw hinge (in front of the ear), opens about +Y | static by default; `head(ctx, { jawSway: 4 })` bakes a sway with `clearOf: ['head']` |
| `eye_l`, `eye_r` | eyeball centres, gaze +X | static; rotate them to aim |

The jaw region is the chin + lower lip (an ellipsoid cut flat at the mouth line), so its seam runs
along the lips, the marionette lines and under the chin. Its cut faces are painted mouth-dark for
when it opens; it laps 0.75 cells over the head so no gap shows.

## LODs
Sculpt cell = 2 % / 4.5 % / 14 % of head height. LOD0/1 bake vertex AO across all parts (16/10 rays); LOD2 drops
warts, wiry tufts and the AO bake, and floors ear thickness at 0.7 cells so ears stay attached.

## References (stylised anatomy, not likeness)
| Topic | Link | Used for |
|---|---|---|
| Loomis head: eye line at half height, brow/nose/chin thirds | https://finearttutorials.com/guide/loomis-method/ | human eye line 0.5, nose base 0.32, mouth 0.22 |
| Proportions of the head (ears between brow and nose base, head ≈ 5 eyes wide) | https://artyfactory.com/portraits/pencil-portraits/proportions-of-a-head.html | ear placement, eye size vs head width |
| Primary → secondary → tertiary forms (block brow/cheek/jaw first, then cut lids and folds) | https://www.creativebloq.com/how-to/how-to-sculpt-and-pose-a-cartoon-head-in-zbrush | the edit order in `head-face.ts` |
| Orc: widen head and jawline to break human proportion | https://www.creativebloq.com/3d/how-create-orc-zbrush-61411834 | orc jaw width 0.37 vs human 0.22 |
| Stylised orc head study (silhouette, form language) | https://blenderartists.org/t/orc-head-study-stylized-characters/1655542 | massing check |
| Stylised hair: large clumps first, hairline → crown, one primary flow direction | https://gamesartist.co.uk/curly-hair-ls/ · https://www.cgchannel.com/2023/03/tutorial-creating-stylized-hairstyles-using-zbrush | `swept` locks in head-hair.ts |
| Dreams (Media Molecule, Evans, SIGGRAPH 2015): sculptures as ordered SDF edits + smooth-min | https://www.mediamolecule.com/blog/article/siggraph_2015 · slides https://advances.realtimerendering.com/s2015/AlexEvans_SIGGRAPH-2015-sml.pdf | the whole approach |

Design is original: no character, logo, name or likeness from any game is copied. "Chunky
hand-painted stylised fantasy" is the idiom (exaggerated primary forms, generous fillets, flat
vertex colour with baked AO), not a specific source.

## Known gaps
Hair locks are tapered cone pairs (no strand grooves inside a lock); the beard's clump grooves are
two shallow cuts; mantle colour edges are soft (vertex colour at 5 mm cells); no ear detail.
