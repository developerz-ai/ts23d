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

## Built by
`spec.ts`, `hair.ts` (parted mass + long locks + two flat ribbon locks in front — three strands
side by side, 14 → 7 mm wide), `clothes.ts` (tunic, one tall blended collar, a hemmed cloak, clasp)
and `creases.ts` (the intended folds as ≤ 3 cm regions from the same geometry) on the shared bust
library `../_lib/bust/`. Eye `socket` joints as on every bust.

## Palette (sRGB)
| Role | Hex |
|---|---|
| skin / warm / cool / crevice / lips | `#e8c4a4` / `#f2d0ae` / `#b8a0a4` / `#7a4a44` / `#c47a76` |
| eyes: sclera / iris | `#f0ece6` / `#3a8a6a` |
| hair root → tip | `#9a7038` → `#f0d890` |
| tunic / cloak / trim / clasp (`chrome`) | `#2f5a3a` / `#2a4a5a` / `#c8a858` / `#d8dce0` |

## Known gaps
The face is softer and longer than a hero elf from a pro sculptor; the long hair is a handful of
locks rather than a full fall; the cloak is a sculpted offset layer, not draped cloth.
