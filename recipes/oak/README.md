# Oak — English oak (*Quercus robur*), mature open-grown specimen

## Identity
A parkland/field oak rather than a forest-grown one: open-grown oaks are as wide as they are tall,
which is the silhouette people recognise. Signature features: a **short, massive bole** (1–1.5 m)
that splits low into **several thick, sinuous, near-horizontal limbs**; a **broad domed crown**;
dense dark-green foliage in lobed clusters; a buttressed root flare.

## Specs
| Dimension | Value (m) | Source |
|---|---|---|
| height (mature) | 20 (range 20–40) | https://en.wikipedia.org/wiki/Quercus_robur · https://www.woodlandtrust.org.uk/trees-woods-and-wildlife/british-trees/a-z-of-british-trees/english-oak/ |
| crown spread | 24 (open-grown: as wide as tall or wider, a broad low dome) | Woodland Trust (above): "broad, spreading crown" |
| trunk diameter at breast height (1.3 m) | 1.3 (girth ≈ 4.1 m; Wikipedia gives 4–12 m girth for mature trees) | Wikipedia (above) |
| crown base (clear bole) | ≈ 4 m | photo-estimated |

## Photos (by view)
| View | URL | Notes |
|---|---|---|
| side, open-grown | https://commons.wikimedia.org/wiki/Category:Quercus_robur_(habitus) | crown ≈ as wide as tall |
| bole + limbs | https://commons.wikimedia.org/wiki/Category:Quercus_robur_trunks | low split, sinuous limbs |
| leaves | https://commons.wikimedia.org/wiki/Category:Quercus_robur_leaves | lobed outline → `lobed` card |

## Parts the engine needs
`trunk` (with the snapped dead limb), `roots` (flare), `crown` (sway group, 2° @ 0.4 Hz about X) ›
`branches` (with a dead limb in the crown), `leaves` (cutout), plus `fallen_limb` and `ground`
(field grass worn to soil under the crown).

## How it is built (LOD policy)
- **Species preset `oak`** with this tree's overrides (`OAK` in `oak.ts`): crown base at 15% of
  height, 11 long first-order limbs leaving almost level (78° → 44° up the bole) with an S-bend,
  heavier limbs (ratio power 0.95), and many small `strand` cards. Skeleton seed 14: the most even
  crown of seeds 0–29 (centroid 0.1 m off the bole), so the dome is not lopsided.
- **Leaves** (`leaf-cards.ts`): every kind card becomes one hexagonal cutout twig card on the
  `foliage_broadleaf` cell (painted serrated leaves), same root, length and baked crown shade; the
  hexagon follows the painted cluster, so the empty cell corners are not drawn even where alpha is
  not tested. Cards are shrunk about their root to stay inside the kind's fitted envelope (height
  and spread measures) and 1.2 m over the ground (the crown's sway). Then two-tone
  (`../_lib/trees/tone.ts`): warm yellow-green on the sunny outer shoulder, cool dark green in the
  crown's cave, by each card's place in the crown, so sun and shade read as colour blocks.
- **LOD2**: the LOD0 cards clustered (k-means, `../_lib/trees/clumps.ts`) into 15 clumps of three crossed
  twig cards (12 triangles each), ±2.6 standard deviations across, tinted 0.72 × the clump's own
  (two-tone) mean, over LOD0's trunk resampled to a
  pentagon and four limbs to the outermost low clumps: the bole stays visible. `oak.test.ts` holds
  the 32 px silhouette IoU ≥ 0.85 from front, side and 3/4 (the kind's lathe blob fails it).
- **Wear** (`wear.ts`): moss on the north foot, pale lichen blotches on sky-facing bark, a snapped
  dead limb with a jagged break on the bole (merged into `trunk`, inside its Y extent so the DBH
  measure holds), a long bare dead limb out of the fork under the crown towards the hero camera
  (in `branches`, so it sways with the crown), and a fallen forked limb in the grass.
- **Ground** (`../_lib/trees/floor.ts`): an irregular 8 m patch on the `grass` strip, mottled at metre
  scale with bare soil and brown litter near the bole, full grass at the rim.
- **Hero**: `hero: { elDeg: 10 }`, low, so the dome reads wider than tall.

## Open questions
Sizes vary enormously with age and site (20–40 m). We model a ~150-year field oak 20 m tall and 24 m across with
1.3 m DBH. Sources were cited from prior knowledge and not re-fetched in this session; re-check the
numbers if a specific specimen is wanted.
