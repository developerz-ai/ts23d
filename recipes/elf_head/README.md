# Elf bust — original stylised design

## Identity
A young elf ranger in the fantasy-MMO idiom (inspiration only, no specific character): a **slender
face** (narrow jaw, pointed chin), **high cheekbones**, a **refined narrow nose**, **almond eyes**
(lid line tilted up at the outer corner), **long pointed ears swept back and up** — built on the
human ear's anatomy with the helix drawn out to a point — **long pale-gold hair as sculpted locks**
falling behind the ears with two flat ribbon locks in front, a **green gold-trimmed tunic** with a high
collar, a **teal cloak** and a **silver leaf clasp** — cut as a collectible bust on a turned plinth.

## Proportions: the measured human (docs/research/head-analysis.md) with declared exaggerations
| Feature | Elf | Human | Exaggeration |
|---|---|---|---|
| head | 0.23 m | 0.23 m | — |
| cranium width | 0.642 H | 0.683 H | ×0.94 |
| jaw (bigonial) / chin | 0.382 H / ×0.8, +0.03 H forward | 0.449 H | ×0.85 (once — the knob stays 1), pointed |
| cheekbones | ×1.15 ridge, lifted 0.02 H, blended smooth | 1 | high, no knots |
| cheeks / skin | full (buccal fill, malar pad), orbits rolled softly (×1.4 blend) | — | youthful |
| mouth | lips ×0.6, set 0.012 H back | 0 | refined, straight profile |
| neck | 0.65 × head width | 0.7–0.8 | slender (declared `NECK`) |
| nose width | ×0.8 | 1 | refined |
| eye line / interpupil / ball | 0.55 / 0.278 H (0.064 m, `measures`) / 0.056 H | 0.54 / 0.265 / 0.052 | ×1.05 IPD, almond (tilt +10°) |
| ear | human structure; helix tip ×1.3 the length beyond the oval, swept 0.35, total ≈ ×2.3 the human ear, lobe ×0.6 | 0.263 H | **×2.3** |
| expression lines | none (smooth) | some | `lines: 0` |

## Skull stage (2026-11)
The head is now the CC0 base warped by `ELF_FACE` (`spec.ts`): the ears' tips drawn 0.3 H back and
up in the ear's own plane (tip 0.15 H over the eye line, between brow and crown, 0.16 H out from
the skull) and grafted as 36 mm leaves of 4.2 mm cartilage with a rolled helix (`GRAFT`, D573), eyes ×1.15 set ×1.166 (IPD 64 mm), almond tilt +2 % H, cheekbones +2 % H, jaw ×0.85 dropped
5 % H, slender neck ×0.85; soft planes, no lines (`forms`), no beard shadow. It is checked against
`ELF_PROPORTIONS` — the human bands with the declared deltas (eyes ×1.15, a longer lower face, a
slender neck 0.5–0.75 × head breadth). The bones over it come from `STRUCTURE`: a light brow over
a soft orbit, lids 2.4 mm thick, high cheekbones (D570–D572; `recipes/_lib/bust/face-check.test.ts`). The table above records the earlier primitive head.

