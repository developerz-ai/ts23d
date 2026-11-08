# Terrain playbook

Heightfield terrain for dioramas and scene bases: mountains, hills, valleys, riverbanks, dunes,
fields, plus presentation plinths under vehicles. Reference recipe:
[`mountain_range`](../../../recipes/mountain_range/README.md). **Scale from slope angles and
relief**: real slopes have characteristic angles (scree 30–37°, grassland < 25°, cliffs > 60°),
and relief per km is what separates hills from mountains.

## Research
Digital elevation models (SRTM 30 m, Copernicus DEM 30 m, national LiDAR at 1–2 m) for real
places — sample a profile to calibrate your noise, never import the data unless its licence
allows. Landform references: glacial (U valleys, cirques, arêtes), fluvial (V valleys, terraces,
meanders), aeolian (dunes: windward 10–15°, slip face 32–34°), karst. Photos at the scale of the
diorama.

| Feature | Typical | Notes |
|---|---|---|
| lowland relief | 10–100 m per km | |
| hills | 100–500 m relief | |
| mountains | 500–3,000 m relief, slopes 25–45° | |
| angle of repose (dry sand / gravel / scree) | 30–35° / 35° / 35–37° | |
| dune slip face | 32–34° | |
| river width : depth | 10–20 : 1 | |
| meander wavelength | 10–14 × channel width | Leopold & Wolman |
| field furrows (ploughed) | 0.25–0.75 m spacing | |
| road verge slope | ≤ 1:3 | |
| diorama base for a vehicle | 1.5–2× the vehicle length | presentation |

## Part tree
```
terrain (heightfield: rect, cells, height(x, y), color(x, y, z)) · skirt (sides of a diorama block)
├── water_* (see water playbook) · road_* / track_* (cut into the heightfield function)
├── rocks (ctx.use boulders), trees (ctx.use trees), grass_* (cards)
└── sockets: spawn points on walkable slopes
```
Drive every feature from the same `height(x, y)` function so props can sample it.

## Motion
Static. Emitters for dust, mist or waterfalls in presentation scenes.

## Signature details
1. Erosion: `hydraulicErosion` for gullies and alluvial fans, `thermalErosion` to settle slopes
   at the angle of repose.
2. Slope-dependent material: grass on flats, rock on steep, scree below cliffs, snow above a line
   and in shaded hollows.
3. Drainage: valleys connect downhill; no pits that would hold water unless they are lakes.
4. Scale cues: paths, fences, single trees, a building — terrain without them has no size.
5. Edges: dioramas have a clean skirt (soil strata) or fade into a ground plane.

## Materials
`grass`, `soil`, `mud`, `sand`, `gravel`, `rock_strata`, `cliff`, `snow`, `ice`, `moss`,
`leaf_litter`, `cobblestone`, `asphalt`, `water` — via `terrainColor` or a `color(x, y, z)`
function, blended by slope, height and curvature.

## LOD policy
- LOD0: cells at 0.25–1 m for dioramas (`cells` is the LOD knob), eroded detail, scattered rocks
  and grass. 20–200k.
- LOD1: half the cells, props reduced. 5–40k.
- LOD2: an eighth of the cells; silhouette ridges kept. 500–4,000.

## QA
```ts
real: { length: 200, width: 200, height: 60 },
checks: [/* custom: max slope on walkable areas < 35° */],
```
Write a custom check `(asset) => CheckFinding[]` that samples slopes where props stand and fails
if a building or road sits on a slope over its limit.

## Common mistakes
- Pure fractal noise: no drainage, no erosion, uniform roughness at every scale.
- One material over the whole surface.
- Mountains with 70° slopes everywhere (unrealistic outside cliffs).
- Props floating because they don't sample the same height function.

## Reuse
`heightfield`, `terrainGrid`, `hydraulicErosion`, `thermalErosion`, `terrainColor`, noise
(`fbm`, `ridged`, `warp`, `terrace`), [rocks](rocks.md), [trees](trees.md), [water](water.md),
[road](../buildings/road-kerb.md).

## Sources
- Copernicus DEM: https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model
- SRTM: https://www.earthdata.nasa.gov/data/instruments/srtm
- Angle of repose: https://en.wikipedia.org/wiki/Angle_of_repose
- Meanders: https://en.wikipedia.org/wiki/Meander
