# Atlantic bluefin tuna (Thunnus thynnus): 2 m fork length

## Identity
Fusiform and deep, the deepest point near the second dorsal, on a pencil-thin peduncle with a large median
keel and two small keels. Metallic blue-black back over a silver flank with pale broken bars, short
pectorals, tall falcate second dorsal and anal fins, rows of yellow finlets edged black, a crescent tail.

Tier: code-built surface on a body-plan skeleton.

## Specs
Percentages of fork length (FL) from four South African *T. t. thynnus* of 2.15 to 2.50 m, close to this size.

| Dimension | Source value | Used here | Source |
|---|---|---|---|
| fork length | common length about 200 cm FL | 2.00 m | [FishBase](https://fishbase.se/summary/147) |
| head | 23 to 26 % | 24.5 % | [Talbot and Penrith, FAO synopsis 62](https://www.fao.org/4/ap889e/ap889e.pdf), p. 636 |
| body depth | 24 to 28 % | 26 % (0.52 m) | same |
| pectoral | 16 to 19 %, not reaching the second dorsal | 17.5 % | same |
| first dorsal height | 11 % | 11 % | same |
| second dorsal height | 14 to 17 % | 15.5 % | same |
| anal height | 13 to 16 % | 14.5 % | same |
| snout to first dorsal | 27 to 28 % | 27.5 % | same |
| snout to second dorsal | 50 to 60 % | 50 % | same |
| snout to anal | 52 to 57 % | 54.5 % | same |
| snout to pelvic | 28 to 30 % | 29 % | same |
| eye | 2.4 % | 2.6 % | same |
| first dorsal spines | 12 to 14 | 13 | [FishBase](https://fishbase.se/summary/147) |
| finlets dusky yellow edged black, median keel black | colour | as stated | same |

**Estimated, not sourced:** body width (84 % of depth, from photos), finlet counts 9 dorsal and 8 anal (the
FAO synopsis gives 7 to 9 free rays for the sister form, and no opened source gives this subspecies'
count), caudal span about 33 % FL (read off the side-view illustration), total length 2.14 m.

The metallic look stays in the one trim-sheet material: the body uses a `metalness: 1` strip and the vertex
colour sets the reflectance, so no separate finish or draw is needed.

## Motion
| Quantity | Value | Source |
|---|---|---|
| wave, stride, tail | preset `tuna`: 1.17 L, 0.7, 0.18 L | [DS21], [SR23] via the swim research doc |
| head term | 0.035 L, a design value inside the all-species 0.02 to 0.05 quartiles | [DS21] |
| cruise tail beat | the size band gives 0.92 Hz; tagged giants show modes of 0.80 and 0.95 Hz | [Gleiss et al. 2019](https://doi.org/10.1098/rsos.190203) |
| burst | 9 m/s ÷ L | [SR23] |

Measured on the baked clips (L = 2.18 m): cruise 0.92 Hz, 1.40 m/s, Strouhal 0.257, stride 0.70, tail 0.18 L,
head ÷ tail 0.33, wavelength 1.01 L, slip 0.69. Burst 4.13 Hz, 6.3 m/s. The tagged fish were larger (229 to
251 cm curved FL), so their frequencies are a check, not a target.

Lobe bones run rearward through the fin rather than out to the tips: raked bones have almost no lever on
the beat and pushed head ÷ tail to 0.43, over the 0.35 limit.

## Photos (by view)
| View | URL | Notes |
|---|---|---|
| side illustration | https://commons.wikimedia.org/wiki/File:Bluefin-big.jpg | planform, colour zones, finlets |
| tagging photo | https://commons.wikimedia.org/wiki/File:Tagging_of_bluefin_tuna.jpg | not reviewed |
| market specimen | https://commons.wikimedia.org/wiki/File:Tuna_on_Marseille_fish_market.jpg | linked from the species article, not reviewed |
| small drawing | https://commons.wikimedia.org/wiki/File:Thunnus_thynnus.png | not reviewed |

## Parts the engine needs
Parts `body`, `fin_dorsal_1`, `fin_dorsal_2`, `fin_anal`, `fins_small`, `pectoral_fin_l/r`, `caudal_fin`, all
skinned, one draw. Bones `spine_0..15`, `caudal_upper_*`, `caudal_lower_*`, `pectoral_l/r_*`. Clips `cruise`,
`burst`, `turn_l/r`, `cstart_l/r`, `idle`.

## Open questions
- No opened source gives this species' body width, caudal span or finlet counts: they are the estimates
  above.
- The illustration's first dorsal is yellow; FishBase and the FAO text describe it as dusky. Kept dusky with
  a yellow cast.

## Surface, wear and LOD (2026-11 quality pass)
| Feature | How | Why |
|---|---|---|
| one strip, four bands | `tuna_skin` (`material.ts`): corselet (metal, 0.34), flank (metal, 0.2), fin membrane (0.42), frayed margin (0.68); replaces `tuna_metal` and `tuna_fin`, freeing a custom sheet row | the flank read as flat grey paint |
| colour | an iridescent violet-blue band between back and silver, stronger pale bars and dots on the lower flank, a faint lateral line, a dark caudal keel | photos above |
| corselet | the thick-scaled band round the pectoral base, duller than the polished flank | a signature of *Thunnus* |
| fin rays | second dorsal, anal and caudal carry 12 to 16 low ray ridges up close (each face swells by a share of its own thickness, fading toward the tip) | flat plates |
| wear | frayed nicks along the median fins' trailing edges (pale, on the rough band), five seeded net scratches on the blue flank | pristine |
| gill cover | the operculum groove twice as deep | shallow line |
| pectoral | 33 cm (16.5 % FL), inside the FAO 16 to 19 % and shorter than before | read long against photos |
| LOD | LOD1 7 k (was 4 k): softer switch from 39 k; LOD2 9 sides and one flat yellow finlet strip a side | finlets vanished, body faceted |
