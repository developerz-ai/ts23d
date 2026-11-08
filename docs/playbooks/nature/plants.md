# Plants and flowers playbook

Shrubs, hedges, grasses, ferns, flowers, potted plants, crops (wheat, maize), vines, cacti,
succulents. Mostly leaf-card geometry on swept stems; overdraw and triangle budgets dominate.
**Scale from leaf size and plant height**: a leaf is a hand-scale object (2–20 cm for most
temperate plants) and players judge the plant by it.

## Research
Botanical descriptions (RHS plant pages, botanical garden databases, USDA PLANTS) give height,
spread, leaf shape and arrangement (alternate, opposite, whorled, rosette), flower size and colour,
season. Photos: whole plant, leaf close-up (shape, venation), flower close-up, plant in context.

| Plant | Height / spread | Leaf / flower | Notes |
|---|---|---|---|
| lawn grass (mown) | 25–50 mm | blades 2–5 mm wide | uncut meadow 0.3–1 m |
| hedge (privet, beech, yew) | 1–2.5 m, 0.6–1 m thick | leaves 3–10 cm | clipped flat faces |
| fern (bracken / male fern) | 0.6–1.5 / 0.5–1 m | fronds 0.3–1 m | rosette from the crown |
| sunflower | 1.5–3 m | head Ø 0.1–0.3 m, leaves 0.1–0.3 | |
| tulip | 0.3–0.6 m | flower 5–8 cm | |
| rose bush | 0.6–1.5 m | flower 5–12 cm, 5-leaflet leaves | thorns |
| wheat (ripe) | 0.6–1.2 m | ear 5–10 cm | rows 0.12–0.2 m |
| maize | 2–3 m | leaves 0.5–1 m × 0.1 | rows 0.75 m |
| potted houseplant | 0.2–1.5 m | pot Ø 0.12–0.35 | |
| saguaro-type cactus | 3–12 m | ribs 12–24 | arms after 50–70 years |

## Part tree
```
plant: stem_* (sweep, tapered), leaf_* (cutout cards or thin lofts), flower_* (petal cards / lathe)
├── pot (lathe) + soil disc (potted)  ·  root_ball / ground tuft (planted)
└── hedge: core mass (sculpt/box) + leaf cards on the surface only
```
Scatter many plants as one asset (a flower bed, a patch of grass) with seeded `place` and `merge`.

## Motion
| Part | Motion | Axis | Limits |
|---|---|---|---|
| stems / tall grass | sway | X / Y at the base | ±3–8°, 0.4–1 hz |
| flower heads | sway | at the stem top | ±5° |
| crops (field) | sway per patch | | phase-offset per seed |

## Signature details
1. Phyllotaxis: leaves around the stem at 137.5° (golden angle) for alternate arrangements.
2. Leaves droop and curl; the leaf card bends (two or three segments), not a flat plane.
3. Colour variation: young leaves lighter, old leaves darker/yellow; flower colour per seed.
4. Overlapping, irregular density; bare patches; dead leaves at the base.
5. Grass and crops in rows or clumps, never a uniform carpet of identical cards.
6. Hedges: clipped faces with dense small leaves, woody stems visible at the base.

## Materials
Foliage cells (`foliage_broadleaf`, compound and conifer variants) with `cutout` surface;
`grass`, `moss`, `leaf_litter`, `soil` strips; `plastic` / `stone` / `plain` terracotta-tinted
pots; `translucent` for backlit petals if budget allows. Tint per instance via vertex colour.

## LOD policy
- LOD0: individual leaves and petals as bent cards, stems swept. Flower 300–2,000; shrub 3–10k.
- LOD1: leaf clusters as larger cards. 50–800.
- LOD2: 1–4 crossed cards or a low dome with foliage strip. 4–40.
Overdraw kills performance before triangles do: fewer, larger cards at distance.

## QA
```ts
real: { length: 0.6, width: 0.6, height: 0.9 },
checks: [touches('stem_*', 'pot_soil'), touches('pot', 'ground')],
budget: { triangles: [3000, 600, 24] },
```

## Common mistakes
- Flat unbent leaf cards facing the same way.
- Every plant identical in a bed; colours fully saturated.
- Grass taller than its context (lawn grass at 0.3 m).
- Opaque leaves (no `cutout`) or alpha-blended leaves (sorting problems): use `cutout`.

## Reuse
`tree` kind builder in shrub mode (short trunk, many levels), `sweep` (stems), `loft` (thick
leaves, cactus bodies), `lathe` (pots, cacti), foliage cells. [Trees](trees.md), [terrain](terrain.md).

## Sources
- RHS plant database: https://www.rhs.org.uk/plants/search-form
- USDA PLANTS: https://plants.usda.gov/
- Phyllotaxis: https://en.wikipedia.org/wiki/Phyllotaxis
