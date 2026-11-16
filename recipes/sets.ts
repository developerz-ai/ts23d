// Asset sets: groups of recipes that must look like one game, each with its style bible
// (`defineStyle`: palette roles, texel density, value key). The recipes gate measures every member
// at LOD1 (`coherence` in src/qa: palette share within CIEDE2000, texel density, bevel width, wear,
// value key) and fails a set with a robust-z outlier (T3D_STYLE_OUTLIER). Members are recipe paths;
// the asset is the module's export named after the folder.

import {
  type Asset,
  coherence,
  compile,
  defineStyle,
  type Finding,
  type Style,
} from '@developerz.ai/ts23d';
import { TEAMS } from './_lib/rts/style.ts';

export interface AssetSet {
  readonly style: Style;
  /** Recipe entry files, repo-relative. */
  readonly members: readonly string[];
}

/** The Saltmarch Accord RTS kit (recipes/_lib/rts/style.ts): bone ceramic, slate, brass, team. */
export const rts: AssetSet = {
  style: defineStyle({
    name: 'rts',
    palette: {
      team: TEAMS.red,
      bone: '#cfc4a8',
      boneDark: '#a99d82',
      slate: '#4a5058',
      iron: '#2c3034',
      brass: '#a87a2c',
      leather: '#5a3d28',
      boot: '#3b2c22',
      cloth: '#6f6a52',
      skin: '#c08a66',
      rubber: '#232323',
      glow: '#ffb13a',
      soot: '#1b1a19',
    },
    paletteDeltaE: 14,
  }),
  members: [
    'recipes/rts_worker/rts_worker.ts',
    'recipes/rts_soldier/rts_soldier.ts',
    'recipes/rts_tank/rts_tank.ts',
    'recipes/rts_barracks/rts_barracks.ts',
    'recipes/rts_resource/rts_resource.ts',
  ],
};

/** Realistic animals on one skeleton family: earth-toned coats, dark keratin, warm irises. */
export const bestiary: AssetSet = {
  style: defineStyle({
    name: 'bestiary',
    palette: {
      grey: '#9a8c78',
      saddle: '#6a6259',
      cream: '#ddd5c6',
      rust: '#b6552a',
      ginger: '#d4b597',
      brown: '#6b4a2e',
      darkBrown: '#2a1c13',
      black: '#1d1714',
      orange: '#c8662a',
      white: '#efe9df',
      keratin: '#b9ad98',
    },
    paletteDeltaE: 14,
  }),
  members: [
    'recipes/wolf/wolf.ts',
    'recipes/fox/fox.ts',
    'recipes/brown_bear/brown_bear.ts',
    'recipes/amur_tiger/amur_tiger.ts',
  ],
};

export const SETS: Readonly<Record<string, AssetSet>> = { rts, bestiary };

/** The member assets of a set: each recipe module's export named after its folder. */
export async function setAssets(set: AssetSet): Promise<Asset[]> {
  return Promise.all(
    set.members.map(async (m) => {
      const name = m.split('/')[1] ?? '';
      const mod = (await import(`../${m}`)) as Record<string, Asset | undefined>;
      const a = mod[name];
      if (!a) throw new TypeError(`${m} exports no '${name}' asset`);
      return a;
    }),
  );
}

/** Coherence findings of one set, measured at LOD1 (the recipes gate's `sets` pass). */
export async function checkSet(set: AssetSet, extra: readonly Asset[] = []): Promise<Finding[]> {
  const assets = [...(await setAssets(set)), ...extra];
  return coherence(
    set.style,
    assets.map((a) => compile(a, { lod: 1 })),
  );
}