## Built by
`spec.ts` (2026-11: the mid-face 3 % shorter, a thinner upper lid, ears held 13° out so the tips
break the hair's outline, shoulders ×0.78 of the base's and 0.15 m half-span), `torso.ts` (the
shared torso, its arms cut a finger outside the shoulder point as a classical bust's are),
`hair.ts` (card hair: parted cap in the hair's root colour in shade (at the mid gold it showed through the crown as a pale scalp whorl), long locks, a dense crown layer (5.6k/m², darker toward the root), a whorl layer over the cap lines' pole above the forehead and outline layers; `farHair` for LOD2),
`clothes.ts` (the outfit as layers) and `creases.ts` (the intended folds as ≤ 3 cm regions from
the same geometry) on the shared bust library `../_lib/bust/`. Eye `socket` joints as on every bust.

## Outfit: one closed solid per material (2026-11)
The garments are no longer sculpted into the skin. `outfitLayers` (`clothes.ts`) returns each layer
with its trim-sheet strip; `build.ts` meshes each on that strip, fairs it, settles road dust on
the wool as an even tan film on what faces up (`wear.even`, `../_lib/bust/layers.ts`: the
`weather` pass's patches read as noise on a garment this small) and merges them per part under the `face` node, so they breathe
with the chest. The skin under them is cut away (`hiddenBody`).

| Layer | Part | Strip / finish | What it carries |
|---|---|---|---|
| tunic | `tunic` | `bust_silk` (`SILK`, ../_lib/bust/cloth-strips.ts: fine weave, roughness 0.42), no finish | silk tunic, neckline band, wrap panel, handled-dark blotches |
| cloak | `clothes` | `bust_wool` (`WOOL`: coarse twill, roughness 0.94), no finish | 8 mm wool, neck edge rolled 1.4 cm out from the tunic's, pipe folds, a darker felt shoulder cape with a leaf-cut hem, pale rubbed front edges, mud toward the base |
| braid | `clothes` | `brass` | gold braid as raised geometry at a 4 mm cell (it stair-stepped as vertex paint): the wrap's edge with a row of beads, the cloak's front edges |
| `clasp` | own part | `chrome` | silver leaf clasp |

## LODs and budget
| LOD | Triangles | What changes |
|---|---|---|
| 0 | ≈ 68.6k (budget 74k) | head 6.4 mm (finer boxes round the eyes, ears and mouth): head ≈ 28k, bust ≈ 2.7k, hair cards ≈ 13k, tunic ≈ 8.4k, cloak and braid ≈ 11k |
| 1 | ≈ 18.9k (20k) | head 11 mm (≈ 5.2k), hair cards ≈ 1.4k; the same three garment layers (≈ 8.5k) |
| 2 | ≈ 3.0k (3.4k) | head 22 mm; the long fair hair as wide cards in the LOD0 tones (`farHair`), combed over the LOD1 head; tunic and cloak in ONE sculpt on `canvas` at a 2.6 cm cell with flat colour blocks (no braid) |

## Palette (sRGB)
| Role | Hex |
|---|---|
| skin / warm / cool / crevice / lips | `#e8c4a4` / `#f2d0ae` / `#c4a296` / `#7a4a44` / `#c47a76` |
| eyes: sclera / iris | `#f0ece6` / `#3a8a6a` |
| hair root → tip | `#8a5620` → `#f6d27e` (golden, D525) |
| tunic / cloak / cape / braid (`brass`) / clasp (`chrome`) | `#2f5a3a` / `#3f7a6a` / `#1f3f3a` / `#e8c878` / `#d8dce0` |
| wear: frayed wool / mud | `#8aa39a` / `#4a4a3a` |

## Known gaps
The face is softer than a hero elf from a pro sculptor; the hair is strand cards in the lock style (`locks`, D461; LOD0 ≈ 13k
triangles: dark mass cards under narrow clumped locks 1.8 cm across in tones 0.8–1.04 of the hair
colour, so the fall reads as a mass of straight strands; the longest lock is 24.5 cm, to the shoulders); the skin's detail is the shared tiling pore strip
(`pores: true`: true-scale pores and micro-relief; `complexion: { freckles: 0.85, fine: true }`: freckles gathered over the bridge and cheekbones on `face_skin_freckled`, the coarse pores only on the nose and the cheeks' centres, the clear strip `face_skin_clear` elsewhere, D520; a glossier T-zone, fine thin skin and lines round the eyes, wet lips; `translucent`: thin ear rims and tips painted a red-orange glow, D522) under one `skin` finish (the shared `skinFinish`: a soft grazing sheen, no clear coat, so cheeks and shoulders stay matte and only the oily strip's T-zone (up to a tenth of the head over the glabella) shines; the scalp above it and behind the ears is on the matte strip, `face_skin_matte`, so a bald or shaven dome has no wet hot spots), not a
per-face texture; the braid is a 4 mm-cell cord, lumpy up close; the cloak's hem lies below the bust's cut, so its fraying shows only as the ragged, muddy
band at the base; the cut arms give the bust square shoulders under the cloak.

## Triangle budget (As of 2026-11-19)
About 68.6k / 18.9k / 3.0k (budget 74k / 20k / 3.4k) against the bust band of 60k / 12k / 1.5k (it was 100k / 29k / 3.4k). The head is one sculpt meshed at a 6.4 mm cell (4.8 mm before; the two render alike at 2.6 x the hero's distance), with finer boxes only round the eyes, ears and mouth; the garment cells grew by a fifth.

Budget why: uniform-cell sculpt (an iso-surface cannot thin its flat areas) plus 13k of long hair cards and three closed garment layers; LOD2 below a 2.2 cm head cell folds the ears and nose.

