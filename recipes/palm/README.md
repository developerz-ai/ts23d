# Palm — coconut palm (*Cocos nucifera*), mature

## Identity
The tall variety, typical of beaches. Signature features: a **slender, ringed, bowed stem** of
nearly constant diameter, slightly swollen at the base; a **starburst crown of ~20–30 pinnate
fronds** whose leaflets hang in a V and whose lower fronds droop below horizontal; and **coconuts
clustered under the frond bases**.

## Specs
| Dimension | Value (m) | Source |
|---|---|---|
| height | 20 (up to 30) | https://en.wikipedia.org/wiki/Coconut |
| stem diameter | 0.35 (typical 0.3–0.4) | https://en.wikipedia.org/wiki/Cocos_nucifera · photo-estimated |
| frond length | 4–6 (model: ≈ 5.2) | Wikipedia "Coconut": "pinnate leaves 4–6 m long" |
| crown spread | 9 (≈ 2 × horizontal frond reach) | derived from frond length and droop |
| fronds | 22 (live crown holds ~25–30) | Wikipedia (above) |

## Photos (by view)
| View | URL | Notes |
|---|---|---|
| habit | https://commons.wikimedia.org/wiki/Category:Cocos_nucifera_(habitus) | bowed stem, crown back over the base |
| crown detail | https://commons.wikimedia.org/wiki/Category:Cocos_nucifera_leaves | V-folded leaflets |

## Parts the engine needs
`trunk` (ringed stem + crown shaft), `roots` (root plate), `crown` (sway) › `branches` (rachises,
dead rachises + coconuts), `leaves` (leaflets, dead leaflets), plus `ground` (sand).

## How it is built (LOD policy)
- **Stem** (`stem.ts`): the kind's trunk (a ring every ~1.7 m) resampled with a leaf-scar ring every
  0.22 m (LOD0: a 7 % groove, dark scar, pale band; LOD1: colour bands every 0.5 m), greyer low
  down; the grooves cut inward only and the stem is rescaled to the kind's Y extent, so the DBH
  measure holds. Crown shaft: tiers of fibrous frond boots wrap the top 1.1 m.
- **Root ball**: the kind's buttress lobes widened × 1.3 about the stem axis.
- **Coconuts**: 14 at ~0.3 m under the frond bases (LOD0).
- **Wear** (`fronds.ts`): the oldest, lowest fronds brown toward their tips; three dead fronds
  hang straw-brown below the crown (a skirt), leaflets collapsed.
- **LOD2**: every LOD0 frond read back from the kind's leaflet mesh and redrawn as one bent
  cutout card on the `foliage_palm` cell along its own rachis and leaflet tips (6 triangles), tinted
  by the frond's own shade and browning: the far crown keeps its fronds and colour instead of a
  few solid dark blades (silhouette IoU 0.72 / 0.61 / 0.78 vs 0.67 / 0.61 / 0.65 before).

## Open questions
The stem bows (lean 12°, curving back by 24°) so the crown sits back over the base and the
footprint stays at the crown spread; strongly leaning shoreline palms would also need `real.length`
widened. Sources were cited from prior knowledge and not re-fetched in this session.
