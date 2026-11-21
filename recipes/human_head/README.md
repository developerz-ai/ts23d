# Human hero bust — original stylised design

## Identity
A young adventurer: **measured human proportions** (ratios from a head scan, not textbook guesses)
pushed slightly heroic — square jaw, a stronger chin — with **swept-back hair** and a
**clipped beard and moustache** sculpted as locks, clear blue **socketed eyes**, **anatomical ears**,
a **blue tunic** with folds, a **standing leather collar**, a **red mantle** over the shoulders and a
**brass brooch** — cut as a collectible bust on a turned plinth.

## Proportions (sourced; checked every build by `proportionCheck`)
The head is the CC0 MakeHuman base (the gender-neutral anthropometric average) warped to the hero
(`HERO_FACE` in `../_lib/bust/human/spec.ts`), then planes, muscles, features and skin tones on
top ([face-base.md](../../docs/research/face-base.md), "Skull stage"). The base is soft, so the
bones are sculpted over it from `STRUCTURE` (`recipes/_lib/bust/face-forms.ts`): a brow shelf 9 mm
ahead of the cornea over an orbit 9 mm deep, lids 2.6 mm thick round a 9.6 mm fissure (the upper
lid covers 16 % of the iris, the lower 2 %), the lateral orbital rim, cheekbones 8 mm proud of the
buccal plane; and the neck is thickened to 120 mm across (`human/neck.ts`; ANSUR II male neck
circumference 395 mm). `recipes/_lib/bust/face-check.test.ts` measures each on the built skin
(D570–D572, D575).

| Ratio | Band (source) | As built |
|---|---|---|
| eye line ÷ head height | 0.45–0.53 (Loomis; ANSUR II menton–sellion 124 / 232 mm) | 0.52 |
| eye fissure ÷ head breadth | 0.17–0.23 (Farkas 1994 en–ex 31 / eu–eu 151 mm) | 0.20 |
| intercanthal ÷ fissure | 0.85–1.3 (Farkas en–en 33 / en–ex 31) | 1.07 |
| glabella→subnasale ÷ subnasale→menton | 0.75–1.15 (Farkas g–sn 64 / sn–me 72 mm) | 1.04 |
| upper neck ÷ head breadth | 0.66–0.86 (ANSUR II neck circumference 395 mm, head breadth 157 mm) | 0.78 |
| glabella ahead of the eyeball | 8–24 mm (Hertel exophthalmometry) | 15 mm |
| eyeball | 22–26 mm (Bekerman 2014) | 25 mm |
| interpupil (`measures`) | 63 mm (Dodgson 2004 adult mean 63.4; ANSUR II male 64.6) | 63 mm |

Declared deltas against the base (all male norms or a declared heroic push): head breadth ×1.05,
bigonial ×1.16, jaw dropped 7 % H (the base's short lower face fails the thirds band at 1.28),
chin +0.6 % H and ×1.15 wide, brow +0.5 % H, nose ×1.12 projection, eyes ×1.1 and set ×1.12,
neck ×1.3, face ×1.03. Neck: the base's sternocleidomastoid from the mastoid to the sternum plus an
SCM stroke; the bust torso's trapezius rises into the base's own and slopes to the shoulders.
Skin zones: lips, nose/cheek/ear redness, a blue-grey beard shadow on jaw, chin and upper lip,
brows, socket shade.

## Palette (sRGB)
| Role | Hex |
|---|---|
| skin / warm / cool / crevice / lips | `#d4986f` / `#e0aa80` / `#a87868` / `#6a3428` / `#b86b5c` |
| eyes: sclera / iris / wet line / caruncle | `#ece6dc` / `#3d6e9e` / `#f0c0b0` / `#d07a74` |
| hair + beard root → tip | `#3a2416` → `#8a6038` |
| tunic / folds / collar / mantle / brooch (`brass`) | `#2e4f8a` / `#1e3560` / `#6b4428` / `#7a2420` / `#c9a24a` |
| linen / its sweat-grey / braid / mantle's worn edge / woven border / darn / scar | `#dcd8c8` / `#9c9480` / `#b08a3e` / `#b06a52` / `#2c1410` / `#a8764e` / `#e6b8a4` |

## Parts
`head`, `bust` (split at the neck seam under the collar; LOD2 unsplit), `clothes` (shirt, tunic,
braid, cord), `mantle` (the wool strip, no finish), `eye_l` / `eye_r` (yawed to converge
1.5 m ahead, `cornea` clearcoat finish), `brooch`, `plinth`, `hair` (one cut-out draw). Head,
bust, clothes and mantle hang under the `face` node and carry its morphs.

## Outfit: one closed solid per material (2026-11)
The garments are no longer sculpted into the skin. `outfitLayers` (`clothes.ts`, this folder; the
shared `../_lib/bust/human/clothes.ts` still serves `import_demo`) returns each layer with its
strip; `build.ts` meshes each, fairs it, weathers the mantle (`weather`: dust on the shoulders)
and merges them per part. The skin under them is cut away (`hiddenBody`), the torso is 15 %
narrower than the shared spec's (`torso.ts`: 0.172 m half-span, mass 0.42, arms cut two fingers
outside the shoulder point) and the base mesh's shoulders ×0.92.

