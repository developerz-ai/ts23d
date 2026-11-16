# city_block — West Village, Manhattan, from OpenStreetMap

One small, attributable block of real city: the West Village between West 10th Street, Bleecker,
Christopher and West 4th Streets, bbox **-74.0045, 40.7335, -74.0030, 40.7345** (≈ 126 × 111 m).
Built from a pinned OpenStreetMap extract, so the massing is the survey's, not a guess.

## Data and licence
| | |
|---|---|
| Extract | `data/osm-west_village.json` (`ts23d-osm/1`: footprints in metres from the bbox centre, x east / y north, `height` / `building:levels` / `min_height`, roads, land use) |
| Fetched | `bun run data osm --bbox -74.0045,40.7335,-74.0030,40.7345 --name west_village --out recipes/city_block/data/osm-west_village.json` on 2026-11-16, OSM API 0.6 `map.json` (the public Overpass mirrors were at capacity) |
| Raw response | sha256 `a8bc787e011cee387fc329b82726c8e66d51596e8d4a8358250fdc67533cb9be` (cache `node_modules/.cache/ts23d/data/`) |
| Licence | **ODbL 1.0**. Credit: "© OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright)". The extract stays ODbL; the built GLB is a **Produced Work** (ADR 015): the credit travels in `copyright` and `sources` and so into the GLB |
| Heights | the NYC building import ([wiki](https://wiki.openstreetmap.org/wiki/New_York_City/Buildings)): every footprint here carries a `height` tag (3.9–22.2 m) |

## Identity
Low-rise 19th-century rowhouses and walk-ups: 3–6 storeys, brick (Federal and Greek-revival red
and brown), brownstone and painted stucco fronts, flat tar roofs behind cornices, deep narrow
lots with rear yards (the light wells in the footprints), party walls without windows.

## Specs
| Dimension | Value | Source |
|---|---|---|
| Buildings | 49 in the extract; those with their centroid in the bbox are built | OSM |
| Heights | per building, `height` tag ±5 % (test) and the four tallest ±2 % (QA `measures`) | OSM `height` |
| Footprints | IoU ≥ 0.9 per building, measured on the compiled mesh's top-down silhouette (test) | OSM ways |
| Storey | 3.2 m (rows of windows; `building:levels` × 3.2 + 0.6 when a building has no `height`) | estimate for NYC walk-ups |
| Street | West 10th Street carriageway 9.5 m (`ROAD_WIDTH.residential`) | estimate |

## Photos (by view)
| View | URL | Notes |
|---|---|---|
| street, West 10th St | https://en.wikipedia.org/wiki/Greenwich_Village (West Village photos) | brick rowhouses, cornices, stoops |
| Bleecker St | https://en.wikipedia.org/wiki/Bleecker_Street | shopfronts on the ground floor |
| aerial | https://www.openstreetmap.org/#map=19/40.7340/-74.0038 | footprints, rear yards |

## Parts the engine needs
`b<osm id>` (walls), `b<id>_cornice`, `b<id>_roof`, `b<id>_windows` (LOD0/1), `streets`,
`ground`. `scene()` exports the windows as one mesh × N with EXT_mesh_gpu_instancing.

## Open questions and known gaps
- Facades are one plain strip per building: polygon prisms have no true-scale brick coursing
  (`mass` lays courses on boxes only), and there are no stoops, shopfronts or fire escapes yet.
- Ground is flat: the block's relief is a few metres at most; `cityPlan({ groundAt })` takes a
  DEM sampler (`terrainFromDEM`) when a site needs it.
- Only West 10th and a stub of Bleecker Street fall inside the bbox; the other street edges show
  the ground slab.
