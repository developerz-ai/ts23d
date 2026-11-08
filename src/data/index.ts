// @developerz.ai/ts23d/data — real-world inputs, pinned and offline. Wikidata facts (CC0) and
// elevation models arrive through `bun run data …` as small committed files carrying their URL,
// sha256 and licence; these functions parse, verify and turn them into recipe numbers and
// terrain. Nothing here fetches: compile stays deterministic and offline.

export {
  type DemRecord,
  type DemSource,
  decodeDem,
  encodeDem,
} from './dem.ts';
export { readDem, readWikidata } from './read.ts';
export {
  type Conflict,
  citeWikidata,
  crossCheck,
  type MeasureFrom,
  quantity,
  type RealFrom,
  type RealFromOptions,
  realFrom,
} from './real-from.ts';
export { sha256, verifyPin } from './sha256.ts';
export {
  type DemGround,
  type DemTerrain,
  type TerrainFromDemOptions,
  terrainFromDEM,
} from './terrain-from-dem.ts';
export {
  type DemBox,
  decodeTerrarium,
  EARTH_RADIUS,
  type GeoCentre,
  localToLonLat,
  lonLatToLocal,
  lonLatToPixel,
  resampleTerrarium,
  type TileImage,
  tilesFor,
} from './terrarium.ts';
export { type Dimension, toSi, type UnitDef, unitId, WIKIDATA_UNITS } from './units.ts';
export {
  checkQid,
  parseWikidata,
  QID,
  type Quantity,
  WIKIDATA_ITEMS,
  WIKIDATA_QUANTITIES,
  type WikidataPin,
  type WikidataRecord,
} from './wikidata.ts';
