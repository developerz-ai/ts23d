# White shark (Carcharodon carcharias): adult female, 4.5 m

## Identity
A mature-size female (females mature at 4.6 to 4.9 m, males at 3.4 to 4.0 m), so no claspers. What makes
it this animal: conical snout over an underslung crescent mouth with triangular teeth, five long gill
slits that do not wrap the head, a small black eye, a stocky torpedo body, a sharp ragged line between
grey back and white belly, a tall triangular first dorsal, long swept pectorals with black underside
tips, and a near-symmetric crescent tail on a single caudal keel.

Tier: code-built surface on a body-plan skeleton. The swim system is the point of this asset.

## Specs
"Natural TL" is total length with the tail in its natural position. Lausanne percentages are of depressed
TL (583 cm) and are converted with TLn / TOT = 565 / 583 = 0.969.

| Dimension | Value | Used here (m) | Source | Status |
|---|---|---|---|---|
| natural total length | 4.5 m (brief; within adult range) | 4.50 | [Wikipedia](https://en.wikipedia.org/wiki/Great_white_shark) | sourced |
| body width (frontal span) | 0.197 TL - 4.84 cm | 0.838 | [DiGiacomo et al. 2026](https://doi.org/10.1371/journal.pone.0348174), Table 2 | sourced, full text |
| widest region | 35 % TL | t = 0.35 | same | sourced |
| girth | 0.619 TL - 15.21 cm = 263 cm | sets depth (about 0.88) | same | sourced; the authors note it is the highest published girth relationship |
| first dorsal height | 10.3 % depressed TL | 0.478 | De Maddalena et al. 2003, Lausanne specimen | **search excerpt only** |
| first dorsal length | 10.6 % | 0.492 | same | **search excerpt only** |
| first dorsal base | 8.4 % | 0.39 | same | **search excerpt only** |
| pre-first-dorsal length | 37.7 % | t = 0.389 | same | **search excerpt only** |
| pectoral anterior margin | 18.0 % | 0.836 | same | **search excerpt only** |
| dorsal caudal margin | 21.4 % | 0.994 | same | **search excerpt only** |
| dorsal origin over pectoral inner margin | qualitative | tested | [Florida Museum](https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/white-shark/) | sourced |
| Lausanne specimen size | 565 cm TLn, 589 cm TOT | conversion | [De Maddalena 2006 catalogue](https://publikace.nm.cz/en/file/39e05b0c91119b5d713179f5aee0777b/15231/175-2006-DeMaddalena.pdf) | sourced |
| caudal aspect ratio | mean 3.33 | not enforced | [Lingham-Soliar 2005](https://link.springer.com/article/10.1007/s00114-005-0614-4) | abstract; not measured on the model |

**Estimated from the photos below (no published number opened):** mouth arc position and width, eye and
gill-slit positions, lower caudal lobe, second dorsal, anal and pelvic fins, tooth sizes (largest 5 cm;
the species reaches 7.5 cm), head length 24 % of L for the bite.

## Surface detail (LOD0 unless noted)
| Detail | Basis |
|---|---|
| Ampullae of Lorenzini: 130 dark pores on the snout | the organ is real; count and placement are design |
| Nostrils with a skin flap, under the snout | position read from photos |
| Dark lip line and corner furrow (LOD0 and LOD1) | photos |
| Healed scars, 14 scores and rakes on the rear flank | **design**: pale marks show in the photos, the layout is seeded, not copied |
| Cloudy mottling and fine freckle on the back (LOD0 and LOD1) | **design** |
| Mouth resting 6° open, upper teeth below the lip | photos show teeth with the mouth at rest; the angle is design |
| Gum band and palate behind it, seen when the jaw is thrown forward | design |

## Motion
| Quantity | Value | Source |
|---|---|---|
| cruise tail beat | 0.43 Hz (0.43 ± 0.07 measured) | [DG25] DiGiacomo, Abraham and Block 2025, snippet |
| body wave, stride, tail | preset `shark`: 0.93 L, 0.7 L per beat, 0.2 L | [DS21], [SR23] in `docs/research/swim-and-tentacle-animation.md` |
| burst | 9 m/s ÷ L, the size band | [SR23] |
| bite length | 0.99 s at 3.5 m, scaled with length | [TM], secondary summary |
| upper jaw protrusion | 18 % of head length, lemon shark, during closure | [WM98], [M97]; not measured on a white shark |

Measured on the baked clips (L = 4.88 m along spine and upper lobe): cruise 0.43 Hz, 1.47 m/s, Strouhal
0.286, stride 0.70, tail 0.20 L, head ÷ tail 0.22, wavelength 0.84 L, slip 0.83. Burst 1.84 Hz, 6.3 m/s.
The swim L is longer than TL because the tail lobe is measured along its raked length.

## Photos (by view)
| View | URL | Notes |
|---|---|---|
| front 3/4, mouth and teeth | https://commons.wikimedia.org/wiki/File:White_shark.jpg | snout, lower teeth, shade line |
| side 3/4 from behind the head | https://commons.wikimedia.org/wiki/File:White_shark_with_PSAT.jpg | gill slits, ragged line, pectoral, tail |
| dorsal fin from above | https://commons.wikimedia.org/wiki/File:Great_White_Shark_Near_The_Boat.jpg | first dorsal shape |
| skeleton | https://commons.wikimedia.org/wiki/File:Carcharodon_carcharias_skeleton.jpg | linked from the species article, not reviewed |

## Parts the engine needs
The part list below is unchanged by the detail above: it merges into `body` and `jaw_*`.

Part `body` plus `jaw_lower`, `jaw_upper`, `dorsal_fin`, `pectoral_fin_l/r`, `caudal_fin`, all skinned, one
draw. Bones: `spine_0..15` (0 at the snout), `caudal_upper_*`, `caudal_lower_*`, `dorsal_*`, `pectoral_l/r_*`,
`jaw_lower_0`, `jaw_upper_0`. Clips: `cruise`, `burst`, `turn_l/r`, `cstart_l/r`, `idle`, `bite`.

## Open questions
- The Lausanne table could not be opened: the numbers come from a search excerpt of it, and a preserved
  or cast specimen may differ from a live animal. Replace them if the paper becomes readable.
- The excerpt implies 583 cm depressed TL, the 2006 catalogue lists 589 cm for the same cast. 583 was used
  because the percentages were computed on it.
- Gill rates and gape angle have no opened source; the 35° gape is the kind's design value.

## Surface, wear and LOD (2026-11 quality pass)
| Feature | How | Why |
|---|---|---|
| skin | `shark_skin` is a texture graph now: a head-to-tail denticle grain (micro-normal) and a broad roughness drift 0.5 to 0.68 for the patchy wet sheen | one uniform satin |
| eye | the black pupil, a thin pale ring round it, a blue-grey iris, and a skin-grey lid rim | a glossy black ball |
| snout | about 10 % blunter: wider and higher over the first 9 % of the length (a second pass on top of the first) | still read a touch pointed |
| pectorals | root half-thickness 8.4 cm (about 17 cm through the root) tapering fast to a thin edge; the upper face darkens strongly at the tip and along the trailing edge | paper-thin, no dark edges |
| caudal | lower lobe 0.9 m (was 0.82), nearly as long as the upper: a lunate tail (design value) | |
| keel, lateral line | keel 8.5 cm proud and dark; a pale lateral line from the gills to the keel | missing |
| fin edges | dorsal and caudal trailing margins dark over their last third | grey to the edge |
| wear | a bitten notch in the first dorsal's trailing edge, healed dark; parasitic copepods clustered on that fin (LOD0), 3 to 4 cm long; a healed bite on the camera-side pectoral (`biteAt`: a crescent of pale tooth scars); the healed scars as before | |
| LOD | LOD1 12.7 k (was 7 k); LOD2 has eight sides so one column bends onto the ragged colour line | the boundary went straight far away |
