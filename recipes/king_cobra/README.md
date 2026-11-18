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
| head length, width, depth | 72, 52.5, 30 mm at 3005 mm total (*O. kaalinga* holotype) | scaled ×1.165: 84, 61, 35 mm | same |
| midbody width, preserved | 43.2 mm at 3005 mm: 50 mm at this length | not used directly | same |
| midbody width, live | **estimate**: about 0.9 head widths in front photos | 55 mm | [photo](https://commons.wikimedia.org/wiki/File:King-Cobra.jpg) |
| section | triangular, vertebral row enlarged | modelled | same |
| eye | 8 mm at 3005 mm | 10 mm | same |
| dorsal rows | 17 to 19 at neck, 15 midbody | 15 rows of diamonds | same |
| ventrals | 240 to 241 in the types | 241 scutes | same |
| body bands | 27 to 48 pale bands | 40 | same |
| tail and rear quarter | nearly black | darkens from 55 % of length | same |
| raised part | "a third of its body" | 1.17 m of arc, head 0.75 m up in a curved stance | popular sources via [search](https://www.desertusa.com/animals/king-cobra.html); **no measured study opened** |

**Estimated, not sourced:** hood width 1.7 × head width (104 mm), read off two front photos (about 1.5 on
one, where the head is nearer the camera, and about 1.7 on [the other](https://commons.wikimedia.org/wiki/File:Ophiophagus_hannah2.jpg)).
The hood's length (about 0.35 m) and profile come from the same photos. No published hood width was found;
[Young and Kardong 2010](https://doi.org/10.1242/jeb.034447) could not be opened. Scale length, tongue length
and every colour value are read from photos.

**Staging (design):** the rest pose is a showcase stance. The hood faces 35° to the side, square to the 3/4
camera, and the rear two thirds lie in a stacked pile. The overall box (0.56 × 0.55 × 0.78 m) is that pose;
the 3.5 m is held by the recipe's test along the body.

## Motion
| Clip | How | Source |
|---|---|---|
| `slither` | `snakeClips` measured wave: 0.4 L wavelength, 0.1 L amplitude, 0.22 L per cycle | [J20], [H09] via the swim research doc |
| `idle` | the reared stance, starting and looping on the rest pose: gentle sway, hood breathing, tongue | design |
| `hood_up` | the same stance, more alert: wider sway and tongue flicks | design |
| `idle_ground` | the kind's small serpenoid on the ground, hood folded (it starts flat, away from the rest pose) | design |
| `rear` | from the front laid out over the pile, joints unwind neck first into the stance, hood spreading | design |

Undulation rate 1 Hz is the kind's design value: no opened source gives one for a snake this size. `sidewind`
is not shipped: it misses its foot-lock target (about 4.1 mm per frame against 1 mm).

The rest pose is the raised stance, so `snakeClips` runs on a straight flat copy of the spine and each key is
re-solved on the real skeleton from joint targets. The root bone is at the head, so clips that keep the pile
still pin its first joint and let the head absorb the small length error. Turns of the pile touch, so each
vertex is weighted only to spine bones next to its nearest one (`skin.ts`).

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
