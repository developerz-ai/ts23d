# King cobra (Ophiophagus hannah): 3.5 m, alert with the hood spread

## Identity
The longest venomous snake. What makes it this animal: the front third raised, a long narrow hood with cream
ventral scutes, a blunt head with the pair of huge occipital shields behind the parietals, 15 smooth scale
rows at midbody, pale chevron bands pointing at the head on a dark olive body that goes nearly black toward
the tail, and a forked tongue.

Taxonomy: the 2024 revision splits the complex into four species. This asset follows *O. hannah* in the wide
sense asked for; the banded pattern matches the restricted *O. hannah*, and the head proportions come from
the best-preserved large type available (see below).

## Specs
| Dimension | Source value | Used here | Source |
|---|---|---|---|
| total length | adults 3.18 to 4 m | 3.50 m along the body | [Wikipedia](https://en.wikipedia.org/wiki/King_cobra) |
| tail share | neotype SVL 2085, tail 462 mm: 18.1 % of total | 0.635 m | [Das et al. 2024](https://doi.org/10.5852/ejt.2024.961.2681) |
| head length, width, depth | 72, 52.5, 30 mm at 3005 mm total (*O. kaalinga* holotype) | scaled ×1.165: 84, 61, 35 mm; the skin is 10 % wider (`LIVE_HEAD`: a fixed specimen reads narrow against the live hood in the front photos, an estimate) | same |
| midbody width, preserved | 43.2 mm at 3005 mm: 50 mm at this length | not used directly | same |
| midbody width, live | **estimate**: about 0.9 head widths in front photos | 55 mm | [photo](https://commons.wikimedia.org/wiki/File:King-Cobra.jpg) |
| section | triangular, vertebral row enlarged | modelled | same |
| eye | 8 mm at 3005 mm | 10 mm | same |
| dorsal rows | 17 to 19 at neck, 15 midbody | 15 rows of diamonds | same |
| ventrals | 240 to 241 in the types | 241 scutes | same |
| body bands | 27 to 48 pale bands | 40 | same |
| tail and rear quarter | nearly black | darkens from 55 % of length | same |
| raised part | "a third of its body" | 1.17 m of arc, head 0.75 m up in a curved stance | popular sources via [search](https://www.desertusa.com/animals/king-cobra.html); **no measured study opened** |

**Estimated, not sourced:** hood width 2.05 × head width (125 mm) at full spread, read off two front photos (about 1.5 on
one, where the head is nearer the camera and the hood half spread, and about 1.7 to 2 on [the other](https://commons.wikimedia.org/wiki/File:Ophiophagus_hannah2.jpg)).
The hood's length (about 0.35 m) and profile come from the same photos. No published hood width was found;
[Young and Kardong 2010](https://doi.org/10.1242/jeb.034447) could not be opened. Scale length, tongue length
and every colour value are read from photos.

**Staging (design):** the rest pose is a showcase stance. The hood faces 35° to the side, square to the 3/4
camera, and the rear two thirds lie in a pile of two turns: a tight spiral widening toward the tail, each
turn 3 cm inside the next and its centre drifting up to 4 cm back from the lens as it climbs, so the
smaller top turn rides on the far shoulder of the ground ring under the raised forebody and the pile reads
as a heap, not a hose ring. The pile's heights are settled, not drawn (`settleHeights` in `shape.ts`): every
section rests on the ground or on the turn under it, so no turn hovers. The overall box (0.45 × 0.45 ×
0.78 m) is that pose; the 3.5 m is held by the recipe's test along the body. The hero camera sits at 32°
elevation (`hero` in the recipe) so the top turn and its wear face the lens. `rear` lays the front out
with three links of curl over the pile (a fourth would drape the neck over the top turn), and the rising
front keeps the laid track's drape where it still runs flat.

## Motion
| Clip | How | Source |
|---|---|---|
| `slither` | `snakeClips` measured wave: 0.4 L wavelength, 0.1 L amplitude, 0.22 L per cycle | [J20], [H09] via the swim research doc |
| `idle` | the reared stance, starting and looping on the rest pose: gentle sway, hood breathing, tongue | design |
| `hood_up` | the same stance, more alert: wider sway and tongue flicks | design |
| `idle_ground` | resting flat, 8 s loop: the rear two thirds in a loose coil round the rest pile's centre (tail inside, 0.22 m inner radius, turns 0.1 m apart), the front third in loose S-bends (0.75 m wavelength, 4.5 cm half-swing), hood folded; two slow breaths (the bends swell 6 %), then the head lifts 2 cm and turns about 9° with a tongue flick. Every joint stays within 0.85 m of the rest pile's centre | design: no measured resting posture was found |
| `rear` | starts from the pile with the front third laid on the ground (draped over the pile turns it crosses), hood folded. The raised length grows from the head (`REAR.rise`); everything behind it stays where it lay and the pile never moves; the raised part keeps the laid track in plan and pitches up (`pitchAt` in `ground.ts`), then turns into the stance (`REAR.settle`), ending exactly on it with the hood spread | design |

Undulation rate 1 Hz is the kind's design value: no opened source gives one for a snake this size. `sidewind`
is not shipped: it misses its foot-lock target (about 4.1 mm per frame against 1 mm).

The rest pose is the raised stance, so `snakeClips` runs on a straight flat copy of the spine for `slither`
and each key is re-solved on the real skeleton from joint targets. `slither` is a travelling gait laid out
along X through the origin (head at x = +1.75 m on its first key), so it starts away from the rest
footprint like any root-motion cycle; `idle_ground` (ground.ts) is the resting pose near it. `idle_ground`
is not the start of `rear`: `rear` rises from the pile. Design joint limits held by the tests: the head on
the neck bends under 75°, every other link under 60° (the rest pose's tightest is 55°), and no two parts of
the body 0.35 m apart along it come closer than their sections allow. The folded hood swings its ribs back
along the neck (they used to fold up over the back, which read as lumps on the ground clips). The root bone is at the head, so clips that keep the pile
still pin its first joint and let the head absorb the small length error. Turns of the pile touch, so each
vertex is weighted only to spine bones next to the section it lies on (`bodyArc` in `skin.ts`: nearest
centreline sample in that section's own radii, among those its normal faces away from; a scale plate or
scute is linked as one piece).

## Photos (by view)
| View | URL | Notes |
|---|---|---|
| hood from the front | https://commons.wikimedia.org/wiki/File:King-Cobra.jpg | hood width, throat bands, edge patches |
| hood close up | https://commons.wikimedia.org/wiki/File:Ophiophagus_hannah2.jpg | hood width against head, broad scutes |
| hood and coils 3/4 | https://commons.wikimedia.org/wiki/File:King-Cobra2.jpg | scales, stance |
| head scalation plate | https://commons.wikimedia.org/wiki/File:Ophiophagus_scalation.png | shield layout |
| juvenile neck pattern | https://commons.wikimedia.org/wiki/File:Baby_king_cobra_neck_pattern.JPG | not reviewed |

## Parts the engine needs
One skinned part `body`, one draw. Bones `spine_0..31` (0 at the head), `hood_rib_0..3_l/r_0`, `tongue_0..2`.

## Open questions
- The neotype's head (46.3 mm at 2547 mm total) is much smaller than the *O. kaalinga* holotype's. The larger
  type was used because the neotype is an old specimen and the live-animal photos agree with it better.
- Preserved widths are likely under a live snake's.
- The real snake has a mobile jaw; this asset has none, so there is no gape or strike clip.

## Surface and wear
| Feature | How | Why |
|---|---|---|
| glossy dorsal scales | one strip (`material.ts`): each scale samples a rim-to-crown ramp, roughness 0.38 at the rim to 0.12 on the crown | live snake scales are polished keratin; a single roughness read as paint |
| pale crossbands | chevrons pointing at the head, one straight arm per side swept back 0.45 of a pitch (at 0.6 the near turn's bands smeared into its speckle), fading by 55 % toward the tail, 1.8 cm wide on the ridge widening to 3.2 cm down the flank; each scale's corners carry the pattern at their own point, so band edges run clean across the scales | photos above; the old W-shaped zigzag read as a viper, one colour per scale read serrated |
| pre-shed patch | a ragged patch on the near side of the top turn, about 0.2 m along the body and down both flanks: milky, papery grey with the pattern ghosting through (45 % of it: at 0.3 m and 18 % the patch hid the near turn's bands), a dark torn rim round it, dull row of the strip, scales a hair proud | the old skin clouds over before a shed |
| healed scar | two diagonal bands 5 cm wide crossing the top turn at a slant in the hero's view, flat pale scale tissue | a prey snake's bite; king cobras eat snakes |
| dust | dry loam on the turns lying on the ground (`dustAt`): the bottom turn's flanks and belly coated, its back lightly, patchy; on every LOD; the belly greys under the pile | it lies on dirt; the cream belly showed as a pale sliver under the coil |
| eyes | 13.6 mm eyeball under a glossy brille | the eye read as a dot (12.8 mm still read small against the hood) |
| scuffed tail scutes | greyed, rougher free edges from 2.6 m to the tip | dragged over rock |
| far LOD | LOD2 takes the pattern's average over a band pitch (and the collar's over 12 cm), at 0.3 of it to match the LOD0 coil's value (its scales' shadowed sides and dark skin); every third link ring from the neck to the tail's last tenth is painted pale, a few broad crossbands (rings sit 11 cm apart, too coarse for the 7 cm pitch); on the pile the belly vertex takes the dorsal colour (lit across the ring, it washed the coil's lower half tan); the far coil takes 0.2 of the dust (`FAR_DUST`; at 0.9 the whole far coil went pale tan, D480); the dark throat collar stays as a band on the neck, and on the raised neck the one belly vertex is pulled a third toward the dorsal colour (pure cream there washed the whole neck pale); only the broad dust survives of the story marks | sampling single bands on six-sided rings made black and cream blocks; the shed patch turned whole segments blue-grey |
| girth | swells to 1.1 body widths at 1.5 to 1.9 m, tapers steadily to the vent and tail | heavy mid-body in side photos |
