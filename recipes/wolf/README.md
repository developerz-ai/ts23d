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
| Skull | 0.23–0.28 long, 0.13–0.15 wide | head **0.265** long, width 0.55 × length | same |
| Ears | 0.09–0.11 high, "relatively small and triangular" | **0.10**, erect blades with a pale cup | same |
| Winter fur | back 60–70 mm; shoulders ≤ 90, up to 110–130 (a crest on the neck) | coat shell 3 cm (mass gate), mane 4 cm (`build.ruff`) | same |

Overall box (`real` length/width/height 1.31 × 0.27 × 0.90 m) is measured off the posed skeleton:
nose → hanging tail, paw to paw, paws → ear tips. The sourced numbers above are what the tests hold.

## Skeleton and stance

- **Digitigrade** (`stance: 'digitigrade'`): wrist and hock clear of the ground; the hock at
  ~0.28 × shoulder height; elbow back at the bottom of the chest, stifle forward at the belly.
- Side view (kind defaults for quadrupeds, wolf numbers): chest depth ½ the withers
  (`build.depth 0.5`) so the elbow sits at the chest floor ≈ 0.40 m; a narrow chest
  (`width 0.55` × depth ≈ 0.22 m); the topline highest at the withers, a slight dip behind them,
  the croup a little lower, the tail root under it; the waist tucked up to ⅔ of the chest depth
  (`build.tuck 0.66`). The neck (0.28 m, 40° above level, estimate) rises from low between the
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

| View | Photo |
|---|---|
| Category (Eurasian wolf, many standing side views) | [Category:Canis lupus lupus](https://commons.wikimedia.org/wiki/Category:Canis_lupus_lupus) |
| 3/4 front, standing | [Loup gris (Canis lupus).jpg](https://commons.wikimedia.org/wiki/File:Loup_gris_(Canis_lupus_).jpg) (featured picture, Clément Bardot) |
| Side, standing in snow (winter coat, tail hang) | [Canis lupus standing in snow.jpg](https://commons.wikimedia.org/wiki/File:Canis_lupus_standing_in_snow.jpg) |
| Front / face | [Endangered gray wolf (Canis lupus).jpg](https://commons.wikimedia.org/wiki/File:Endangered_gray_wolf_(Canis_lupus).jpg) |

The file names were found by search; the views were not checked image by image (unverified).

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

Reads as a grey wolf from the side: deep chest over long legs with the elbow at the chest floor,
a tucked waist, neck rising forward to a heavy canid head with a stop, bushy black-tipped tail
hanging to the hocks, darker saddle over buff flanks, cream underparts, dark forelegs lines.
Weaker than a game-ready wolf up close:
- fur is a smooth shell: no guard-hair clumps or strands, the mane is a soft swell (fur shells /
  cards are planned); the grizzle is vertex colour at ~1 cm, so it reads as soft streaks;
- ears are still thin blades (broader at the base now); the cheek fur is a smooth lobe;
- toes read slightly lilac under the cool key light (grey-buff coat, dark pads underneath);
- LOD2 legs are 6-sided tubes; paws are rounded spindles — the outline holds (IoU ≥ 0.92).
Next: fur shells/cards, a jaw part that opens, tail as its own swaying part, per-zone hair flow.
