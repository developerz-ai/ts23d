// Which adapter and model, per neural task, produced the gallery's model-tier (hybrid) variants.
// Data only: the committed `recipes/<folder>/neural/<key>/record.json` is the proof, and
// apps/site/src/credits-panel.test.ts fails when this table and those records disagree. Keyed
// by the hybrid's recipe folder; the gallery pairs `<name>` (CPU tier) with `<name>_hybrid`.

export interface ShowcasePick {
  /** Model id as record.json names it. */
  readonly model: string;
  /** What ran it (record.json `adapter`). */
  readonly adapter: string;
  /** Licence of the model's outputs (short form; the record holds the model-card quote). */
  readonly licence: string;
}

export type ShowcaseTask = 'image' | 'mesh' | 'texture' | 'hair' | 'cloth' | 'motion';

export const SHOWCASE: Readonly<
  Record<string, Readonly<Partial<Record<ShowcaseTask, ShowcasePick>>>>
> = {
  wolf_hybrid: {
    image: { model: 'z-image', adapter: 'http (ts23d-neural-server)', licence: 'Apache-2.0' },
    mesh: { model: 'pixal3d', adapter: 'script (pixal3d_best.py, --low_vram)', licence: 'MIT' },
  },
};
