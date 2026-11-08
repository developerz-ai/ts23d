// Physics material per strip: static/dynamic friction (dry, against a like or typical partner,
// engineeringtoolbox.com "Friction and Friction Coefficients") and a coefficient of restitution
// (typical rigid-body values; engines combine both per contact pair, `average` by default).

export interface PhysicsMaterial {
  readonly staticFriction: number;
  readonly dynamicFriction: number;
  readonly restitution: number;
}

type Row = readonly [number, number, number];

const STEEL: Row = [0.74, 0.57, 0.5];
const METAL: Row = [0.6, 0.45, 0.45];
const WOOD: Row = [0.5, 0.3, 0.4];
const MASONRY: Row = [0.62, 0.55, 0.2];
const ROCK: Row = [0.7, 0.6, 0.25];

const TABLE: Readonly<Record<string, Row>> = {
  plain: [0.5, 0.4, 0.3],
  brick: MASONRY,
  stone: MASONRY,
  slate: [0.55, 0.45, 0.2],
  concrete: MASONRY,
  iron: STEEL,
  iron_rust: STEEL,
  steel_painted: STEEL,
  steel_galvanised: STEEL,
  chrome: [0.6, 0.45, 0.55],
  iron_cast: [1.1, 0.15, 0.4],
  brass: [0.51, 0.44, 0.45],
  copper: [0.53, 0.36, 0.4],
  aluminium: METAL,
  wood: WOOD,
  oak: WOOD,
  pine: WOOD,
  wood_weathered: [0.55, 0.35, 0.35],
  wood_painted: [0.45, 0.3, 0.4],
  glass: [0.94, 0.4, 0.6],
  rubber: [1.0, 0.8, 0.7],
  canvas: [0.6, 0.5, 0.1],
  leather: [0.4, 0.3, 0.2],
  plastic: [0.4, 0.3, 0.5],
  foliage: [0.5, 0.4, 0.1],
  sand: [0.6, 0.5, 0.05],
  soil: [0.6, 0.5, 0.1],
  gravel: [0.7, 0.6, 0.1],
  mud: [0.4, 0.3, 0],
  rock_strata: ROCK,
  cliff: ROCK,
  lava: ROCK,
  cobblestone: [0.65, 0.55, 0.2],
  asphalt: [0.7, 0.6, 0.2],
  moss: [0.4, 0.3, 0.1],
  grass: [0.45, 0.35, 0.15],
  leaf_litter: [0.5, 0.4, 0.05],
  snow: [0.3, 0.15, 0.05],
  ice: [0.1, 0.03, 0.1],
  water: [0.05, 0.05, 0],
  bark_oak: WOOD,
  bark_pine: WOOD,
  bark_birch: WOOD,
};

/** Friction and restitution for a strip id ('plain' values for unknown ids). */
export function physicsMaterialOf(strip: string): PhysicsMaterial {
  const [s, d, r] = TABLE[strip] ?? TABLE['plain'] ?? [0.5, 0.4, 0.3];
  return { staticFriction: s, dynamicFriction: d, restitution: r };
}
