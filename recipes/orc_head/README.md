# Orc warrior bust — original stylised design

## Identity
A brutish orc warlord, read from the 3/4 view by: a **hunched brute silhouette** (trapezius sloping
from behind the ears to the shoulders, the neck nearly as wide as the head), a **massive
underbitten jaw** with **lower tusks rising outside the upper lip**, a **heavy brow shelf** (a
flattened bar with a glabella knot, scowling down at the centre) shadowing **small deep-set ember
eyes**, a **flat broad nose**, **cheekbone ridges** running back to swept **pointed ears**, a **bound
warrior's knot** falling to the nape, war paint, **pectorals and deltoids** on the bare chest, and
**spiked plate pauldrons** (a domed cap and a shingled lame, hollow shells with worn bright rims)
over a **fur mantle** — cut as a collectible bust on a turned plinth.

## Design spec (head units: 1 = chin to crown = 0.30 m, ≈ 1.3 × human)
| Feature | Value (units) | Metres | Note |
|---|---|---|---|
| chin → crown | 1.00 | 0.300 | the `height` param |
| overall bust L × W × H | — | 0.405 × 0.660 × 0.587 | `real`, ±5 %; length includes the knot's tail |
| cranium width / depth / above eye line | 0.70 / 0.74 / 0.31 | 0.21 / 0.22 / 0.09 | low, sloped dome: the face is the mass |
| eye line | 0.56 | — | higher than human: the jaw is the mass |
| eyeball radius / spacing | 0.054 / 0.155 | 0.016 / pupils 0.093 apart | `measures` gate, ±2 % |
| brow ridge / overhang / scowl | 0.075 / 0.06 / 0.04 | | a shelf, not two bumps |
| jaw half-width at angle / chin | 0.40 / 1.3 | 0.120 | human 0.22; square rounded-box chin |
| muzzle (prognathism) / underbite / chin drop | 0.10 / 0.10 / 0.10 | | lower lip thickens with the underbite |
| tusks length / base radius | 0.22 / 0.055 | 0.066 / 0.017 | 3 cone segments from the lower lip, flared |
| neck radius | 0.38 | 0.114 | |
| shoulders (half-span) / mass | 1.00 / 1 | 0.300 | `bust.mass` 1 = brute: torso lifted (hunch), thick traps |
| plinth | 0.17 + hunch | ≈ 0.08 | disc + socle; cut faces painted plinth stone |

## Palette (sRGB)
| Role | Hex |
|---|---|
| skin / shade / lips | `#5c8034` / `#33501e` / `#4f6f30` (painted tone: crevices darker, tops warmer) |
| eyes: sclera / iris (+ emissive glow `#ff7a1a` × 2.5) | `#8a5a1a` / `#ffb030` |
| tusks + bone spikes | `#e2d6b0` |
| hair (warrior's knot) / fur mantle (strands alternate ×0.72) | `#231a14` / `#5e4a34` |
| war paint (cheek claw marks, crest stripe, chin stripes) | `#8a1c12` |
| pauldron iron (cap ×1, lame ×0.85, worn rims ×1.3, rivets ×1.35, crest ×0.75) / leather baldric | `#55524d` / `#5a3a22` |
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
parts (16/10 rays); every LOD carries the painted tone (cavity, warm top, cool under). LOD1/2 drop
the teeth and tongue; LOD2 drops warts, wiry tufts and the AO bake, floors ear/tusk/nose radii at
about a cell, makes the pauldron plates solid and the plinth one drum so nothing opens or floats.

## References (stylised anatomy, not likeness)
| Topic | Link | Used for |
|---|---|---|
| Loomis head: eye line at half height, brow/nose/chin thirds | https://finearttutorials.com/guide/loomis-method/ | human eye line 0.5, nose base 0.32, mouth 0.22 |
| Proportions of the head (ears between brow and nose base, head ≈ 5 eyes wide) | https://artyfactory.com/portraits/pencil-portraits/proportions-of-a-head.html | ear placement, eye size vs head width |
| Primary → secondary → tertiary forms (block brow/cheek/jaw first, then cut lids and folds) | https://www.creativebloq.com/how-to/how-to-sculpt-and-pose-a-cartoon-head-in-zbrush | the edit order in `head-face.ts` |
| Orc: widen head and jawline to break human proportion; sculpt bony forms (cheekbones) early | https://www.creativebloq.com/3d/how-create-orc-zbrush-61411834 | orc jaw width 0.40 vs human 0.22, zygomatic ridge |
| Stylised bust method: primary → secondary → tertiary shapes | https://cgzen.gumroad.com/l/stylized-bust | torso masses before gear |
| Stylised orc head study (silhouette, form language) | https://blenderartists.org/t/orc-head-study-stylized-characters/1655542 | massing check |
| Stylised hair: large clumps first, hairline → crown, one primary flow direction | https://gamesartist.co.uk/curly-hair-ls/ · https://www.cgchannel.com/2023/03/tutorial-creating-stylized-hairstyles-using-zbrush | `swept` locks in head-hair.ts |
| Dreams (Media Molecule, Evans, SIGGRAPH 2015): sculptures as ordered SDF edits + smooth-min | https://www.mediamolecule.com/blog/article/siggraph_2015 · slides https://advances.realtimerendering.com/s2015/AlexEvans_SIGGRAPH-2015-sml.pdf | the whole approach |

Design is original: no character, logo, name or likeness from any game is copied. "Chunky
hand-painted stylised fantasy" is the idiom (exaggerated primary forms, generous fillets, flat
vertex colour with baked AO), not a specific source.

## Known gaps
Pauldron plates are smooth shells (no hammered dents or scratches); fur strands are cones, not
noise-broken clumps; no skin pores or wrinkle noise; the jaw part's seam still shows as a faint
line round the chin up close; the bust's U-cut leaves the belly reading slightly pear-shaped from
dead front.
