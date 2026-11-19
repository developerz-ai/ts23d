// Which adapter and model (or tool), per neural task, produced the gallery's model-tier variants.
// Data only: the committed `recipes/<folder>/neural/<key>/record.json` is the proof, and
// apps/site/src/credits-panel.test.ts fails when this table and those records disagree: every
// folder with records has an entry, every task its records hold has a row, and each row's model,
// adapter kind and licence are the records'. Keyed by the recipe folder that holds the records: a
// `<name>_hybrid` (the gallery pairs it with `<name>`, the CPU tier) or a model-first recipe that
// holds both tiers itself (`ranger`).

export interface ShowcasePick {
  /** Model id as record.json names it. */
  readonly model: string;
  /**
   * What ran it, for people: the record's adapter kind first (`http`, `meshy`, `blender`), then a
   * note. Never the record's own string where that holds a machine-local URL (`http:http://127…`).
   */
  readonly adapter: string;
  /** Licence of the model's outputs (short form; the record holds the model-card quote); `own` when the service or tool leaves them to whoever ran it. */
  readonly licence: string;
}

export type ShowcaseTask =
  | 'image'
  | 'mesh'
  | 'rig'
  | 'texture'
  | 'hair'
  | 'groom'
  | 'cloth'
  | 'motion'
  | 'blender';

/** The reference model server (`examples/neural-server`) on the maker's own GPU. */
const SERVER = 'http (ts23d-neural-server)';
const BLENDER: ShowcasePick = {
  model: 'blender-blender',
  adapter: 'blender (Blender 5.3.0, headless)',
  licence: 'own',
};
const Z_IMAGE: ShowcasePick = { model: 'z-image', adapter: SERVER, licence: 'Apache-2.0' };

/** Concept image → Pixal3D mesh → UniRig skeleton → Blender steps, all on the local server. */
const LOCAL_CREATURE: Readonly<Partial<Record<ShowcaseTask, ShowcasePick>>> = {
  image: Z_IMAGE,
  mesh: { model: 'pixal3d', adapter: SERVER, licence: 'MIT' },
  rig: { model: 'unirig', adapter: SERVER, licence: 'MIT' },
  blender: BLENDER,
};

export const SHOWCASE: Readonly<
  Record<string, Readonly<Partial<Record<ShowcaseTask, ShowcasePick>>>>
> = {
  wolf_hybrid: LOCAL_CREATURE,
  bear_hybrid: LOCAL_CREATURE,
  dragon_hybrid: LOCAL_CREATURE,
  ranger: {
    image: Z_IMAGE,
    mesh: { model: 'meshy-7.1', adapter: 'meshy (a hosted service, paid)', licence: 'own' },
    rig: { model: 'meshy-rigging', adapter: 'meshy (a hosted service, paid)', licence: 'own' },
    blender: BLENDER,
  },
  human_head: {
    groom: {
      model: 'blender-groom',
      adapter: 'blender (Blender 5.3.0, bpy, headless)',
      licence: 'own',
    },
  },
};
