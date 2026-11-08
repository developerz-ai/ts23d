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
| clear bole / crown base | ≈ 55–60% of height (branches from 14 m, foliage from 13.5 m) | photo-estimated; crowns of mature stands are densest at 50–70% of height (Silva Fennica crown-structure studies) |
| branch angle to the stem | ≈ 80° low in the crown → ≈ 50° at the top (`downAngle` 84, `downAngleV` −34) | https://bbr.nefu.edu.cn/EN/Y2006/V26/I4/490 (var. *mongolica*: mean 45–50°, smaller in the upper crown) |
| primary branches per whorl | ≈ 4 (18 whorl branches over the crown) | same (3.84 primary, 2.80 secondary per whorl) |

## Photos (by view)
| View | URL | Notes |
|---|---|---|
| habit, mature | https://commons.wikimedia.org/wiki/Category:Pinus_sylvestris_(habitus) | flat top, high crown, pads with sky gaps |
| upper bark | https://commons.wikimedia.org/wiki/Category:Pinus_sylvestris_bark | orange flaking bark → `barkTop` |

## Parts the engine needs
`trunk`, `roots`, `crown` (sway) › `branches`, `leaves`, plus `ground` (needle litter).

## How it is built (LOD policy)
- **Species preset `pine`** (`src/kinds/vegetation-presets.ts`): 18 whorl branches (curving up 24°),
  6 side shoots each on their outer 55%, 4 needle tufts (1.6 m crossed brushes) per shoot. Branch
  lengths are set so the *natural* crown is ~9 m across: the kind's fit then scales X/Y by ≈ 1, so
  tufts are not squashed (the old preset grew a 17.5 m crown and squeezed it to 9 m, ×0.52).
- **LOD0** 23 652 triangles: every tuft (404 × 48).
- **LOD1** 5 740: the kind's LOD1 wood with one LOD0 tuft per shoot grown ×1.9 about its centre
  (`lod1.ts`). The kind's flat cluster cards read sparse and twice as light (crown luminance 0.41 vs
  0.17); the thinned tufts measure 0.173 vs LOD0's 0.171.
- **LOD2** 311: the LOD0 tufts are clustered (k-means, `clumps.ts`) into 20 needle pads — flat-
  bottomed hexagonal bipyramids (`impostor.ts`) — then each pad is scaled against LOD0's silhouette
  from eight views (`fit.ts`). The trunk is LOD0's resampled to a pentagon (`trunk.ts`); the leader
  pad peaks on its apex, so the crown provably touches the trunk. Pads use the matte `concrete`
  strip at 0.7 × the tufts' mean colour: on LOD0's shiny `plain` strip a convex solid's sky-facing
  facets render ~50% lighter than the self-shadowed card crown. Measured crown colour in the beauty
  render: LOD0 rgb 0.154/0.178/0.160, LOD2 0.154/0.182/0.160.
- **Silhouette** (`silhouetteReads`, 32 px, hole-filled): LOD0↔LOD2 IoU front 0.879, side 0.865,
  3/4 0.891 (was 0.355 / 0.402 / 0.418 with the kind's lathe blob). `pine.test.ts` holds ≥ 0.85.
- **Bark** (`bark.ts`): the tree kind's wood strip moved onto `bark_pine`. A sweep's seam column and
  cap rims sit at V = v1 of the wood band, which `stripAtV` reads as the next strip; the shared
  `_lib/finish/grove.ts` finish skipped them, leaving one column of untinted, wrong-strip vertices —
  the grey streak down the trunk. The band test here includes its top edge.

## Open questions
Crown spread is not given in most floras; 9 m is estimated from photos of mature open-grown trees.
The branch-angle and whorl figures are from *P. sylvestris* var. *mongolica*, the closest measured
data found. Wikipedia and Woodland Trust were cited from prior knowledge, not re-fetched.
