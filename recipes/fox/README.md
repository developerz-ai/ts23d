# fox — red fox, adult dog fox, standing alert, winter coat

*Vulpes vulpes*. The grey wolf's **canid family member** (plan 101 slice 16): `fox.ts` hands the
wolf spec (`recipes/wolf`) and the fox's sourced numbers to `familyMember` (src/kinds/
creature-families.ts), which keeps the wolf's skeleton, build and face and scales them —
neck with head-body, head with head-body^0.8 (small carnivores carry relatively bigger heads;
the fox's own skull length is given, so the exponent only fills gaps), coat thickness with
mass^(1/6). The recipe then overrides what makes a fox not a small wolf.

## Identity
A mid-sized adult dog fox in winter coat. Signature: the long, full brush with a **white tip**;
big erect ears with **black backs**; a slim pointed muzzle; white chin, lips and throat; rusty
upper limbs over **black paws**; vertical slit pupils.

## Specs
| Dimension | Real | Model | Source |
|---|---|---|---|
| Shoulder height | 0.35–0.50 m | **0.425** (pinned) | [Wikidata Q8332](https://www.wikidata.org/wiki/Q8332) P2048, `data/wikidata-Q8332.json`; [Wikipedia: Red fox](https://en.wikipedia.org/wiki/Red_fox) "Dimensions" |
| Head + body | 0.45–0.90 m | **0.68** (test: skeleton ±2 %) | Wikipedia: Red fox |
| Tail | 0.30–0.555 m, "longer than half the body length" | **0.42** | same |
| Mass | 2.2–14 kg, vixens 15–20 % lighter | **6** declared, ±30 % (`real.mass`) | same |
| Skull | males 129–167 mm | head **0.16** incl. fur | same |
| Ears | 77–125 mm | **0.11** | same |
| Coated box | — | 1.11 × 0.16 × 0.52 m (nose → level brush, paws → ear tips; measured off the posed model) | — |

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

## Field wear and colour blocks (`FOX_WILD`, through `recipes/_lib/creature/wild.ts`)
- Colour blocks painted before wear, at every LOD: the hind thigh and upper arm red (the kind's
  cream belly zone climbed over them); black stockings from just under the elbow and hock, the
  same edge at LOD2 (the far leg tubes carry a ring where the colour turns).
- Density set directly: body cell × 1.35, head × 1.15 (`options.cells`): 96 k triangles at LOD0
  (was 147 k); the kind's fur at 2 600 undercoat / 170 guard cards per m² (`spec.fur`).
- Winter story: snow dusted on the back and shoulders, thaw mud drying pale on the black paws,
  wet fur under the belly, the right ear nicked, a healed bite on the left of the muzzle.
- Coat: 5 200 short cards per m² over the trunk; the brush's fullness is 6 cm card fur standing
  off the tail (a thicker tail chain weighs as flesh and pulls the fore share under 55 %).
- Black whiskers, 12 a side.
