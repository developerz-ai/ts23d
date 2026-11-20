# brown_bear — Eurasian brown bear, adult male, standing on all fours

*Ursus arctos arctos*. The grey wolf's **ursid family member** (plan 101 slice 16):
`familyMember` (in `spec.ts`) takes the wolf spec's skeleton (`recipes/_lib/creature/wolf-spec.ts`) and, because the family differs,
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
| Head + body | 1.0–2.8 m | **2.05** (test: skeleton ±2 %; shorter in the trunk than the earlier 2.1 under a longer head) | [Wikipedia: Brown bear](https://en.wikipedia.org/wiki/Brown_bear) |
| Shoulder height | up to 1.5 m | **1.10** (estimate for a male on all fours, unverified) | same |
| Tail | 0.06–0.22 m | **0.12** | same |
| Mass | 80–600 kg; Eurasian males average 350–500 kg | **400** declared, ±30 % | same; [Wikipedia: Eurasian brown bear](https://en.wikipedia.org/wiki/Eurasian_brown_bear) |
| Mass (Wikidata) | 500 kg, no qualifier | cross-checked ±25 % (`MASS_CONFLICTS` empty) | [Wikidata Q36341](https://www.wikidata.org/wiki/Q36341) P2067, `data/wikidata-Q36341.json` |
| Skull | males 315–455 mm long, zygomatic width 175–277 mm | head **0.50** incl. nose leather and occiput fur (the top of the range + 4.5 cm), furred width **0.8** × length (277 mm of zygomata + cheek fur), muzzle 0.33 of the head with a blunt 0.155 tip; the frontal dome, crown and ear discs are the recipe's own forms (`head.ts`) | Wikipedia: Brown bear |
| Fore claws | 50–60 mm, 70–100 mm along the curve | kind default length, horn-brown keratin (`#8a7a64`: the pale default vanished on muddy paws) | same |
| Ears | ≈ 12–14 cm with their fur (estimate from photos, unverified) | thick discs 13.5 cm across on the skull's upper corners, dark hollow forward (`head.ts`, `earDisc`) | photos |
| Coated box | — | 2.22 × 0.71 × 1.30 m (measured off the posed model) | — |

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
  stands under the hip (`build.heel` 0.025), and `build.track` 0.3 holds the 0.71 m stance
  under limbs 17 % over the bare allometric radius. The chest is 0.56 of the shoulder height deep
  (`build.depth`; the ursid preset's 0.6 left legs 0.4 H long), as broad as before (0.9 × depth).
- Proportions tried this round and refused by the gates: head-body 1.95 m (needs ≤ 385 kg under
  `familyMember`'s 3 × bulk, and at 380 kg the far fore wrist fails `deform`), chest depth 0.52–0.54
  (a hind foot slides in the walk, or the far hind leg folds past `deform`), limbs 1.2–1.32.
- Limits met while tuning (the gates decide, not the eye): a shoulder of 1.15 m slides a hind
  foot 5–7 mm in the walk clip (gate 1 mm), so the shoulder stays 1.10 m; limbs past 1.17 × lose
  more than 40 % of the far leg tube's volume at the wrist (QA `deform`); head-body under 2.05 m
  is more than 3 × the wolf's bulk (`familyMember` refuses it).
- The head: the kind's ursid head is a wedge (skull and muzzle one cone, a cupped ear blade
  thinner than this head's 11 mm cell). `head.ts` adds, through the kind's `options.head` hook, a
  frontal dome between and above the eyes ending steeply at the stop (the dished profile), the
  temporal muscles rounding the crown, and the ears as thick discs with a shallow dark hollow
  (`face.ears: 'none'` turns the kind's off; their roots and rims are declared creases).
  `BEAR_WILD.base` repaints the face the coat's brown with a darker brown muzzle (the kind's pale
  cheek and brow zones made the whole head one tan; a pale tan muzzle read as a plastic mask), and
  `facePlanes` (`recipes/_lib/creature/wild-head.ts`, rim only) paints a dark lid rim round the
  small deep-set eyes. The shared brow and cheek forms fold into seams against this head's dome at
  its 11 mm cells, a raised `stop` too; a shorter muzzle puts the nose's detail box on the eyes'.
- Shoulder height is an estimate from photos (the sources give the range's top only).

## Coat and field wear (`groom.ts`, `BEAR_WILD` in `wild.ts`, through `recipes/_lib/creature/wild.ts`)
- The groom's locks carry the wear (`cardWear`): grown off the worn skin, they keep 0.5 of their
  length in the river clay and 0.12 on the scars (parted to the skin); matted locks stay full length (shortened, they stood as dark stubs).
  Plantigrade leg landmarks under the coat through `options.body` (`limb-marks.ts`, 0.85 × size):
  elbow point, broad wrist and carpal pad, patella, the heel and broad hock, five split toes.
- The spec sets `cards: false`: the kind's even card coat spent 54 000 triangles and left the
  flanks bare. `groom.ts` places every lock: a short undercoat (640 per m²), clumped guard hair
  that is long on the back, breeches, belly fringe and the back of the forelegs, a mane lying
  back over the hump (lift 0.36; the guard locks 0.25: stood further off, the topline bristled),
  face fur (4 000 per m², 2.2 cm velvet on the muzzle to 5.2 cm on the crown: at 2 600 and 1.6 cm
  the face read as smooth plastic; 6 000 took LOD0 to 120 k,
  tone 0.78 → 1.3) with bare nose, lips and eye rims, fuzzy ears, a ruff round the back of
  the skull. No lock may leave the dossier's box (0.36 m off the midline, 1.335 m high).
  Every LOD0/1 layer maps the strand atlas's `fur` cells, pale toward the tip (the grizzle); the
  agouti `guard` cells end dark and left a near-black dash at every lock tip, so only the far locks
  use them. `cardLift: 1.45` raises every card's value back to the coat's: the strand texture
  averages about 0.9 and the guard hairs are painted darker than the skin, so unlifted the coat
  read as a hide stippled with dark dashes (D481; the renderer's own share, strand shading at 0.7
  of a matte surface, is fixed in D476).
  Cards are bound with the kind's own skinning (`info.rig.pieces`) and kept off the kind's own
  bare-skin map (`info.bare`). Under the cards the skin carries painted locks 6 cm across along
  the coat's lie (`locks`).
- Triangles 109 k / 27 k / 2.8 k (108 k / 26 k / 2.8 k before the split toes; band 150 k / 30 k / 4 k): body cell
  24 mm, head 11 mm (`options.cells`); the far mesh is finer than the kind's default and painted
  as blocks (grizzled back and hump, brown flank, darker underside, near-black legs) with a few
  dozen big locks on the hump, back and breeches and only the broad wear layers.
- Story: river clay wet and near-black on the paws, graded up the forearms and shanks in a dark
  grey-brown (a paler clay on near-black legs read as chalky blotches) and splashed to the belly
  fringe, wet matted fur up the legs and along the belly fringe, wet mud smeared along the belly,
  the right shoulder rubbed on a marking tree (the warmer underfur blended into the coat: a pale
  flat disc read as a hole), two rake scars under it (4 and 3 cm, the fur parted to the dark grey-brown skin a shade under
  the coat: a grey-pink core read as pale painted bars) and two across the
  muzzle, matted flanks and breeches. Claws keep their keratin under a
  film of dirt (`wild.ts`: caked whole they vanished into the paw).
- Hero camera `{ azDeg: -48, elDeg: 12 }`: the scarred shoulder and muddy forelegs to the lens.
