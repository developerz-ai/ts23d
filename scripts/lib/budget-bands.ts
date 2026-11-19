// The triangle band per asset class, machine-readable: the ceiling of each LOD's range in the class
// playbook (docs/playbooks/**). An asset's class is the first row whose kind matches and that shares
// a tag with the asset (a row without tags is the kind's fallback). Where a class has no playbook the
// fallback is BUDGETS in src/core/definition.ts, "measured on real recipes". Read by
// scripts/budget-bands.ts; changing a number here means changing the playbook line it cites.

export type Triple = readonly [number, number, number];

export interface Band {
  /** Class name printed in findings. */
  readonly id: string;
  /** `asset.kind` this row applies to. */
  readonly kind: string;
  /** The asset carries at least one of these tags. Omitted: the kind's fallback row. */
  readonly tags?: readonly string[];
  /** LOD0 / LOD1 / LOD2 ceilings (triangles). */
  readonly triangles: Triple;
  /** Where the numbers come from: the playbook file, or why there is none. */
  readonly source: string;
}

const PB = 'docs/playbooks';

/** Most specific first: the first match wins. Every kind a recipe uses needs a fallback row. */
export const BANDS: readonly Band[] = [
  {
    id: 'sports-car',
    kind: 'vehicle',
    tags: ['sports-car'],
    triangles: [100000, 20000, 1500],
    source: `${PB}/vehicles/sports-car.md`,
  },
  {
    id: 'passenger-car',
    kind: 'vehicle',
    tags: ['car'],
    triangles: [80000, 15000, 1200],
    source: `${PB}/vehicles/passenger-car.md`,
  },
  {
    id: 'afv',
    kind: 'vehicle',
    tags: ['tank', 'tracked'],
    triangles: [150000, 25000, 1500],
    source: `${PB}/vehicles/afv.md`,
  },
  {
    id: 'rail-wagon',
    kind: 'vehicle',
    tags: ['rolling-stock', 'wagon'],
    triangles: [50000, 10000, 800],
    source: `${PB}/vehicles/rail.md (wagon)`,
  },
  {
    id: 'rail-locomotive',
    kind: 'vehicle',
    tags: ['rail', 'locomotive'],
    triangles: [150000, 30000, 2000],
    source: `${PB}/vehicles/rail.md (locomotive)`,
  },
  {
    id: 'aircraft',
    kind: 'vehicle',
    tags: ['aircraft'],
    triangles: [200000, 40000, 3000],
    source: `${PB}/vehicles/aircraft.md (airliner, the class ceiling)`,
  },
  {
    id: 'vehicle',
    kind: 'vehicle',
    triangles: [60000, 15000, 1000],
    source: 'no class playbook: BUDGETS.vehicle (src/core/definition.ts)',
  },
  {
    id: 'station',
    kind: 'building',
    tags: ['station'],
    triangles: [60000, 10000, 800],
    source: `${PB}/buildings/station-platform.md`,
  },
  {
    id: 'building',
    kind: 'building',
    triangles: [20000, 6000, 800],
    source: 'no class playbook: BUDGETS.building (src/core/definition.ts)',
  },
  {
    id: 'model-first',
    kind: 'creature',
    tags: ['model-first'],
    triangles: [30000, 10000, 6000],
    source: `${PB}/characters/characters-creatures.md (model tier)`,
  },
  {
    id: 'creature',
    kind: 'creature',
    triangles: [150000, 30000, 4000],
    source: `${PB}/characters/characters-creatures.md (creature)`,
  },
  {
    id: 'model-first',
    kind: 'character',
    tags: ['model-first'],
    triangles: [30000, 10000, 6000],
    source: `${PB}/characters/characters-creatures.md (model tier)`,
  },
  {
    id: 'bust',
    kind: 'character',
    tags: ['bust'],
    triangles: [60000, 12000, 1500],
    source: `${PB}/characters/characters-creatures.md (bust)`,
  },
  {
    id: 'character',
    kind: 'character',
    triangles: [150000, 30000, 4000],
    source: `${PB}/characters/characters-creatures.md (creature; no full-body row)`,
  },
  {
    id: 'bust',
    kind: 'prop',
    tags: ['bust'],
    triangles: [60000, 12000, 1500],
    source: `${PB}/characters/characters-creatures.md (bust)`,
  },
  {
    id: 'rock',
    kind: 'prop',
    tags: ['rock', 'boulder'],
    triangles: [10000, 1500, 150],
    source: `${PB}/nature/rocks.md`,
  },
  {
    id: 'container',
    kind: 'prop',
    tags: ['container'],
    triangles: [10000, 1500, 40],
    source: `${PB}/props/containers.md`,
  },
  {
    id: 'prop',
    kind: 'prop',
    triangles: [5000, 1500, 300],
    source: 'no class playbook: BUDGETS.detailedProp (src/core/definition.ts)',
  },
  {
    id: 'tree',
    kind: 'vegetation',
    triangles: [60000, 8000, 400],
    source: `${PB}/nature/trees.md`,
  },
  {
    id: 'terrain',
    kind: 'terrain',
    triangles: [200000, 40000, 4000],
    source: `${PB}/nature/terrain.md`,
  },
  {
    id: 'scene',
    kind: 'scene',
    triangles: [500000, 120000, 15000],
    source: 'no class playbook: BUDGETS.scene (src/core/definition.ts)',
  },
];

/** The band for an asset: the first row of its kind sharing a tag, else the kind's fallback. */
export function bandOf(
  kind: string,
  tags: readonly string[],
  bands: readonly Band[] = BANDS,
): Band | undefined {
  return bands.find(
    (b) => b.kind === kind && (b.tags === undefined || b.tags.some((t) => tags.includes(t))),
  );
}
