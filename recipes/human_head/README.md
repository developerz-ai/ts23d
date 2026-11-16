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
top ([face-base.md](../../docs/research/face-base.md), "Skull stage").

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

## Parts
`head`, `bust` (split at the neck seam under the collar; LOD2 unsplit), `eye_l` / `eye_r` (yawed
to converge 1.5 m ahead, `cornea` clearcoat finish), `brooch`, `plinth`, `hair` (one cut-out draw).

## Hair
LOD0 hair is the **Blender groom** (`groom.ts`, ADR 014): guides traced on the card style's swept
mid layer (`hair.ts`: left side parting, crown whorl), combed back, parting filled, crown puffed,
nape cut, clumped into ~300 locks with curl and frizz; beard, moustache, brows and hairline wisps
stay cards in the same part. The groom output is cached in `neural/`: refresh it with
`t3d neural run recipes/human_head/human_head.ts` (needs a `groom` adapter in `t3d.config.ts`,
Blender ≥ 5.2); a cache miss, LOD1 and LOD2 build the card hair (CPU). The scalp and chin under
the cards are painted a shaded hair brown (`scalp`), held by `scalpCoverCheck` (D57).

## Known gaps
The tunic is the torso painted blue with sculpted folds (no separate cloth thickness at the neck
opening); eyelashes are a painted lash line (cards at the lid margin need a finer root mesh than
the 4 mm card surface); the face's planes are softer than a pro bust's.
