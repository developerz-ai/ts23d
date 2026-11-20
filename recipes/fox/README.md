# fox — red fox, adult dog fox, standing alert, winter coat

*Vulpes vulpes*. The grey wolf's **canid family member** (plan 101 slice 16): `spec.ts` hands the
wolf spec (`recipes/_lib/creature/wolf-spec.ts`) and the fox's sourced numbers to `familyMember` (src/kinds/
creature-families.ts), which keeps the wolf's skeleton, build and face and scales them —
neck with head-body, head with head-body^0.8 (small carnivores carry relatively bigger heads;
the fox's own skull length is given, so the exponent only fills gaps), coat thickness with
mass^(1/6). The recipe then overrides what makes a fox not a small wolf.

## Identity
A good-sized adult dog fox in winter coat. Signature: the long, full brush with a **white tip**;
big erect ears with **black backs**; a slim pointed muzzle; white chin, lips and throat; rusty
upper limbs over **black paws**; vertical slit pupils.

## Specs
| Dimension | Real | Model | Source |
|---|---|---|---|
| Shoulder height | 0.35–0.50 m | **0.425** (pinned) | [Wikidata Q8332](https://www.wikidata.org/wiki/Q8332) P2048, `data/wikidata-Q8332.json`; [Wikipedia: Red fox](https://en.wikipedia.org/wiki/Red_fox) "Dimensions" |
| Head + body | 0.45–0.90 m | **0.74** (test: skeleton ±2 %; at 0.68 on the pinned 0.425 m shoulder the legs read long, a coyote's) | Wikipedia: Red fox |
| Tail | 0.30–0.555 m, "longer than half the body length" | **0.42** | same |
| Mass | 2.2–14 kg, vixens 15–20 % lighter | **7.5** declared, ±30 % (`real.mass`) | same |
| Skull | males 129–167 mm | head **0.17** incl. fur; furred width 0.56 × length with a cheek ruff (`face.cheek 0.16`), muzzle half the head | same |
| Ears | 77–125 mm | **0.11** (`face.earLength` restated in the face override, which replaces the family member's; before, the ear fell back to the kind's 0.38 × head = 6 cm), `earWidth 1.0` (thin shells to a sharp tip) | same |
| Coated box | — | 1.20 × 0.18 × 0.56 m (nose → level brush, paws → ear tips; measured off the posed model; no card passes 9.2 cm off the midline: `FOX_WILD.box`) | — |

## Photos (by view)
| View | URL | Notes |
|---|---|---|
| side, standing | https://commons.wikimedia.org/wiki/Category:Vulpes_vulpes | brush carried low, black stockings |
| front 3/4 | https://en.wikipedia.org/wiki/Red_fox (infobox and "Fur" photos) | white chin and throat, ear backs |
| winter coat | https://commons.wikimedia.org/wiki/Category:Vulpes_vulpes (search: winter) | fuller brush and ruff |

## Parts the engine needs
`body` (skinned to the wolf-family armature: spine, neck, head, jaw, tail, four legs × 4),
`body_cutout` (fur cards). Clips: `idle`, `look`, `bite`, `walk`, `trot`, `gallop`.

## Open questions and known gaps
- Tail carried **level** (`pose.tail: 'level'`): hanging, a 0.42 m brush from a 0.38 m tail root
  touches the ground and reads as a fifth foot to the gait gate. Real foxes carry it low; a
  "low" carriage between hang and level is not a kind option yet.
- The belly/throat zone is one colour: the white throat and the darker belly of the real fox
  share `belly` (a pale ginger compromise).
- Sources disagree on shoulder height by region; Wikidata's single 0.425 m is used as given.

## Field wear and colour blocks (`FOX_WILD` in `wild.ts`, through `recipes/_lib/creature/wild.ts`)
- The fur carries the wear (`cardWear`): each card takes it from the skin under its root and keeps
  0.55 of its length over caked mud and 0.15 on the muzzle's bite. Leg landmarks
  through `options.body` (`recipes/_lib/creature/limb-marks.ts`): elbow point, carpal pad, patella,
  the hock's point and Achilles cord, the toes split by grooves (LOD0/1).
- Colour blocks painted before wear, at every LOD: the hind thigh and upper arm red (the kind's
  cream belly zone climbed over them); black stockings from just under the elbow and hock, the
  same edge at LOD2 (the far leg tubes carry a ring where the colour turns).
- Build: chest 0.53 of the shoulder height deep (a fox in winter coat is deep-bodied; 0.48 read
  lanky), tuck 0.84 (the belly line slimmed behind the ribcage), limbs 1.1 × the allometric limb, a 3 cm ruff.
- Density set directly: body cell × 1.6 (7.5 mm), head × 1.5 (4.3 mm) (`options.cells`): 84 k
  triangles at LOD0 (was 96 k, before that 147 k), the difference spent on cards; the far mesh
  finer than the kind's default (× 0.9, × 0.8); the kind's fur at 2 600 undercoat / 170 guard
  cards per m² (`spec.fur`). Triangles 86 k / 28 k / 3.9 k (band 150 k / 30 k / 4 k).
- Winter story: snow on the hair tips along the topline (every second or third card from the
  withers to the croup is frosted white: fine flecks, not painted blobs) over a thin painted
  frost, snow caught on the black ear tips as fine 3 mm flecks (6 mm flecks over half the tip read
  as a flat grey-white card) and in flecks on the upper side of the brush, thaw mud
  caked on the paws and graded up the stockings' feet to the wrists (higher, the black stockings
  went a dusty brown), wet clumped fur up the stockings' tops and under the belly, matted flanks,
  the right ear nicked shallowly (`nickDepth` 0.14 of the ear: at the default 0.32 the thin shell
  was cut to a stalk under its tip), a healed bite on the left of the muzzle (the haunch scar is gone: it read
  as a pale seam across the coat).
- Face (`recipes/_lib/creature/wild-head.ts`): brow shelf, cheekbone and the hollow under each eye
  (`facePlanes`, through `options.head`), a dark lid rim, and a velvet of short face cards
  (`faceFur`, 16 000 per m², 0.8–2 cm, joined into the kind's `head_fur`).
- Coat: 9 000 short cards per m² over the trunk, shoulders and thighs (tone 0.8 → 1.28 root to
  tip) and 1 700 clumped pale-tipped guard locks per m²; locks 1.9 cm across painted along the
  hair's lie under them (`locks`); the brush's fullness is 6 cm card fur standing
  off the tail (a thicker tail chain weighs as flesh and pulls the fore share under 55 %).
  `cardLift: 1.4` raises every card's value: the path-traced hero shades a card with the strand
  lobes at about 0.6 of the orange skin under it, and the coat read as peppered with dark dashes
  (D481).
- LOD2: the coat painted as blocks (russet back, red flank, cream underside and chest) instead
  of the sculpt's per-vertex tone, the brush's white tip painted back on its last fifth, a fringe
  of locks along the back and the brush, and only the broad wear layers.
- Hero camera `{ azDeg: -55, elDeg: 10 }`: side-on enough for the brush, stockings and snowed back.
- Black whiskers, 12 a side.
