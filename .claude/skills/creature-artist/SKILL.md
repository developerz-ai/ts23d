---
name: creature-artist
description: A creature artist's workflow for ts23d — animals and original fantasy creatures (dragons, wyverns, beasts, insects, elementals) designed from real anatomy. Function-first design, borrowed-animal dossier, stance (plantigrade/digitigrade/unguligrade), weight support and centre of mass, skeleton-then-flesh sculpting, scales/fur/skin surfaces. Use when building or reviewing any animal, monster, beast or creature recipe, or `sculpt`/`visualHull` for a non-human body.
---

# Creature artist

Use with the [author-recipe loop](../author-recipe/SKILL.md), the
[characters & creatures playbook](../../../docs/playbooks/characters/characters-creatures.md) and the
flagship dossier [`recipes/dragon`](../../../recipes/dragon/README.md). Definitions:
[16-art-as-text](../../../docs/idea/16-art-as-text.md). Surfaces:
[surfaces-volumes](../../../docs/research/surfaces-volumes.md), [hair](../../../docs/research/hair.md).
Original designs only; never a named creature from any IP.

## When
- Any animal, beast, monster, insectoid, serpent, winged or elemental creature.
- A humanoid that departs from human proportions far enough that animal anatomy rules (a
  digitigrade-legged brute, a hybrid). Pure humanoids: [character-artist](../character-artist/SKILL.md).

## Workflow
| # | Creature-design stage | ts23d | Exit |
|---|---|---|---|
| 1 | Purpose first: what it eats, how it moves, where it lives, how it fights (Whitlatch: purpose before form) | dossier "design intent" section | one sentence of function per body part |
| 2 | Borrowed anatomy: each part maps to a real animal (wing from bat, neck from heron, hind leg from big cat) with measurements | dossier "reasoning" table, zoological sources (shoulder height, body length, mass) | every borrowed part sourced |
| 3 | Skeleton and stance | joint positions as `Vec3` constants; `ctx.group` per bone pivot; stance chosen | side view skeleton drawn as SVG |
| 4 | Silhouette from drawings | `visualHull({ front, side, top })` spread into a `sculpt` edit | side silhouette names the creature |
| 5 | Masses on the skeleton: ribcage, pelvis, limb segments, neck, tail | `sculpt` edits (`capsule`, `ellipsoid`), `loft` with `ringXY` for tails/necks, `sweep` for horns | `assertCentreOfMassInside`, `assertUprightOnGround` PASS |
| 6 | Anatomy pass: muscle groups that drive the motion, bony landmarks (scapula, hip, elbow) | more `sculpt` edits, `blend` small at landmarks | raking light shows landmarks |
| 7 | Surface: scales, plates, fur, skin folds | `CREATURE_MATERIALS` strips (`dragon_scales`, `reptile_scales`, `fur`, `hair`), `tex.scales`, `tex.strands` | scale size grades dorsal → ventral |
| 8 | Wear and story: scars, chipped horns, dust on belly | `grime({ ground })`, edits | tells where it lives |
| 9 | Present and critique | `t3d shot / hero / blueprint / critique` | every score ≥ 8 |

## Vocabulary → measurable
| Word | Meaning here | Check |
|---|---|---|
| Plantigrade | heel on the ground (bear, human); short foot, stable | foot sole touches ground: `touches('foot_*', …)` / floating-parts |
| Digitigrade | walks on toes, heel raised (cat, dog, bird); hock visible above ground | heel bone `z` > 0 by ~⅓ leg length *typical, verify* |
| Unguligrade | on hoof tips (horse, deer); long metapodials | hoof is the only contact |
| Support polygon | convex hull of ground contacts; the CoM must project inside it | `assertCentreOfMassInside`, `assertUprightOnGround` |
| Allometry | limb cross-section grows faster than length as mass grows; a giant needs columnar legs | `T3D_ALLOMETRY` **planned**; size limbs by hand, record in dossier |
| Mass | volume × density ≈ real animal mass | `real.mass` + `physics` → QA `mass` (±15 %) |
| Wing loading | mass ÷ wing area; flyers need plausible area | **planned**; compute in a test with `ruler` |
| Line of action | one dominant curve through spine and neck | judge on side view of `sheet.png` |
| Shape language | aggressive = acute angles + taper; friendly = rounds | **planned** metric; state intent in dossier |
| Silhouette reads | LOD2 IoU ≥ 0.85 vs LOD0 | `assertLodSilhouette(asset, 0.85)` |

