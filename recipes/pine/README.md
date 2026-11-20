# Pine — Scots pine (*Pinus sylvestris*), mature

## Identity
The mature form, not the conical sapling. A sapling would read as a generic Christmas-tree conifer;
an old Scots pine is unmistakable. Signature features: a **long, clean, slightly sinuous bole**
(the crown sits in the top ~45%); bark that is **grey-brown and plated low down and turns
orange-red higher up**; a **flat-topped, irregular crown** of **whorled, near-level branches that
turn up at the tips**; foliage in **clumped, layered pads of dark blue-green needles with sky
between them**, not a solid cone and not a bare frame.

## Specs
| Dimension | Value | Source |
|---|---|---|
| height (old, open-grown) | 22 m (range 20–35; open-grown trees stay lower and stouter than stand trees) | https://en.wikipedia.org/wiki/Pinus_sylvestris |
| trunk diameter at breast height | 0.9 m (up to 1 m; an old open-grown tree: height ÷ DBH ≈ 24, where 25 m on 0.72 m read as a pencil pole), tapering to 0.55 × at the top | Wikipedia (above) |
| crown spread | 11.5 m (typical 6–12; an old open-grown tree's flat umbrella is at the wide end) | https://www.woodlandtrust.org.uk/trees-woods-and-wildlife/british-trees/a-z-of-british-trees/scots-pine/ · photo-estimated |
| clear bole / crown base | ≈ 65–70% of height for an old tree (branches from ~17 m; a flat crown ≈ 1/3 of height) | photo-estimated; crowns of mature stands are densest at 50–70% of height (Silva Fennica crown-structure studies) |
| branch angle to the stem | ≈ 80° low in the crown → ≈ 50° at the top (`downAngle` 84, `downAngleV` −34) | https://bbr.nefu.edu.cn/EN/Y2006/V26/I4/490 (var. *mongolica*: mean 45–50°, smaller in the upper crown) |
| primary branches per whorl | ≈ 4 (18 whorl branches over the crown) | same (3.84 primary, 2.80 secondary per whorl) |

## Photos (by view)
| View | URL | Notes |
|---|---|---|
| habit, mature | https://commons.wikimedia.org/wiki/Category:Pinus_sylvestris_(habitus) | flat top, high crown, pads with sky gaps |
| upper bark | https://commons.wikimedia.org/wiki/Category:Pinus_sylvestris_bark | orange flaking bark → `barkTop` |

## Parts the engine needs
`trunk`, `roots`, `crown` (sway) › `branches` (with one dead branch), `leaves` (cutout), `cones`
(LOD0), plus `stubs` (dead branch stubs on the bole) and `ground` (needle litter).

## How it is built (LOD policy)
- **Species preset `pine`** with this tree's overrides (`PINE` in `pine.ts`): crown base at 60% of
  height (two loose tiers of whorls with limbs showing between the pads), 18 whorl branches leaving level (90° → 86°, lengths ±15%) so the top whorls spread as
  wide as the lower ones (flat top, not a spire), heavier limbs (ratio power 0.95), a bole that keeps its girth (`taper` 0.55: ~0.7 × DBH at two-thirds height; 0.12 drew a pencil pole). The kind still
  grows a ball, so every crown-frame mesh is then pulled up into the top 60% of its depth under the
  same top (`../_lib/trees/squash.ts`, `CROWN_SQUASH`): a shallow umbrella wider than it is deep,
  6 needle tufts per shoot. Skeleton seed 5: the most even crown of seeds 0–29.
- **Needles**: every kind needle brush becomes one hexagonal cutout card on the `foliage_needles`
  cell (painted pine needle sprays), same root, length and baked crown shade
  (`../_lib/trees/leaf-cards.ts`). LOD1 keeps one LOD0 tuft per shoot grown × 2.1 (`lod1.ts`).
- **LOD2**: the LOD0 needle cards clustered (k-means, `clumps.ts`) into 20 clumps of three crossed
  needle cards (12 triangles each, hexagonal: blunt pad tops, no shards), ±2.7 standard deviations
  across, over LOD0's trunk resampled to a pentagon (`trunk.ts`) whose leader runs into the top
  clump. `pine.test.ts` holds the 32 px silhouette IoU ≥ 0.85 (front 0.87, side 0.87, 3/4 0.89).
- **Bark** (`bark.ts`): the tree kind's wood strip moved onto `bark_pine`, seam-safe (a sweep's seam
  column sits at V = v1 of the wood band, which `stripAtV` reads as the next strip), graded darker
  grey-brown below 6 m to the orange upper bark from ~14 m.
- **Wear** (`wear.ts`): a Scots pine self-prunes, so the clear bole carries 7 whorls of short
  silver-grey dead stubs; one bare dead branch at the crown base (below the lifted live crown);
  a lightning strip 0.6–8 m up the bole facing the hero camera (a weathered-wood patch 2 cm proud of
  the bark, dark weeping rim, LOD0/1: the trunk's rings are 2 m apart, too coarse to paint it);
  cones (3–7.5 cm) in twos and threes under the outer shoots (LOD0); moss on the north foot;
  needle litter (LOD2: flat colour on the `plain` row, the litter tint times the strip's mean albedo,
  since one fan of long triangles cannot carry the strip without streaks). The dead stubs run up
  to 55% of the height, clear of the crown's sway. Needles a greyish blue-green (`#5b7f78`, the preset's `#24422e` read as dark broadleaf clumps), cards lifted and tinted bluer (`CARDS.tint` 1.1 / 1.28 / 1.45; the painted cell is green, so the shift is capped at full value).
- **Hero**: `hero: { elDeg: 8 }`, low, so the flat crown's underside and the scarred bole face the lens.

## Open questions
Crown spread is not given in most floras; 11.5 m is estimated from photos of old open-grown trees.
The branch-angle and whorl figures are from *P. sylvestris* var. *mongolica*, the closest measured
data found. Wikipedia and Woodland Trust were cited from prior knowledge, not re-fetched.
