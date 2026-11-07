# Goblin bust — original stylised design

## Identity
A sly, scrawny goblin tinker, read from the 3/4 view by: **huge leaf-shaped ears** wider than its
shoulders, a **long humped nose**, a **wide toothy grin**, **big amber eyes** under a light brow,
a few **wiry hair tufts** and warts on a bald dome, and a **draped hood** on narrow shoulders.

## Design spec (head units: 1 = chin to crown = 0.19 m, ≈ 0.8 × human)
| Feature | Value (units) | Metres | Note |
|---|---|---|---|
| chin → crown | 1.00 | 0.190 | the `height` param |
| overall bust L × W × H | — | 0.236 × 0.322 × 0.366 | `real`, ±5 %; width is the ears |
| cranium width / depth / above eye line | 0.66 / 0.84 / 0.50 | 0.125 / 0.160 / 0.095 | |
| eyeball radius / spacing | 0.072 / 0.15 | 0.014 / pupils 0.057 apart | eyes 1.4 × human relative size |
| ears length / width / sweep / lift | 0.62 / 0.30 / 22° / 18° | 0.118 long | two tapered blades + hollow |
| nose length / bridge / hook | 0.20 / 0.12 / 0.07 | tip ≈ 0.05 past the face | cone from between the eyes |
| mouth half-width / grin | 0.20 / 0.75 | | corners lifted, teeth rows |
| neck radius / shoulders | 0.20 / 0.75 | 0.038 / 0.143 | |

## Palette (sRGB)
| Role | Hex |
|---|---|
| skin / shade / lips | `#9cb84a` / `#6a8a2c` / `#7a8e36` |
| eyes: sclera / iris | `#f0e6a0` / `#e0a020` |
| teeth / mouth | `#e8dcae` / `#3a1010` |
| hair tufts | `#3a3024` |
| hood cloth / patch + cord leather | `#6a4a7a` / `#5a3a22` |

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
Teeth sit deep in the grin and read only up close; no earrings or wrinkles; hood is a smooth roll
with one patch.