## Quality bar
- [ ] Dossier names the real animal behind every part, with measurements.
- [ ] Stands: CoM inside the support polygon; every foot touches the ground at LOD0–2.
- [ ] Joints sit at real pivots (knee forward, hock backward on digitigrade hind legs).
- [ ] Limb thickness scales with mass; a 4 t creature has no deer legs.
- [ ] Head, horns, wings attach with `ctx.joint` (`flush` or `socket`), `joints` PASS.
- [ ] Surface detail sized to the body: scales grade, fur parts by flow, rest areas on the flank.
- [ ] Symmetric base (`mirror: 'y'`, `symmetric('_l', '_r')`) plus deliberate asymmetry at LOD0.
- [ ] LOD2 keeps outline and big colour blocks; budget met.

## Common mistakes
- Bolting parts of many animals together with no functional reason: reads as a collage.
- Knees bending the wrong way on a digitigrade hind leg (the hock is the ankle, not a knee).
- Wings too small to lift the body; necks too thin to hold the head.
- Uniform scale size everywhere; no gradient, no rest area.
- Floating claws/teeth: they must sink into gum or toe (`touches`).
- Using a famous creature's silhouette or colour scheme.

## Test it
```ts
import { assertCentreOfMassInside, assertLodSilhouette, assertUprightOnGround } from '@developerz.ai/ts23d/testing';
it('does not tip over', () => assertUprightOnGround(wyvern));
it('centre of mass over the feet', () => assertCentreOfMassInside(wyvern));
it('LOD2 keeps the outline', () => assertLodSilhouette(wyvern, 0.85));
```

## Run order
```sh
bun run t3d build recipes/<name>/<name>.ts --out out        # QA per LOD, exit 1 on a finding
bun run t3d shot recipes/<name>/<name>.ts --out renders     # READ sheet.png
bun run t3d hero recipes/<name>/<name>.ts --out renders     # READ hero.png
bun run t3d blueprint recipes/<name>/<name>.ts --out renders  # READ blueprint.png
bun test recipes/<name>/            # stability + silhouette tests
bun run t3d critique recipes/<name>/<name>.ts --out tmp/critique  # READ every PNG, fill critique.json
bun run shots <name>                      # refresh committed out/
```

## Pairs with
- [character-artist](../character-artist/SKILL.md): humanoid heads and faces.
- [concept-artist](../concept-artist/SKILL.md): purpose, silhouette options.
- [material-artist](../material-artist/SKILL.md): scales, fur, skin strips.
- [rigger-animator](../rigger-animator/SKILL.md): pivots at real joints.
- [art-director](../art-director/SKILL.md): bestiary consistency.

## Tool status
Shipped: `sculpt`, `sculptField`, `visualHull`, `sd.*`, `loft`/`ringXY`, `sweep`, creature strips
(`fur_neutral` for tinted coats), `tex.scales`/`tex.strands`, stability helpers, `real.mass` + QA
`mass`, `ctx.joint`, QA `connections`, the `creature` kind (`creature()` / `defineCreature`: six
skeleton types, staged sculpt, patterns, allometry and wing-loading checks — `recipes/wolf`).
Planned (M4, [roadmap](../../../docs/plans/roadmap.md#m4-creatures)): bones as named parts (jaw,
tail, limbs), `pose`/`warp`/`ffd`, fur shells and cards, skins and morph targets.
Neutral positioning: the free code-based option, no claims against other tools.
