# Goblin bust — original stylised design

## Identity
A sly, scrawny goblin tinker, read from the 3/4 view by: **huge leaf-shaped ears** wider than its
shoulders, a **long hooked nose** (one form drawn out to a drooping point, nostrils tucked at its
base), a **wide grin** of small pointed teeth with the cheeks bunched up beside it, **big amber eyes
under heavy upper lids**, a **worried creased brow**, a **sharp little chin**, **pale wispy hair**
straggling off a warty dome, a **skinny corded neck** on **narrow bony shoulders** in a linen shirt,
leather vest, strap and buckle, a **knotted scarf** and a **hood worn down** on the back — cut as a
collectible bust on a turned plinth.

## Design spec (head units: 1 = chin to crown = 0.19 m, ≈ 0.8 × human)
| Feature | Value (units) | Metres | Note |
|---|---|---|---|
| chin → crown | 1.00 | 0.190 | the `height` param |
| overall bust L × W × H | — | 0.227 × 0.342 × 0.372 | `real`, ±5 %; width is the ears |
| cranium width / depth / above eye line | 0.66 / 0.84 / 0.50 | 0.125 / 0.160 / 0.095 | |
| eyeball radius / spacing / upper lid | 0.08 / 0.155 / 30° | 0.015 / pupils 0.059 apart | eyes 1.5 × human relative size, heavy lids |
| ears length / width / sweep / lift | 0.66 / 0.30 / 24° / 6° | 0.125 long | two tapered blades + hollow, near level |
| nose length / bridge / hook / tip | 0.20 / 0.13 / 0.065 / 0.046 | | bridge cone + hump + tip + drooping point cone |
| mouth half-width / grin | 0.21 / 0.80 | | crescent cut, 3 + 3 pointed teeth a side, tongue |
| forehead creases / chin | 3 / 0.72 | | creases painted (thinner than a cell) |
| neck radius / shoulders / mass | 0.14 / 0.52 / 0 | 0.027 / 0.099 | bony: clavicles under the shirt |

## Palette (sRGB)
| Role | Hex |
|---|---|
| skin / shade / lips | `#9cb84a` / `#6a8a2c` / `#7a8e36` |
| eyes: sclera / iris | `#f0e6a0` / `#e0a020` |
| teeth / mouth | `#e8dcae` / `#3a1010` |
| wispy hair | `#c8c0b0` |
| linen shirt / vest + strap (×0.65) / scarf / hood / buckle | `#b8a47c` / `#6b4428` / `#9a3a24` / `#4e5e3a` / `#a88a4a` |
| plinth / cut faces | `#6f6c6c` (linear 0.16, 0.15, 0.15) / ×1.3 |

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
Sculpt cell = 2 % / 4.5 % / 14 % of head height (bust 1.6 ×). LOD0/1 bake vertex AO across all
parts (16/10 rays); every LOD carries the painted tone. LOD1/2 carve the grin as a plain wide line
(no teeth or tongue: a crescent that thin folds over at coarse cells); LOD2 drops warts, hair and
the AO bake, floors ear thickness and the nose's radii at about a cell, and makes the plinth one
drum so the bust stays on the ground.

## References (stylised anatomy, not likeness)
| Topic | Link | Used for |
|---|---|---|
| Loomis head: eye line at half height, brow/nose/chin thirds | https://finearttutorials.com/guide/loomis-method/ | human eye line 0.5, nose base 0.32, mouth 0.22 |
| Proportions of the head (ears between brow and nose base, head ≈ 5 eyes wide) | https://artyfactory.com/portraits/pencil-portraits/proportions-of-a-head.html | ear placement, eye size vs head width |
| Primary → secondary → tertiary forms (block brow/cheek/jaw first, then cut lids and folds) | https://www.creativebloq.com/how-to/how-to-sculpt-and-pose-a-cartoon-head-in-zbrush | the edit order in `head-face.ts` |
| Goblin from a base head: enlarge the top of the head, elongate the ears, broaden their base | https://create.roblox.com/docs/art/characters/creating/sculpting | cranium and ear roots |
| Goblin sculpt breakdown: big nose, cracked grin, ears, sparse hair | https://www.foxrenderfarm.com/share/how-to-create-goblin-in-zbrush | feature priorities |
| Goblin features: large pointed ears, mischievous grin with visible teeth | https://sketchok.com/other/monsters-and-fantasy-creatures/how-to-draw-a-goblin/ | grin + teeth |
| Orc: widen head and jawline to break human proportion | https://www.creativebloq.com/3d/how-create-orc-zbrush-61411834 | orc jaw width 0.37 vs human 0.22 |
| Stylised orc head study (silhouette, form language) | https://blenderartists.org/t/orc-head-study-stylized-characters/1655542 | massing check |
| Stylised hair: large clumps first, hairline → crown, one primary flow direction | https://gamesartist.co.uk/curly-hair-ls/ · https://www.cgchannel.com/2023/03/tutorial-creating-stylized-hairstyles-using-zbrush | `swept` locks in head-hair.ts |
| Dreams (Media Molecule, Evans, SIGGRAPH 2015): sculptures as ordered SDF edits + smooth-min | https://www.mediamolecule.com/blog/article/siggraph_2015 · slides https://advances.realtimerendering.com/s2015/AlexEvans_SIGGRAPH-2015-sml.pdf | the whole approach |

Design is original: no character, logo, name or likeness from any game is copied. "Chunky
hand-painted stylised fantasy" is the idiom (exaggerated primary forms, generous fillets, flat
vertex colour with baked AO), not a specific source.

## Known gaps
Teeth are small at this scale and read best in the 3/4 view; the wisps are cone pairs, not hair
cards; the jaw part's seam shows as a faint line at the mouth corners up close; garment edges are
vertex-colour soft and the strap/buckle are simple shells.
