# wolf — grey wolf, adult, relaxed standing, winter coat

*Canis lupus lupus* (Eurasian wolf). The proof recipe of the `creature` kind
([roadmap M4](../../docs/plans/roadmap.md#m4-creatures), [09-kinds](../../docs/idea/09-kinds.md)):
`recipes/_lib/creature/wolf-spec.ts` is the dossier below as one `CreatureSpec` (≈ 95 lines; shared:
the fox and the bear derive from it), `wolf.ts` the asset, `wild.ts` the season outdoors, `head.ts` the
wolf's own ear cones and deep muzzle over the kind's head (`options.head`), and
`recipes/_lib/creature/limb-marks.ts` the leg landmarks (`options.body`: elbow point, carpal pad and
broad carpus, patella, the hock's point, Achilles cord and the hollow before it, grooves splitting
the toes; LOD0/1, none on the far tubes); skeleton landmarks, digitigrade
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
| Skull | 0.23–0.28 long, 0.13–0.15 wide | head **0.29** long (a large male's 0.28 skull + fur), furred width 0.72 × length (skull 0.55 + ~2.3 cm of winter coat a side), muzzle 0.36 of the head (shorter and deeper: a longer, thinner one read as a coyote) with a blunt 0.15 tip and a deep muzzle cone under it (`head.ts`; a slimmer one read as a coyote) | same |
| Coat | winter guard hairs 60–70 mm mid-back; shoulders usually ≤ 90 mm, up to 110–130 mm (the mane/"cape"); dense short underfur | fur cards by zone; coated outline width **0.29** vs body 0.27–0.28 (`real.width` is the coated box) | same, "Description" (fur) |
| Ears | 0.09–0.11 high, "relatively small and triangular" | **0.09**, broad-based (`face.earWidth 1.4`): a pale-cupped blade backed by a furred cone (`head.ts`), so the ear holds a triangle from every side | same |
| Winter fur | back 60–70 mm; shoulders ≤ 90, up to 110–130 (a crest on the neck) | coat shell 3 cm (mass gate), mane 5 cm (`build.ruff 0.052`) | same |

Overall box (`real` length/width/height 1.31 × 0.29 × 0.90 m) is measured off the posed skeleton:
nose → hanging tail, coat to coat (no card passes 0.148 m off the midline: `WOLF_WILD.box`),
paws → ear tips. The sourced numbers above are what the tests hold.

## Skeleton and stance

- **Digitigrade** (`stance: 'digitigrade'`): wrist and hock clear of the ground; the hock at
  0.25 × shoulder height (`build.hock`; the kind's 0.28 gave a long hind cannon), standing 0.04
  of the trunk behind the hip (`build.heel`; further back, the bigger head puts more than 66 % of
  the weight on the forelegs); elbow back at the bottom of the chest, stifle forward at the belly.
- Side view (kind defaults for quadrupeds, wolf numbers): chest depth over ½ the withers
  (`build.depth 0.54`: a wolf is deeper through the chest than a coyote) so the elbow sits at the
  chest floor ≈ 0.37 m; a narrow chest (`width 0.5` × depth ≈ 0.22 m); sturdy legs (`limbs 1.15`
  × the allometric limb, set a little closer: `track 0.31`); a level back: the croup's muscle mass
  raised by `build.topline` (0.08 H at 0.18 of the way from croup to withers; without it the back
  fell 6 cm from shoulder to hip, a hyena's line), the tail root under it; the waist tucked up to ⅔ of the chest depth
  (`build.tuck 0.78`, the winter coat filling it). The neck (0.23 m, 44° above level, `pose.neck`; estimate) rises from low between the
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
- LOD2 legs are 8-sided tubes; paws are rounded spindles — the outline holds.

## Field wear (what makes it a wild wolf, not a zoo one)
`wolf.ts` builds through `defineWildCreature` (`recipes/_lib/creature/wild.ts`, shared with the fox and the bear); the
story is `WOLF_WILD` (`wild.ts`). With `cardWear` the fur cards carry it too: each card takes the wear from
the skin under its root (not from where its tip hangs) and keeps 0.55 of its length over caked mud and
0.3 on a scar (a matted streak darkens whole cards; shortened as well, they stood as dark stubs):

| Mark | Where | How |
|---|---|---|
| Thaw mud | caked wet and near-black on the paws, graded up the legs in runs narrower than the leg to ≈ 0.26 m, splashed in flecks to the elbows | `recipes/_lib/creature/wild-paint.ts` mud layer (graded from the toes, never paler than the clay), world-space hash noise; `grime` ground grade under it |
| Wet fur | darker to the wrists and hocks (0.26 m) and under the belly | damp layer |
| Dried and wet clay | a grey-brown crust on the right haunch and the point of the right shoulder; wet dark mud on the right lower flank and brisket where it lay down, each a hand or two across | `patches` |
| Matted coat | flank, breeches, behind the shoulder | dark clumped streaks 2 cm wide along gravity |
| Scars | two bite lines across the right shoulder (3.2 and 1.6 cm), a claw line down the right of the muzzle | the hair grown back a shade paler and greyer than the coat round it (`scarColour` as a function of the coat) and a third as long, a darker parting either side (a pink core, then a fixed pale `#b4a991` core, read as paint strokes; a dark one vanished into the grizzle) |
| Nicked ear | right ear (the hero's side), rear rim | rim vertices pulled into the pinna (no triangle cut) |
| Whiskers | 12 a side in rows of 4, 2 brow whiskers | tapered three-sided strands, `whiskers` part on the head bone |
| Locks | the whole coat, 3.2 cm across and 6× as long, along the hair's lie | `locks`: tone painted on the skin and the cards (`lockTone`), LOD0/1 |
| Face | brow shelf, cheekbone and the hollow under each eye; a dark lid rim; a velvet of short cards (9 000 per m², 1.6–3.2 cm) over the face off the bare nose, lips and eye rims | `recipes/_lib/creature/wild-head.ts`: `facePlanes` (via `head.ts`), `faceFur` (`groom` head layer joined into the kind's `head_fur`) |
| Coat layer | 3 300 short cards per m² (tone 0.78 → 1.3 root to tip) and 520 clumped pale-tipped guard locks per m² over flanks, shoulders, haunches and upper legs | merged into the kind's `fur` part, each card on the skin vertex under its root |

The hero camera (`hero: { azDeg: -52, elDeg: 10 }`) turns the scarred, mud-splashed right side to the
lens. LOD2 (3.9 k triangles, finer cells than the kind's default) is painted as the animal's colour
blocks at the value the near coat reads at under its cards — the dark grizzled saddle (back × 0.5)
over the back and halfway down the flanks, shaded tawny lower flanks and thighs (coat × 0.38),
a shaded cream underside and a half-strength cream chest forward of the shoulders only, the brush in
the saddle's grizzle, legs tawny below the elbow and stifle and darkening toward the paws — instead
of the sculpt's per-vertex grizzle (checkers on 6 cm cells; a plain `coat` colour read pale tan at
the switch; the chest cream on every front-facing cell and the pale dried-clay patches lit the far
thigh tube and shoulder as flat pale slabs, D482), keeps a fringe of locks down the mane, back and
brush (no flank shag: flat 3 cm cards there read as slabs too), and carries only the broad wear
layers (mud band, damp; the pale clay patches are `far: false`): flecks, streaks and scars alias there.
Triangles: 107 k / 29 k / 3.9 k (band 150 k / 30 k / 4 k; body cell × 1.6 at LOD0 — 14 mm — and
× 1.05 at LOD1 to stay inside it; at × 1.45 with the split toes LOD0 reached 120 k).
