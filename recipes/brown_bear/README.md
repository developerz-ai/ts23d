# brown_bear — Eurasian brown bear, adult male, standing on all fours

*Ursus arctos arctos*. The grey wolf's **ursid family member** (plan 101 slice 16):
`familyMember` takes the wolf spec's skeleton (`recipes/wolf`) and, because the family differs,
swaps in the ursid preset (`FAMILY_PRESETS.ursid`): plantigrade feet with five clawed toes, a
broad dished head with round ears, a short thick neck, the shoulder hump (a long-fur ruff over
the withers), a barrel trunk with no tuck. One skeleton family, two very different animals.

## Identity
Signature: the **shoulder hump** (muscle; brown bears are the only extant bears with one), a
broad head with small round ears, a heavy forequarter on thick plantigrade limbs with long pale
fore claws, a short tail lost in the fur, coat from yellowish-brown to dark brown, darker legs.

## Specs
| Dimension | Real | Model | Source |
|---|---|---|---|
| Head + body | 1.0–2.8 m | **2.1** (test: skeleton ±2 %) | [Wikipedia: Brown bear](https://en.wikipedia.org/wiki/Brown_bear) |
| Shoulder height | up to 1.5 m | **1.10** (estimate for a male on all fours, unverified) | same |
| Tail | 0.06–0.22 m | **0.12** | same |
| Mass | 80–600 kg; Eurasian males average 350–500 kg | **400** declared, ±30 % | same; [Wikipedia: Eurasian brown bear](https://en.wikipedia.org/wiki/Eurasian_brown_bear) |
| Mass (Wikidata) | 500 kg, no qualifier | cross-checked ±25 % (`MASS_CONFLICTS` empty) | [Wikidata Q36341](https://www.wikidata.org/wiki/Q36341) P2067, `data/wikidata-Q36341.json` |
| Skull | males 315–455 mm long, zygomatic width 175–277 mm | head **0.45** incl. fur, width **0.62** × length | Wikipedia: Brown bear |
| Fore claws | 50–60 mm, 70–100 mm along the curve | kind default (pale keratin) | same |
| Coated box | — | 2.30 × 0.70 × 1.25 m (measured off the posed model) | — |

## Photos (by view)
| View | URL | Notes |
|---|---|---|
| side, walking | https://commons.wikimedia.org/wiki/Category:Ursus_arctos_arctos | hump above the shoulder, topline falling to the rump |
| front 3/4 | https://en.wikipedia.org/wiki/Brown_bear (infobox and "Description" photos) | broad head, small round ears |
| Eurasian coat | https://en.wikipedia.org/wiki/Eurasian_brown_bear | yellowish-brown to dark brown, darker legs |

## Parts the engine needs
`body` (skinned; the wolf-family armature), `body_cutout` (fur cards). Clips: `idle`, `look`,
`bite`, `walk`, `trot`, `gallop` — plantigrade swing (D52: the sole flexes back like a hock).

## Open questions and known gaps
- The croup sits as high as the hump in side view: the quadruped skeleton's topline is the
  wolf's (withers highest only by the ruff). A real bear's back falls from the hump to the rump;
  a `topline` knob on the skeleton is the fix (kind work, not a recipe number).
- The head reads conical at LOD0 (ursid head preset); the dished face and the forehead step
  over the eyes are weaker than real.
- Shoulder height is an estimate from photos (the sources give the range's top only).
