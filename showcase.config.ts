// Which adapter and model (or tool), per neural task, produced the gallery's model-tier variants.
// Data only: the committed `recipes/<folder>/neural/<key>/record.json` is the proof, and
// apps/site/src/credits-panel.test.ts fails when this table and those records disagree. Keyed
// by the recipe folder that holds the records: a `<name>_hybrid` (the gallery pairs it with
// `<name>`, the CPU tier) or a model-first recipe that holds both tiers itself (`ranger`).

export interface ShowcasePick {
  /** Model id as record.json names it. */
  readonly model: string;
  /** What ran it (record.json `adapter`). */
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
  | 'cloth'
  | 'motion'
  | 'blender';

export const SHOWCASE: Readonly<
  Record<string, Readonly<Partial<Record<ShowcaseTask, ShowcasePick>>>>
> = {
  wolf_hybrid: {
    image: { model: 'z-image', adapter: 'http (ts23d-neural-server)', licence: 'Apache-2.0' },
    mesh: { model: 'pixal3d', adapter: 'script (pixal3d_best.py, --low_vram)', licence: 'MIT' },
  },
  ranger: {
    image: { model: 'z-image', adapter: 'http (ts23d-neural-server)', licence: 'Apache-2.0' },
    mesh: { model: 'meshy-7.1', adapter: 'meshy (a hosted service, paid)', licence: 'own' },
    rig: { model: 'meshy-rigging', adapter: 'meshy (a hosted service, paid)', licence: 'own' },
    blender: {
      model: 'blender-blender',
      adapter: 'blender (Blender 5.3.0, headless)',
      licence: 'own',
    },
  },
};
