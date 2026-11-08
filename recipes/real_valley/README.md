# Real valley — Yosemite Valley east end, 4 × 4 km, from survey data

## Identity
A map tile meshed from **measured elevation**, not noise: the east end of Yosemite Valley, California,
centred on 37.738° N, 119.553° W (between Curry Village and Mirror Lake), 4 000 × 4 000 m at true
scale, Z up, +X east, +Y north. Inside the tile: **Half Dome** (summit 2 693 m, NE quadrant), **Glacier
Point** (2 199 m overlook, SW quadrant, on the south rim), the flat **valley floor** (~1 210 m),
**Tenaya Canyon** running NE past Half Dome's north face, and the **Merced canyon** climbing SE
towards Vernal Fall. What makes it read as Yosemite: ~1 000 m granite walls rising almost straight
out of a flat glacial floor, and Half Dome's cut face.

## Data (pinned, offline at compile)
| File | What | Source | Licence / credit |
|---|---|---|---|
| `data/dem-yosemite_valley.json` | 257² heights, ≈ 15.6 m spacing, 16-bit at 5 cm steps, sha256 `29f57b2a…` of the heights; six z13 tiles listed with their own sha256 | AWS Terrain Tiles, terrarium encoding, `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/13/{x}/{y}.png` (tiles x 1374–1376, y 3166–3167), fetched 2026-11-07 | Public domain. Required credit (tilezen/joerd [attribution.md](https://github.com/tilezen/joerd/blob/master/docs/attribution.md)): *"United States 3DEP (formerly NED) terrain data courtesy of the U.S. Geological Survey."* Carried in the asset's `sources` and `copyright` (written into the GLB). |
| `data/wikidata-Q925252.json` | Half Dome: elevation 2 693 m, coordinate 37.746, −119.53317 | [Wikidata Q925252](https://www.wikidata.org/wiki/Q925252), revision-pinned URL inside the file | CC0-1.0 |
| `data/wikidata-Q3108318.json` | Glacier Point: elevation 2 220 m, coordinate 37.7308, −119.573 | [Wikidata Q3108318](https://www.wikidata.org/wiki/Q3108318) | CC0-1.0 |

Re-pin (deliberately, then review the diff):
```sh
bun run data dem --centre 37.738,-119.553 --size 4000 --cells 256 --zoom 13 \
  --name yosemite_valley --out recipes/real_valley/data/dem-yosemite_valley.json
bun run data wikidata Q925252 Q3108318 --out recipes/real_valley/data
```
A second fetch on 2026-11-07 gave the same heights hash.

## Specs and cross-checks
| Quantity | Value | Used as | Check |
|---|---|---|---|
| tile | 4 000 × 4 000 m | `real.length` / `width` | design choice |
| Half Dome summit | 2 693 m (Wikidata) | `real.height` and a `measures` entry (summit − datum 1 168 m = 1 525 m, ±2 %) | DEM max 2 692.85 m, DEM within 30 m of the Wikidata coordinate within 10 m (`real_valley.test.ts`); blueprint: 1 524.8 / 1 525 m |
| Glacier Point | Wikidata 2 220 m; NPS and most guides 2 199 m (7 214 ft) | — | The coordinate sits on the cliff edge (the DEM drops ~300 m within 50 m of it); the highest DEM point within 150 m is 2 199.4 m: 0.9 % below Wikidata, inside the 2 % `crossCheck` tolerance. Sources disagree by 21 m; the DEM sides with the guides |
| valley floor | DEM 1 208–1 220 m across the tile's west half | datum = floor(min − 40 m) = 1 168 m | the floor falls only ~12 m over 2 km |

## Photos (by view)
- From Glacier Point towards Half Dome (looking NE, camera az ≈ −154°):
  [Half Dome from Glacier Point — Diliff, CC BY-SA 3.0](https://commons.wikimedia.org/wiki/File:Half_Dome_from_Glacier_Point,_Yosemite_NP_-_Diliff.jpg).
  Compared with `t3d hero --az -154 --el 10` (an orbit view from outside the tile, so Glacier
  Point's own rim is the cut wall in the foreground): Half Dome stands central and highest, its
  shoulder stepping down on its left towards Tenaya Canyon, the north rim (North Dome / Washington
  Column walls, sheer and grey) on the left across the flat valley floor. Clouds Rest, behind Half
  Dome in the photo, lies outside the tile. **Gap:** the photo's NW face is a single
  vertical cut ~600 m tall with a sharp lip; at 15.6 m spacing (z13) the model shows it as a very
  steep stepped face with a rounded lip. z14/z15 tiles would sharpen it at 4× / 16× the data and
  triangles.
- Valley floor from the west (Tunnel View direction):
  [Half Dome with Eastern Yosemite Valley, CC BY-SA 3.0](https://commons.wikimedia.org/wiki/File:Half_Dome_with_Eastern_Yosemite_Valley.jpg).

## Parts the engine needs
`terrain` (one mesh, one draw call): the DEM grid as a heightfield + skirt to z = 0, nature strips
per triangle (cliff on the walls, gravel on talus, moss under the forest, rock strata on the cut
sides). LOD by density: 256 / 128 / 64 cells (133 120 / 33 792 / 8 704 triangles).

## Decisions and open questions
- **No synthetic erosion.** Hydraulic droplets (40 k) and thermal relaxation were tried as "detail
  below the survey"; both rounded Half Dome's face and the valley walls. The survey as measured reads
  more like Yosemite.
- **No water.** The floor falls ~12 m over 2 km: any flat water level floods meadows into a lake
  instead of tracing the Merced (~30 m wide, below the survey's resolution). `terrainFromDEM`'s
  `water` option suits lakes and sea level; a river needs a path (planned with OSM, see
  `docs/idea/23-real-data.md`).
- **Colour is by slope and altitude only** (no land-cover data): the granite domes' 30–45° bare
  backs read partly as forest. Land cover from an open dataset is the fix.
