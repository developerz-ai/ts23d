# 23 · Real data: pinned, offline, licence-tracked inputs

> Owner: "code is also good to get real data from many sources."

A recipe should not retype a number the world already publishes, and a terrain should not be noise
when the survey exists. But ts23d's first rule is **deterministic or broken**: same source + seed =
same bytes, compile offline. Real data fits only if it arrives the way CC0 textures do
(`scripts/textures.ts`): a script fetches once, verifies, and leaves a **small pinned file** the
recipe commits and imports. Compile reads that file; it never touches the network.

## The contract for every source
| Piece | Rule |
|---|---|
| Fetch | `bun run data <source> …` (scripts/, may use the network). Raw responses go to the gitignored cache `node_modules/.cache/ts23d/data/<sha256>.*` |
| Pin | The committed file carries the exact URL (revision-pinned when the source has revisions), the sha256 of the bytes it came from, the fetch date and the licence + required attribution |
| Verify | `decodeDem` re-hashes the committed heights (`T3D_DATA_HASH` on mismatch); `bun run data verify` re-hashes cached Wikidata responses; a re-fetch that changes bytes shows up as a diff to review |
| Licence | Only sources whose licence puts no duty on the generated asset beyond attribution. The credit travels in the asset's `sources` / `copyright` and so into the GLB's XMP |
| Offline | `src/data` has no fetch; a test greps it. The gallery compiles the same recipes in a browser worker from the same JSON |

## Shipped: Wikidata facts (CC0)
`bun run data wikidata <QID…> --out recipes/<name>/data` → `wikidata-<QID>.json`: quantities
normalised to metres / kilograms (length P2043, width P2049, height P2048, depth P5524, diameter
P2386, wheelbase P3039, wingspan P2050, elevation P2044, mass P2067), coordinate P625, item facts by
id + label (gauge P1064, wheel arrangement P2978). Preferred rank wins; deprecated statements are
skipped. Units are exact factors from a table (`WIKIDATA_UNITS`: m, km, cm, mm, ft, in, yd, mi, kg,
g, t, lb, short and long ton); anything else refuses (`T3D_DATA_UNIT`) rather than guessing.

```ts
import { citeWikidata, crossCheck, readWikidata, realFrom } from '@developerz.ai/ts23d/data';
import tower from './data/wikidata-Q243.json';

const T = readWikidata(tower);
const r = realFrom(T, { map: { height: 'height', mass: 'mass' } }); // { height: 330, mass: 1.01e7, sources }
crossCheck(T, { height: 324 }, 0.01); // → [{ quantity: 'height', record: 330, declared: 324, … }]
```
Wikidata is one source among several, not the truth: Glacier Point is 2 220 m there and 2 199 m in
the guides and the USGS survey. `crossCheck` exists to surface exactly that.

## Shipped: elevation (USGS 3DEP and friends via AWS Terrain Tiles)
`bun run data dem --centre <lat,lon> --size <m> --cells 256 --zoom 13 --name <id> --out <file>`
fetches the terrarium tiles covering a box (`height = R·256 + G + B/256 − 32768`), pins each tile's
sha256, resamples bilinearly into a local metric frame (x east, y north, metres from the centre) and
writes one JSON: 16-bit heights at 5 cm steps (base64), offset/step, min/max, hash, tiles, licence
and attribution. 257² ≈ 180 KB.

Licences differ by region (tilezen/joerd `docs/attribution.md`): in the conterminous US the data is
USGS 3DEP, public domain, credited *"United States 3DEP (formerly NED) terrain data courtesy of the
U.S. Geological Survey"* — the script fills that in. Elsewhere it refuses until you pass `--license`
and `--attribution` for the regional source (EU-DEM, Kartverket, LINZ, …).

`terrainFromDEM(dem, { lod, size?, vertical?, base?, detail?, ground, strips?, water? })` builds the
tile: heightfield at 256/128/64 cells by LOD from one grid, skirt to z = 0, `terrainColor` by altitude
and slope, nature strips per triangle (snow / cliff / gravel / grass / moss / rock strata), optional
seeded erosion `detail` and a `water` surface at a level wherever the ground dips below it. Demo:
`recipes/real_valley` (Yosemite Valley east end, 4 × 4 km; Half Dome's DEM summit agrees with Wikidata
to 0.15 m).

Lessons from the demo: measured cliffs beat simulated erosion (droplets rounded Half Dome's face), a
flat water level cannot draw a river on a valley floor that falls 12 m in 2 km, and slope/altitude
colouring misreads bare granite domes as forest — land cover is the next input.

## Next: OpenStreetMap (planned, ODbL)
Rivers, lakes, roads, rail, building footprints and land cover from OSM via the Overpass API, pinned
the same way (query text + response sha256 + date). The licence is different in kind: **ODbL is
share-alike for databases**. Plan:
- Treat a recipe's committed OSM extract as a *Derivative Database*: it stays ODbL, credited
  "© OpenStreetMap contributors, ODbL 1.0" with a link, and is offered under ODbL.
- Generated meshes are a *Produced Work*: attribution required, the mesh itself need not be ODbL —
  but the extract it came from must be available. Record that in `sources` and the GLB XMP.
- Never mix OSM into a CC0 asset silently: `realFrom`-style helpers will carry a `licence` field and
  the build will refuse an asset whose `license` contradicts its inputs.
- First uses: river centrelines carved into a DEM (the Merced), lake polygons as water, footprints +
  `building:levels` for massing, land cover (forest / meadow / bare rock) to replace slope colouring.

Other candidates, same contract: Copernicus GLO-30 (global 30 m DEM, free with attribution), OpenTopography
lidar for small sites, Wikimedia Commons photos as review references (not as textures: licences vary).
