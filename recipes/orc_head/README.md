# Orc warrior bust — original stylised design

## Identity
A brutish orc warlord, read from the 3/4 view by: **massive underbitten jaw with lower tusks**
curving out past the upper lip, **heavy scowling brow** over small deep-set ember eyes, **flat
broad nose**, **pointed ears** swept back, a **top-knot** on a low skull, and **spiked layered
pauldrons + fur mantle** on huge trapezius.

## Design spec (head units: 1 = chin to crown = 0.30 m, ≈ 1.3 × human)
| Feature | Value (units) | Metres | Note |
|---|---|---|---|
| chin → crown | 1.00 | 0.300 | the `height` param |
| overall bust L × W × H | — | 0.338 × 0.742 × 0.583 | `real`, ±5 % |
| cranium width / depth / above eye line | 0.70 / 0.80 / 0.34 | 0.21 / 0.24 / 0.10 | low, sloped dome |
| eye line | 0.56 | — | higher than human: the jaw is the mass |
| eyeball radius / spacing | 0.050 / 0.155 | 0.015 / pupils 0.093 apart | `measures` gate, ±2 % |
| jaw half-width at angle | 0.37 | 0.111 | human 0.22 |
| muzzle (prognathism) / underbite / chin drop | 0.10 / 0.07 / 0.10 | | |
| tusks length / base radius | 0.27 / 0.05 | 0.081 / 0.015 | 3 cone segments, flared |
| neck radius | 0.32 | 0.096 | |
| shoulders (half-span) | 1.05 | 0.315 | arms cut flat (classic bust) |

## Palette (sRGB)
| Role | Hex |
|---|---|
| skin / shade / lips | `#5f8b3a` / `#3c5c24` / `#4f6f30` |
| eyes: sclera / iris (+ emissive glow `#ff7a1a` × 2.5) | `#8a5a1a` / `#ffb030` |
| tusks + bone spikes | `#e2d6b0` |
| hair (top-knot) / fur mantle (strands alternate ×0.7) | `#1c1714` / `#5e4a34` |
| war paint (cheek claw marks, crest stripe, chin stripes) | `#8a1c12` |
| pauldron iron (lames ×1/0.88/0.76, rims ×0.55, rivets ×1.4) / leather baldric | `#6e6a62` / `#5a3a22` |

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
Pauldron lames still read soft (no hammered dents or edge wear); fur strands are cones, not
noise-broken clumps; no skin pores/wrinkle noise; the top-knot is a plain bun.
