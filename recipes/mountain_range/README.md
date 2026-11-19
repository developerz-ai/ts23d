# Mountain range — 2 × 2 km alpine map tile (Northern Alps type)

## Identity
A game-map terrain tile, not a landmark: one glacial (U-shaped) valley crossing a 2 × 2 km block,
flanked by ridged massifs whose summits carry snow. What makes it read as *alpine* rather than
"noise hills": **sharp ridgelines with smooth valley floors** (ridged multifractal), **gullies and
debris fans carved by water** (hydraulic erosion), **cliff bands capped at a talus angle** (thermal
erosion), and **altitude zonation**: conifer forest on the valley floor, alpine meadow above the
treeline, bare rock on anything steep, snow above the snowline wherever the slope can hold it.
Three seeded variants (`mountain_range`, `_b`, `_c`) show the seed, valley heading and window
parameters.

## Specs
All values are general alpine figures cited from prior knowledge, **not re-fetched in this session
(unsourced / approximate)**; the coordinator may attach sources.

| Quantity | Value | Used as | Source |
|---|---|---|---|
| tile size | 2000 × 2000 m | `rect` | design choice (map tile) |
| window (tile centre in the seeded field) | — | `offset` (100, −300) / (400, 500) / (300, −400) m | design choice: tallest summit 750 / 453 / 547 m inside the cut |
| valley floor altitude (N. Alps, glacial valleys) | 1000–1800 m | measured 1896 / 1791 / 1784 m (a sits ~100 m high) | unsourced, approximate |
| summit altitude (in a 2 km tile around such a valley) | 2500–3200 m | measured 2683 / 2605 / 2733 m; highest cut point 2560 / 2488 / 2659 m | unsourced, approximate |
| local relief valley → ridge over ~1 km | 700–1200 m | ~950 m | unsourced; more than ~1000 m/km makes mean slopes > 45° |
| treeline (Alps, conifers: spruce, larch, Swiss pine) | 1800–2200 m | 2000 m | unsourced, approximate |
| climatic snowline (Alps, summer; lower on north faces, early season) | 2600–3200 m; patches to ~2300 m in June | 2420 m (early-summer look; b 2350 m, c 2470 m) | unsourced, approximate |
| angle of repose of scree / talus | 30–40° (≈ 34° typical) | thermal `talus` 1.0 (45°) caps cliffs, scree colour on 11–24° deposit fans | unsourced, approximate |
| slope where bare rock dominates | > ~40° | `rockSlope` 0.85 (40°) | unsourced, approximate |
| slope above which snow rarely holds | ~50–55° | snow thins from 35° to none at 53° (`snow.ts`) | unsourced, approximate |
| typical valley-side slope | 25–35° | measured (LOD0 normals): median 33° / 33° / 42° (variants a / b / c), p95 57–65° | unsourced, approximate |

Units: metres, Z up. z = altitude − 1650 m (the `DATUM`), so the tile stands on z = 0 with a
skirt ~100 m below the lowest valley point.

## Photos (by view)
To be added (no web access in this session). Look-alikes to compare against: the Lauterbrunnen and
Grindelwald valleys (U-shaped glacial troughs), the Zillertal Alps, Dolomites screes for debris fans.

## Parts the engine needs
`terrain` (heightfield + skirt walls topped by its own border vertices), `forest` (conifer impostors: 3-sided spires, 1 500 / 1 100 / 110)
and `stream` (the valley's water ribbon): all static, one draw call. LOD by grid density:
256 / 128 / 38 cells (LOD2 inside the 4 k terrain band; budget 140 k / 40 k / 4 k).

## The tile's edge (`field.ts`, `skirt.ts`)
- The field is one function of world position; `offset` picks the window. A neighbour tile (same
  seed, offset ± 2000 m) samples the same raw function along the shared cut.
- Erosion runs on the tile plus 250 m all round and the tile is cropped out, so the border row is
  an interior row of the erosion (eroding the tile alone left that row unrelaxed by thermal
  erosion: an 8 m saw-tooth along the skirt's top). Nothing then edits the boundary: the mesh's
  edge is the eroded field (tested at every LOD). Erosion is per tile, so a neighbour's eroded
  edge matches only where both erosions agree; the raw field matches exactly.
- The skirt walls are built from the surface's border vertices (positions copied), not by
  re-sampling the height, so the skirt's top is the surface's edge to the bit at every LOD.
- Each variant's window keeps its tallest summit well inside the cut; ridges may still run off it,
  as they do on any map tile.

## How the ground is finished (`ground.ts`, shared with `real_valley`)
- Smooth per-vertex colour on one matte strip stretched to macro scale: the old per-triangle strips
  switched material at every triangle border and squeezed V per triangle (diagonal stripe banding).
- Aspect: north faces lose forest ~220 m lower; noise breaks the lines; ±12 % value breakup over
  rock and turf; damp, darker torrent beds where the D8 flow gathers.
- Snow (`snow.ts`) is a smooth cover map, not a per-point threshold: slope, aspect and crest
  convexity are read off a blurred copy of the ground; the line drops 220 m on north faces, lifts
  110 m on south faces and drops 120 m in gullies; snow thins from 35° to none at 53°, is scoured
  off sharp crests, and a strip too narrow to be a snowfield fades out, so no ridge carries a
  one-cell white seam. The hero looks from the north-east (az 35°, el 25°) to see the snowy faces.
- The cut sides carry `rock_strata` with one band over the full 1 200 m wall: beds read as
  formations tens of metres thick, darkening toward the base.
- 160 k erosion droplets per tile area (250 k over the tile + margin); a summit point standing over all eight neighbours is clamped (twice, 8 m)
  so no one-cell needle survives.
- The stream follows the least-cost path along the floor between the valley's lowest border points.

## Open questions
- Snowline: a summer climatic snowline (~2800 m) would leave these summits bare; we chose an
  early-summer look (2420 m; b 2350 m, c 2470 m) so the tile shows the snow band. Raise `snowline` for late summer.
- Neighbour tiles: the raw field matches along a shared cut exactly, the eroded one only roughly
  (each tile erodes its own window; `mountain_range` and its east neighbour differ along the cut
  by median 2.4 m, p90 7 m, max 22 m). Seamless eroded tiling would need erosion anchored to world
  cells (droplets seeded per world cell, or one erosion over the whole map, cut into tiles).
- Real alpine tiles of 2 km rarely hold a full valley-to-summit section; relief is compressed
  (~950 m) to keep slopes plausible at this size. Even so the median slope (33–42°) is at or
  above typical valley sides (25–35°): the ridged noise gives knife-edge crests. Lower `relief` or
  the ridged `gain` for gentler, Pre-Alps terrain.
