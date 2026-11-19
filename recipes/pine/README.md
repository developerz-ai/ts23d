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
| height (mature) | 25 m (range 25–35) | https://en.wikipedia.org/wiki/Pinus_sylvestris |
| trunk diameter at breast height | 0.6 m (up to 1 m) | Wikipedia (above) |
| crown spread | 9 m (typical 6–12) | https://www.woodlandtrust.org.uk/trees-woods-and-wildlife/british-trees/a-z-of-british-trees/scots-pine/ · photo-estimated |
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
- **Species preset `pine`** with this tree's overrides (`PINE` in `pine.ts`): crown base at 68% of
  height (crown ≈ 32% deep: an old tree's shallow, flat-topped crown), 16 whorl branches leaving
  near level (86° → 74°) so the top whorls spread as wide as the lower ones (flat top, not a spire),
  6 needle tufts per shoot. Skeleton seed 5: the most even crown of seeds 0–29.
- **Needles**: every kind needle brush becomes one hexagonal cutout card on the `foliage_needles`
  cell (painted pine needle sprays), same root, length and baked crown shade
  (`../oak/leaf-cards.ts`). LOD1 keeps one LOD0 tuft per shoot grown × 2.1 (`lod1.ts`).
- **LOD2**: the LOD0 needle cards clustered (k-means, `clumps.ts`) into 20 clumps of three crossed
  needle cards (12 triangles each, hexagonal: blunt pad tops, no shards), ±3.6 standard deviations
  across, over LOD0's trunk resampled to a pentagon (`trunk.ts`) whose leader runs into the top
  clump. `pine.test.ts` holds the 32 px silhouette IoU ≥ 0.85 (front 0.90, side 0.86, 3/4 0.89).
- **Bark** (`bark.ts`): the tree kind's wood strip moved onto `bark_pine`, seam-safe (a sweep's seam
  column sits at V = v1 of the wood band, which `stripAtV` reads as the next strip), graded darker
  grey-brown below 6 m to the orange upper bark from ~14 m.
- **Wear** (`wear.ts`): a Scots pine self-prunes, so the clear bole carries 7 whorls of short
  silver-grey dead stubs; one bare dead branch at the crown base; cones (3–7.5 cm) in twos and
  threes under the outer shoots (LOD0); moss on the north foot; needle litter.

## Open questions
Crown spread is not given in most floras; 9 m is estimated from photos of mature open-grown trees.
The branch-angle and whorl figures are from *P. sylvestris* var. *mongolica*, the closest measured
data found. Wikipedia and Woodland Trust were cited from prior knowledge, not re-fetched.
