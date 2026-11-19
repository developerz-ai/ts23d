# wolf — grey wolf, adult, relaxed standing, winter coat

*Canis lupus lupus* (Eurasian wolf). The proof recipe of the `creature` kind
([roadmap M4](../../docs/plans/roadmap.md#m4-creatures), [09-kinds](../../docs/idea/09-kinds.md)):
`wolf.ts` is the dossier below as one `CreatureSpec` (≈ 95 lines); skeleton landmarks, digitigrade
legs, allometric limb thickness, the head with seated eyes and grown ears, coat zones, creases,
densities and the balance check all come from the kind.

Pose: standing square, weight on all four paws, head carried a little below the withers, tail
hanging to the hocks. Winter coat: grizzled grey-ochre flanks, darker saddle, pale belly, legs,
muzzle and cheeks, the shoulder/neck mane, black tail tip.

## Measurements (adult, metres, kg)

| Dimension | Real | Model | Source |
|---|---|---|---|
| Length (nose → tail root) | 1.05–1.60 | **1.15** (test: skeleton ±2 %) | [Wikipedia: Wolf](https://en.wikipedia.org/wiki/Wolf) "Description" |
| Tail | 0.29–0.50 | **0.42** along the curve (test ±5 %) | same |
| Shoulder height | 0.80–0.85 | withers 0.84 incl. mane (test: 0.80–0.86) | same |
| Mass | European mean 38.5, North American 36; females 2.3–4.5 lighter | **40** declared, ±25 % (`real.mass`); model 30–60 (test) | same |
| Skull | 0.23–0.28 long, 0.13–0.15 wide | head **0.275** long (a large male's 0.265 skull + fur), furred width 0.64 × length (skull 0.55 + ~1.2 cm of coat a side), muzzle 0.41 of the head with a blunt 0.128 tip (a slimmer one read as a coyote) | same |
| Coat | winter guard hairs 60–70 mm mid-back; shoulders usually ≤ 90 mm, up to 110–130 mm (the mane/"cape"); dense short underfur | fur cards by zone; coated outline width **0.29** vs body 0.27–0.28 (`real.width` is the coated box) | same, "Description" (fur) |
| Ears | 0.09–0.11 high, "relatively small and triangular" | **0.09**, erect blades with a pale cup | same |
| Winter fur | back 60–70 mm; shoulders ≤ 90, up to 110–130 (a crest on the neck) | coat shell 3 cm (mass gate), mane 4 cm (`build.ruff`) | same |

Overall box (`real` length/width/height 1.31 × 0.27 × 0.90 m) is measured off the posed skeleton:
nose → hanging tail, paw to paw, paws → ear tips. The sourced numbers above are what the tests hold.

## Skeleton and stance

- **Digitigrade** (`stance: 'digitigrade'`): wrist and hock clear of the ground; the hock at
  0.25 × shoulder height (`build.hock`; the kind's 0.28 gave a long hind cannon), standing 0.07
  of the trunk behind the hip (`build.heel`); elbow back at the bottom of the chest, stifle forward at the belly.
- Side view (kind defaults for quadrupeds, wolf numbers): chest depth ½ the withers
  (`build.depth 0.51`) so the elbow sits at the chest floor ≈ 0.40 m; a narrow chest
  (`width 0.54` × depth ≈ 0.22 m); the topline highest at the withers, a slight dip behind them,
  the croup a little lower, the tail root under it; the waist tucked up to ⅔ of the chest depth
  (`build.tuck 0.73`, the winter coat filling it). The neck (0.25 m, 45° above level, estimate) rises from low between the
  shoulders and carries the head forward of and above them, so the throat line reads from the
  jaw down to the brisket.
- Legs: deltoid and triceps on the upper arm, forearm extensors/flexors over the top third of the
  forearm, the elbow point and the accessory carpal pad behind; quadriceps and hamstrings (the
  winter "breeches", thickened by the coat) on the thigh, the calf tapering into the Achilles
  tendon, stifle and calcaneus knobs. Paws: a palm pad behind four arched toes — the middle two
  lead, the outer two sit back — ≈ 9.5 × 8 cm, claws growing from the toe tips.
- Limb thickness from mass (Campione & Evans 2012): humerus + femur circumference for 40 kg is
  119 mm; the kind sizes the furred upper limb at 2.5 × bone diameter (≈ 4.7 cm radius). The
  test proves a 0.3× "twig-legged" wolf is refused (`T3D_RECIPE_INVALID: allometry`).
- Head: `face.preset: 'canid'` — nose tip ≈ 0.11 × head length (a 4–5 cm nose pad), a stop, upper
  lips that square the muzzle, cheek fur flaring behind the eyes; skull width 0.55 × length
  (130–150 / 230–280 mm).

## Coat logic

Zones (kind defaults, colours from the spec): buff-grey flank `coat` → darker dorsal saddle
`back` → countershaded cream `belly` and throat; `legs` below 42 % of shoulder height, with the
dark `foreline` down the front of each forearm; on the head the pale `muzzle` lips and cheeks,
pale brow spots, the grey `mask` round the eyes and over the bridge, dark ear backs. Grizzle:
`agouti` — banded guard hairs as dark flecks streaked along the hair flow (along the trunk, down
the tail), dense on the saddle and fading out toward the belly. The tail: a winter brush, slim at
the root and fullest past its middle (`tailGirth 3.2`), hanging to the hocks, black tip; its
colour zones follow the chain, so the back of the tail stays dark and its inside pale. Surface:
the `fur_neutral` strip (D24 fix) so the grey-ochre vertex colour is not tinted brown.

## Photos per view (Wikimedia Commons; linked, never committed)

| View | Photo | Licence · author |
|---|---|---|
| Category (Eurasian wolf, many standing views) | [Category:Canis lupus lupus](https://commons.wikimedia.org/wiki/Category:Canis_lupus_lupus) | — |
| Side, standing (Eurasian wolf, summer coat, facing left; vegetation behind) | [Canis lupus - Wildpark Knüll 03.jpg](https://commons.wikimedia.org/wiki/File:Canis_lupus_-_Wildpark_Kn%C3%BCll_03.jpg) | CC BY-SA 3.0 · H. Zell |
| Front, standing in snow (grey wolf, winter coat) | [Standing Wolf (7322993830).jpg](https://commons.wikimedia.org/wiki/File:Standing_Wolf_(7322993830).jpg) | CC BY 2.0 · Ellie Attebery |
| 3/4 front, walking in snow (grey wolf, winter coat) | [Gray Wolf (6545954933).jpg](https://commons.wikimedia.org/wiki/File:Gray_Wolf_(6545954933).jpg) | Public domain · USFWS Midwest Region |
| Head portrait (profile: skull, cheek ruff, ear set) | [Wolf-Standing Tall (41830604430) (profile).jpg](https://commons.wikimedia.org/wiki/File:Wolf-Standing_Tall_(41830604430)_(profile).jpg) | CC BY-SA 2.0 · Arwen_7 |
| Head portrait (3/4) | [Loup gris (Canis lupus).jpg](https://commons.wikimedia.org/wiki/File:Loup_gris_(Canis_lupus_).jpg) | featured picture · Clément Bardot |

Each photo was opened and its view checked image by image (2026-11-15); the earlier table had them
mislabelled (its "3/4 standing" was a face portrait, "side in snow" frontal, "front" lying down).
`bun run ref wolf` fetches the side, front and 3/4 rows, but its segmentation fails on all three
(2026-11-15: the masks pick up vegetation, snow and trees, not the wolf), so no `ref.json` is
committed: a wrong silhouette would mislead photo-match. Needed: plain-background standing side
and front photos (or a segmentation that copes with clutter).

## Biology (held by the kind and the tests)

- Mass: volume × an effective density of the furred volume — flesh 1050 kg/m³ under a 3 cm hair
  shell at ~100 kg/m³ — gives 30–60 kg; QA `mass` passes at ±25 %.
- Balance: QA check `balance` — the centre of mass projects inside the support polygon of the
  paws at every LOD.
- Eyes: 11.5 mm eyeballs (∝ mass^0.2) seated in sockets under lids; QA `connections` checks they
  are enclosed and not staring.
- Creases declared by the kind: mouth line, nostrils, eyelids, ears, armpits, groin, carpal/hock
  folds, toe partings, tail root.

## Critique (honest, from `hero.png`, `sheet.png`, `critique.json`)

Form (2026-11-15 rebuild, creature kind): the trunk is bones + muscles, not three blended blobs —
a deep, narrow ribcage (depth ÷ width 1.8, no blend swell) whose underline rises behind the elbow
into a tucked loin, withers the highest point of the back, scapula and triceps reading on the
shoulder, the biceps femoris / semitendinosus seam on the thigh, a straight narrow forearm with a
small elbow point, small bony stifle and hock. The neck has an oval section, widens toward the
head and runs into the skull behind the jaw angle; the jaw is its own part (hinge pivot); the kind
exports an Armature (spine, neck, head, jaw, tail, four legs × 4 bones).
Weaker than a game-ready wolf up close:
- the trunk still reads long against the legs in a straight side view (head-body, neck and pose
  are the recipe's numbers; a shorter `neck` or a higher `pose.neck` would compact it);
- the head part is lighter than the neck and its cheek lobe still shows a rim from behind (coat
  paint and fur cards are separate work);
- LOD2 legs are 6-sided tubes; paws are rounded spindles — the outline holds.

## Field wear (what makes it a wild wolf, not a zoo one)
`wolf.ts` builds through `defineWildCreature` (`recipes/_lib/creature/wild.ts`, shared with the fox and the bear); the
story is `WOLF_WILD`:

| Mark | Where | How |
|---|---|---|
| Thaw mud | caked on the paws, patchy to 16 cm, flecks to 26 cm | `recipes/_lib/creature/wild-paint.ts` mud layer, world-space hash noise; `grime` ground grade under it |
| Wet fur | darker to the hocks and under the belly | damp layer |
| Matted coat | flank, breeches, behind the shoulder | dark clumped streaks along gravity |
| Scars | two bite lines across the right shoulder, a claw line down the right of the muzzle | pale bare core, parted darker fur either side |
| Nicked ear | left ear, rear rim | rim vertices pulled into the pinna (no triangle cut) |
| Whiskers | 12 a side in rows of 4, 2 brow whiskers | tapered three-sided strands, `whiskers` part on the head bone |
| Coat layer | 2 300 short cards per m² over flanks, shoulders and haunches | merged into the kind's `fur` part, each card on the skin vertex under its root |

Every layer is a function of the world point, so all three LODs carry the same stains. LOD2 also
gets two authored colour blocks the coarse mesh lost: the dark saddle and tawny leg tubes.