| Layer | Part | Strip / finish | What it carries |
|---|---|---|---|
| linen | `clothes` | `bust_linen` (`LINEN`, ../_lib/bust/cloth-strips.ts: plain weave, roughness 0.82) | shirt in the V and its band collar, sweat-grey at the collar, blotched |
| tunic | `clothes` | `bust_wool` (`WOOL`: coarse twill, roughness 0.94) | 5 mm blue wool, rolled stitched V, drag and gravity folds, an old spill down the front |
| braid | `clothes` | `bust_wool` | ochre braid round the V as raised geometry (4.8 mm cell), the brooches' cord |
| mantle | `mantle` | `bust_wool` | 9 mm red wool, rolled neck edge, shoulder seam, darker woven border, rubbed pale front edges, a darn on the left shoulder, mud toward the base |

Face (2026-11): lid and nasolabial folds a fifth deeper (`forms.lines`), sun on nose, cheekbones
and ears, a pale scar through the left brow's tail, the beard's cheek line fading over 1.8 cm.

## LODs and budget
| LOD | Triangles | What changes |
|---|---|---|
| 0 | ≈ 65.0k (budget 72k) | head 6.6 mm, finer round the eyes, ears and mouth (head ≈ 26k, bust ≈ 2.1k; hair and beard cover half of it), groomed hair ≈ 10k, garments ≈ 21k (clothes 14k, mantle 7k) |
| 1 | ≈ 19.5k (20.5k) | head 11 mm (≈ 5.5k), card hair ≈ 1k, garments ≈ 9k |
| 2 | ≈ 3.0k (3.1k) | one coarse head (26 mm) with the brow ridge and nose as masses that cell holds (`farFace`); linen, tunic and mantle in ONE sculpt on `bust_wool` at a 2.6 cm cell, coloured by the garment on top with flat colour blocks (no braid) |

## Hair
LOD0 hair is the **Blender groom** (`groom.ts`, ADR 014): guides traced on the card style's swept
mid layer (`hair.ts`: left side parting, crown whorl), combed back, parting filled, crown puffed,
nape cut, the front lock puffed and grown so it lifts off the forehead, clumped into ~300 locks
with curl and frizz; beard, moustache, brows and hairline wisps
stay cards in the same part. The groom output is cached in `neural/`: refresh it with
`t3d neural run recipes/human_head/human_head.ts` (needs a `groom` adapter in `t3d.config.ts`,
Blender ≥ 5.2); a cache miss, LOD1 and LOD2 build the card hair (CPU). The scalp and chin under
the cards are painted a shaded hair brown (`scalp`), held by `scalpCoverCheck` (D57).

## Known gaps
The skin's detail is the shared tiling pore strip (`pores: true`: true-scale pores and micro-relief; freckles gathered over the bridge and cheekbones, `complexion.freckles` 0.35; clear skin off the nose and cheeks; the beard's cheek line fading into the stubble strip's cut hairs, `stubble: beardline`, D523; matte cheeks, a glossier
T-zone, fine thin skin and lines round the eyes, wet lips) under one `skin` finish (the shared `skinFinish`: a soft grazing sheen, no clear coat, so cheeks and shoulders stay matte and only the oily strip's T-zone (up to a tenth of the head over the glabella) shines; the scalp above it and behind the ears is on the matte strip, `face_skin_matte`, so a bald or shaven dome has no wet hot spots), not a per-face texture; the hero is a portrait camera (`../_lib/bust/hero.ts`); the cloth takes no finish (the
linen and wool strips carry their own roughness); the mantle covers the shoulders and back only, so from the front it reads close to
sleeves; the braid is a 4 mm-cell cord, lumpy up close; eyelashes are a painted lash line (cards
at the lid margin need a finer root mesh than the 4 mm card surface); the face's planes are softer
than a pro bust's. The groom cache key covers the dressed bust (its collision body): any change
to the outfit or torso needs `t3d neural run` again (Blender, free).

## Triangle budget (As of 2026-11-19)
About 65k / 19.5k / 3.0k (budget 72k / 20.5k / 3.1k) against the bust band of 60k / 12k / 1.5k (it was 90k / 29k / 3.6k). The head is meshed at a 6.6 mm cell (5.2 mm before), finer only round the eyes, ears and mouth; the garment cells grew by a fifth.

Budget why: uniform-cell sculpt (an iso-surface cannot thin its flat areas) plus the groomed hair, beard cards and four closed garment layers; LOD2 below a 2.6 cm head cell loses the brow and nose.

