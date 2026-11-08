// Gallery categories: the navigation order and the rule that puts an asset in one, from its kind
// and tags (never from its look). Untagged teaching assets are placed by name until their recipes
// carry tags.

export const CATEGORIES = [
  'Creatures',
  'Characters',
  'Vehicles',
  'Strategy kit',
  'Architecture',
  'Nature & Terrain',
  'Sci-fi',
  'Materials & finishes',
  'Parts',
  'Sound',
  'Tech demos',
  'Props',
] as const;
export type Category = (typeof CATEGORIES)[number];

/** One line under each category chip's heading, for the filter's tooltip and the asset eyebrow. */
export const BLURB: Readonly<Record<Category, string>> = {
  Creatures: 'Animals and fantasy creatures sculpted on real skeletons',
  Characters: 'Heads, busts and figures',
  Vehicles: 'Cars, tanks, aircraft and rolling stock',
  'Strategy kit': 'An RTS faction: units, buildings, resources, team colours',
  Architecture: 'Buildings, landmarks and lineside structures',
  'Nature & Terrain': 'Trees, rocks and landscapes',
  'Sci-fi': 'Original sci-fi hardware',
  'Materials & finishes': 'Trim-sheet strips, PBR finishes, optics and weathering',
  Parts: 'The reusable parts kit',
  Sound: 'Assets that ship sound emitters and WAV clips',
  'Tech demos': 'Teaching assets for DSL features',
  Props: 'Everything else',
};

/** Assets whose recipes carry no tags yet (requested upstream): name → category. */
const UNTAGGED: Readonly<Record<string, Category>> = {
  material_swatches: 'Materials & finishes',
  weather_demo: 'Materials & finishes',
};

const RAIL_STOCK = new Set(['rolling-stock', 'locomotive', 'steam', 'freight']);
const RAIL = new Set(['rail', 'railroad', 'railway', 'lineside', 'station']);
const NATURE = new Set(['nature', 'terrain', 'tree', 'rock', 'landscape', 'vegetation']);
const MATERIAL = new Set(['material', 'pbr', 'weather', 'weathering', 'finish', 'swatch']);
const DEMO = new Set(['demo', 'showcase', 'svg', 'joints']);

export function categoryOf(kind: string, tags: readonly string[], name = ''): Category {
  const has = (set: ReadonlySet<string>): boolean => tags.some((t) => set.has(t));
  const fixed = UNTAGGED[name];
  if (fixed && tags.length === 0) return fixed;
  if (tags.includes('rts')) return 'Strategy kit';
  if (kind === 'creature' || tags.includes('creature')) return 'Creatures';
  if (kind === 'character' || tags.includes('character')) return 'Characters';
  if (tags.includes('sound')) return 'Sound';
  if (tags.includes('parts') || tags.includes('catalogue')) return 'Parts';
  if (has(MATERIAL)) return 'Materials & finishes';
  if (tags.includes('sci-fi') || kind === 'scifi') return 'Sci-fi';
  if (kind === 'vehicle' || has(RAIL_STOCK)) return 'Vehicles';
  if (has(DEMO)) return 'Tech demos';
  if (kind === 'building' || kind === 'structure' || kind === 'bridge' || has(RAIL))
    return 'Architecture';
  if (kind === 'terrain' || kind === 'vegetation' || kind === 'tree' || has(NATURE))
    return 'Nature & Terrain';
  return 'Props';
}
