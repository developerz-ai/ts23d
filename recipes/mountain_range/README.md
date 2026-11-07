# Mountain range — 2 × 2 km alpine map tile (Northern Alps type)

## Identity
A game-map terrain tile, not a landmark: one glacial (U-shaped) valley crossing a 2 × 2 km block,
flanked by ridged massifs whose summits carry snow. What makes it read as *alpine* rather than
"noise hills": **sharp ridgelines with smooth valley floors** (ridged multifractal), **gullies and
debris fans carved by water** (hydraulic erosion), **cliff bands capped at a talus angle** (thermal
erosion), and **altitude zonation**: conifer forest on the valley floor, alpine meadow above the
treeline, bare rock on anything steep, snow above the snowline wherever the slope can hold it.
Three seeded variants (`mountain_range`, `_b`, `_c`) show the seed + valley-heading parameters.

## Specs
All values are general alpine figures cited from prior knowledge, **not re-fetched in this session
(unsourced / approximate)**; the coordinator may attach sources.

| Quantity | Value | Used as | Source |
|---|---|---|---|
| tile size | 2000 × 2000 m | `rect` | design choice (map tile) |
| valley floor altitude (N. Alps, glacial valleys) | 1000–1800 m | measured 1853 / 1751 / 1775 m | unsourced, approximate |
| summit altitude (in a 2 km tile around such a valley) | 2500–3200 m | measured 2702 / 2714 / 2773 m | unsourced, approximate |
| local relief valley → ridge over ~1 km | 700–1200 m | ~950 m | unsourced; more than ~1000 m/km makes mean slopes > 45° |
| treeline (Alps, conifers: spruce, larch, Swiss pine) | 1800–2200 m | 2000 m | unsourced, approximate |
| climatic snowline (Alps, summer; lower on north faces, early season) | 2600–3200 m; patches to ~2300 m in June | 2480 m (early-summer look; variant c 2550 m) | unsourced, approximate |
| angle of repose of scree / talus | 30–40° (≈ 34° typical) | thermal `talus` 1.0 (45°) caps cliffs, scree colour on 11–24° deposit fans | unsourced, approximate |
| slope where bare rock dominates | > ~40° | `rockSlope` 0.85 (40°) | unsourced, approximate |
| slope above which snow rarely holds | ~50–55° | `snowSlope` 1.2 (50°) | unsourced, approximate |
| typical valley-side slope | 25–35° | measured (LOD0 normals): median 36° / 40° / 43° (variants a / b / c), p95 ≈ 65° | unsourced, approximate |

Units: metres, Z up. z = altitude − 1650 m (the `DATUM`), so the tile stands on z = 0 with a
skirt ~100 m below the lowest valley point.

## Photos (by view)
To be added (no web access in this session). Look-alikes to compare against: the Lauterbrunnen and
Grindelwald valleys (U-shaped glacial troughs), the Zillertal Alps, Dolomites screes for debris fans.

## Parts the engine needs
`terrain` (one mesh, one draw call): heightfield + skirt. LOD by grid density: 256 / 128 / 64 cells.

## Open questions
- Snowline: a summer climatic snowline (~2800 m) would leave these summits bare; we chose an
  early-summer look (2480 m) so the tile shows the snow band. Raise `snowline` for late summer.
- Real alpine tiles of 2 km rarely hold a full valley-to-summit section; relief is compressed
  (~950 m) to keep slopes plausible at this size. Even so the median slope (36–43°) is steeper
  than typical valley sides (25–35°): the ridged noise gives knife-edge crests. Lower `relief` or
  the ridged `gain` for gentler, Pre-Alps terrain.
