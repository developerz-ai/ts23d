# Trees playbook

Broadleaf (oak, beech, birch, maple, willow), conifer (pine, spruce, fir), palm, fruit and street
trees, at every age from sapling to veteran. The `tree` kind builder does the botany (Weber–Penn
skeleton, swept branches, leaf cards); your job is the species parameters and the setting.
Reference recipes: [`oak`](../../../recipes/oak/README.md), [`pine`](../../../recipes/pine/README.md),
[`palm`](../../../recipes/palm/README.md). **Scale from height and trunk diameter at breast
height (DBH, measured at 1.3 m)** — forestry data publishes both per species and age.

## Research
Species fact sheets (national forestry services, arboretum and botanical garden pages, the
USDA Silvics manual for North American species), crown shape and branching angle descriptions,
leaf size and arrangement, bark texture photos. Photos: whole tree in leaf (winter photos show the
skeleton — gold for branching), bark close-up, leaf close-up, base (root flare).

| Species (mature, typical) | Height | DBH | Crown | Notes |
|---|---|---|---|---|
| English oak | 20–40 m | 1–2 m (veterans 3+) | broad, as wide as tall | low heavy limbs, tortuous branches |
| European beech | 25–35 | 0.8–1.5 | dense dome | smooth grey bark |
| silver birch | 15–25 | 0.3–0.5 | narrow, weeping twigs | white bark, black diamonds |
| Scots pine | 20–35 | 0.5–1.0 | flat-topped, high crown | orange upper bark |
| Norway spruce | 35–55 | 0.8–1.2 | narrow cone, drooping branchlets | |
| weeping willow | 10–20 | 0.5–1.0 | wide, pendulous | |
| coconut palm | 20–30 | 0.3–0.4 | 25–35 fronds 4–6 m long | trunk leans and curves, swollen base |
| apple (orchard) | 3–6 | 0.15–0.4 | open bowl (pruned) | |
| street tree (plane, lime) | 15–30 | 0.4–1.0 | lifted crown, clear stem 2.5–4 m | |

Rules of thumb: height ≈ 30–70 × DBH (open-grown broadleaf lower ratio, forest conifers higher);
crown width of open-grown oak ≈ height; da Vinci's rule — cross-section area is conserved at each
fork (Σ child r² ≈ parent r²).

## Part tree
```
trunk (static or sway: whole-tree wind ±1°) · root_flare (static, touches the ground)
├── crown (sway Z/X, wind ±2–4°, 0.2–0.4 hz) → branches (swept), leaves (cutout cards)
├── fruit_*, cones_* (LOD0) · dead_branch_* (veterans)
└── ground: leaf_litter disc, roots surfacing, grass tuft ring
```
Use `trees.variant({ name, params: { species: 'oak', … } })` with seeds for a stand; `treeReal`
gives `real` for the proportions gate.

## Motion
| Part | Motion | Axis | Limits |
|---|---|---|---|
| crown | sway | Z or X | ±2–4°, 0.2–0.4 hz |
| palm fronds | sway | own base axis | ±5–10°, 0.3–0.6 hz |
| whole tree | sway | X | ±0.5–1° (strong wind) |

Per-vertex wind weights are planned (roadmap); today crowns sway as a group.

## Signature details
1. Root flare: the trunk widens 1.5–2× into the ground with surface roots.
2. Trunk taper and lean; branch collars at every fork; no perfectly straight cylinders.
3. Branching angle per species (oak 40–70°, birch acute and weeping, spruce horizontal-drooping).
4. Leaf clusters on twigs at the crown surface; the interior is mostly bare branches.
5. Bark texture by species and age (smooth young, furrowed old).
6. Crown gaps and asymmetry from light competition; dead twigs inside the crown.
7. Seasonal variant: winter skeleton, autumn colours via vertex colour on the leaf cards.

## Materials
Nature strips: `bark_oak`, `bark_pine`, `bark_birch` (trunks and branches), foliage cells
(`foliage_broadleaf` and friends, `cutout` surface), `leaf_litter` / `moss` / `grass` / `soil`
for the base. Tint leaves per tree with `ctx.rng` (±5–10 % hue/value). Moss on the north / shaded
side of trunks via vertex colour.

## LOD policy
- LOD0: branches 4 levels deep, leaf cards per twig, root flare, bark relief. 15–60k.
- LOD1: 2–3 branch levels, leaf cards clustered larger. 3–8k.
- LOD2: trunk + a few crown masses or crossed billboards (impostors planned). 100–400.

## QA
```ts
real: treeReal(params),           // height, crown width from the species preset
checks: [touches('trunk', 'ground'), touches('crown', 'trunk')],
budget: { triangles: [40000, 6000, 300] },
```
Add `measures` for the DBH when you have a sourced value: `{ label: 'DBH', axis: 'y', value: 1.2, parts: ['trunk_dbh'] }`.

## Common mistakes
- Lollipop trees: a straight cylinder with a sphere on top.
- Trunk with no flare, floating on or sinking into the ground.
- Leaf cards filling the whole crown volume (overdraw, and the crown reads as a blob).
- Every tree in a forest identical — vary seed, height, lean, and tint.
- Branches thicker than the trunk sum (breaks da Vinci's rule).

## Reuse
`tree`, `trees`, `treeReal`, `SPECIES` (oak, pine, palm, birch, willow) kind builders; `sweep`
(custom branches), `sculpt` (veteran trunk burls), `heightfield` for the setting.
[Plants](plants.md) for shrubs and hedges.

## Sources
- Weber & Penn, *Creation and Rendering of Realistic Trees* (SIGGRAPH 1995): https://dl.acm.org/doi/10.1145/218380.218427
- USDA Silvics of North America: https://www.srs.fs.usda.gov/pubs/misc/ag_654/table_of_contents.htm
- Diameter at breast height: https://en.wikipedia.org/wiki/Diameter_at_breast_height
- Species pages: https://en.wikipedia.org/wiki/Quercus_robur · https://en.wikipedia.org/wiki/Pinus_sylvestris
