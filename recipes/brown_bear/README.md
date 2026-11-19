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
| Skull | males 315–455 mm long, zygomatic width 175–277 mm | head **0.48** incl. fur (a big male's 45 cm skull), furred width **0.66** × length, muzzle 0.31 of the head | Wikipedia: Brown bear |
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
- The hump is a mass on the topline (`build.topline`: 7 % of the shoulder height proud of the
  back at 0.88 of the way from croup to withers), so the back falls from hump to rump; the heel
  stands under the hip (`build.heel` 0.025), and `build.track` 0.315 holds the 0.70 m stance
  under limbs 12 % over the bare allometric radius.
- The head is 0.72 × its length wide with a short blunt muzzle (ursid preset + cheek fur); the
  face between the cards is still smooth painted skin and the forehead step is weaker than real.
- Shoulder height is an estimate from photos (the sources give the range's top only).

## Coat and field wear (`groom.ts`, `BEAR_WILD`, through `recipes/_lib/creature/wild.ts`)
- The spec sets `cards: false`: the kind's even card coat spent 54 000 triangles and left the
  flanks bare. `groom.ts` places every lock: a short undercoat (850 per m²), clumped guard hair
  that is long on the back, breeches, belly fringe and the back of the forelegs, a mane lying
  back over the hump, short face fur with bare nose, lips and eye rims, a ruff round the back of
  the skull. No lock may leave the dossier's box (0.36 m off the midline, 1.29 m high).
  Cards are bound with the kind's own skinning (`info.rig.pieces`) and kept off the kind's own
  bare-skin map (`info.bare`). LOD0 125 k triangles (was 161 k; band 150 k); LOD2 keeps a few dozen big locks on the hump
  and back.
- Story: river clay drying pale to the elbows and hocks, wet fur above it and under the belly,
  the right shoulder rubbed pale on a marking tree, two rake scars under it and two across the
  muzzle, matted flanks and breeches.
- Not done, and why: thicker forearms (`build.limbs` > 1 widens the stance past the 0.70 m
  envelope); hind feet under the hips (the kind's plantigrade hind chain puts the heel 18 cm
  behind the hip: a kind change).
