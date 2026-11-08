# Human hero bust — original stylised design

## Identity
A young adventurer: **measured human proportions** (ratios from a head scan, not textbook guesses)
pushed slightly heroic — square jaw, a stronger chin — with **swept-back hair** and a
**clipped beard and moustache** sculpted as locks, clear blue **socketed eyes**, **anatomical ears**,
a **blue tunic** with folds, a **standing leather collar**, a **red mantle** over the shoulders and a
**brass brooch** — cut as a collectible bust on a turned plinth.

## Proportions (all from docs/research/head-analysis.md unless marked)
| Feature | Ratio of H (0.23 m) | Note |
|---|---|---|
| eye line / brow / nose tip / subnasale / mouth / chin | 0.540 / 0.625 / 0.392 / 0.339 / 0.248 / 0.127 | measured |
| interpupil | 0.265 (0.061 m, the `measures` gate) | measured; adult IPD ≈ 62 mm |
| cranium width / skull depth / jaw | 0.683 / 0.888 / 0.449 | measured |
| ears | top 0.555, bottom 0.292, width 0.55 × length | measured; helix, antihelix, concha, tragus, antitragus, lobe |
| eyeball / iris | 12 mm ball, 11.7 mm iris; lids over 25 % / 12 % of the iris | anatomy |
| neck | column 0.76 × head width, chin 0.28 H above the collar; sternocleidomastoid V, larynx, trapezius slope | human 0.7–0.8 × head width (`checkNeck`, `NECK_HUMAN`) |
| face planes | cheekbone a low ridge blended into the cheek plane, buccal fill, malar pad, lateral orbital rims; mouth at the measured projection | no knobs, no gauntness |
| **heroic exaggerations** | jaw ×1.06, chin ×1.1, brow ×0.9 (a ridge, not a ledge) | declared in `spec.ts` |
Silhouette vs the scan: IoU 0.84 front, 0.83 side (with hair and collar).

## How it is built
`spec.ts` (the table above as code) → the shared bust library `../_lib/bust/`: `head.ts` (ratios,
landmarks, head block and planes), `face.ts` (orbit, cheekbone, nose, lips, lines), `eye.ts`,
`ear.ts`, `torso.ts`, `hair.ts`, `skin.ts` (painted tone), `bust.ts` (one sculpt split under the
collar into `head` and `bust`). This folder adds `hair.ts` (hairline, swept locks, beard,
moustache — the beard stops short of the neck), `clothes.ts` (tunic paint and folds, a hemmed
mantle, collar, brooch) and `creases.ts`: the intended folds (lids, alae, lip line, nasolabial,
ears, each lock, hairline and beard edge, collar, folds, mantle edge, brooch) as small regions
(≤ 3 cm) declared from the same geometry — QA `connections` excuses nothing else.

Each eye has a `socket` joint (`eye_l_orbit`, `eye_r_orbit`, LOD0): the ball against the orbit's
bore behind its equator (QA `joints`, measured locally).

## Palette (sRGB)
| Role | Hex |
|---|---|
| skin / warm / cool / crevice / lips | `#d4986f` / `#e0aa80` / `#a87868` / `#6a3428` / `#b86b5c` |
| eyes: sclera / iris / wet line / caruncle | `#ece6dc` / `#3d6e9e` / `#f0c0b0` / `#d07a74` |
| hair + beard root → tip | `#3a2416` → `#8a6038` |
| tunic / folds / collar / mantle / brooch (`brass`) | `#2e4f8a` / `#1e3560` / `#6b4428` / `#7a2420` / `#c9a24a` |

## Parts
`head`, `bust` (split at the neck seam under the collar; LOD2 unsplit), `eye_l` / `eye_r` (yawed
to converge 1.5 m ahead, `cornea` clearcoat finish), `brooch`, `plinth`.

## Known gaps
The tunic is the torso painted blue with sculpted folds (no separate cloth thickness at the neck
opening); hair locks are clumps on a mass, not strands; the face's planes are softer than a
pro bust's.
