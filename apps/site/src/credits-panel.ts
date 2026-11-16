// Credits for what the shown variant is made from: the models behind a hybrid (read from its
// committed `neural/<key>/record.json`: model id, licence, task, adapter) and the data
// attributions a licence asks for (OpenStreetMap, ODbL). Neutral wording: what made it, under
// which licence, never a comparison. The record reader is pure (the media scan uses it at build).

import type { MediaNeural } from './media-types.ts';

export type Tier = 'cpu' | 'models';

/** Display names for model ids the records use; anything else shows its id. */
const NAMES: Readonly<Record<string, string>> = {
  pixal3d: 'Pixal3D',
  trellis2: 'TRELLIS.2',
  'z-image': 'Z-Image-Turbo',
  hunyuan3d: 'Hunyuan3D',
  flux: 'FLUX',
};

/** Model credits first by what they shaped: the surface before the concept image. */
const TASKS = ['mesh', 'texture', 'hair', 'cloth', 'motion', 'image'];

type Json = Readonly<Record<string, unknown>>;
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {});
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export const modelName = (id: string): string => NAMES[id] ?? id;

/** `MIT (model card …: "license: mit")` → `MIT`. */
export const shortLicence = (licence: string): string =>
  licence.split(' (')[0]?.trim() || 'licence not stated';

/** A parsed `record.json` → its credit, or null when it is not a t3d-neural record. */
export function creditOf(json: unknown): Omit<MediaNeural, 'dir'> | null {
  const r = obj(json);
  const model = obj(r['model']);
  const key = str(r['key']);
  const id = str(model['id']);
  if (!str(r['contract']).startsWith('t3d-neural/') || !key || !id) return null;
  return {
    key,
    task: str(r['task']) || str(model['task']),
    model: id,
    licence: str(model['licence']),
    adapter: str(r['adapter']),
    files: (Array.isArray(r['outputs']) ? r['outputs'] : []).map((o) => str(obj(o)['file'])),
  };
}

/** `http:http://127.0.0.1:8193` → `http`; `script:x.py (lab …)` → `script:x.py` (no hosts, no notes). */
export const adapterLabel = (adapter: string): string =>
  (adapter.split(' (')[0] ?? '')
    .replace(/https?:\/\/\S*/g, '')
    .replace(/:+$/, '')
    .trim() || 'adapter not stated';

const rank = (task: string): number => {
  const i = TASKS.indexOf(task);
  return i < 0 ? TASKS.length : i;
};

const list = (parts: readonly string[]): string =>
  parts.length < 2 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;

/** "Made with Pixal3D (MIT) and Z-Image-Turbo (Apache-2.0) on the code skeleton". */
export function creditLine(
  credits: readonly Pick<MediaNeural, 'task' | 'model' | 'licence'>[],
): string {
  const seen = new Set<string>();
  const models = [...credits]
    .sort((a, b) => rank(a.task) - rank(b.task) || a.model.localeCompare(b.model))
    .filter((c) => !seen.has(c.model) && Boolean(seen.add(c.model)))
    .map((c) => `${modelName(c.model)} (${shortLicence(c.licence)})`);
  return models.length ? `Made with ${list(models)} on the code skeleton` : '';
}

/** Data attributions among an asset's sources: the `© …` part of any source under ODbL / CC BY. */
export function dataCredits(sources: readonly string[]): string[] {
  return sources
    .filter((s) => /ODbL|\bCC[- ]BY\b/i.test(s) || s.includes('©'))
    .map((s) => (s.includes('©') ? s.slice(s.indexOf('©')) : s).trim());
}

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  className?: string,
): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (className) n.className = className;
  return n;
};

/** A data line with its licence link (`… (https://…)` → text + link). */
function dataLine(text: string): HTMLLIElement {
  const li = el('li');
  const m = /^(.*?)\s*\((https?:\/\/[^)\s]+)\)\s*$/.exec(text);
  if (!m?.[2]) {
    li.textContent = `Data: ${text}`;
    return li;
  }
  const a = el('a', m[1]);
  a.href = m[2];
  a.rel = 'noopener';
  li.append('Data: ', a);
  return li;
}

export interface Credits {
  readonly tier: Tier;
  /** True when this asset has a model-tier variant (so the CPU tier is worth naming). */
  readonly paired: boolean;
  readonly neural: readonly MediaNeural[];
  readonly data: readonly string[];
  /** Recipe folder of the shown variant, for the record link. */
  readonly folder: string;
}

/** Fill the credits block under the viewer; hidden when there is nothing to credit. */
export function renderCredits(root: HTMLElement, c: Credits): void {
  const items: HTMLElement[] = [];
  if (c.tier === 'models' && c.neural.length) {
    items.push(el('p', `${creditLine(c.neural)}.`, 'credits-line'));
    const ul = el('ul', undefined, 'credits-list');
    for (const n of [...c.neural].sort((a, b) => rank(a.task) - rank(b.task)))
      ul.append(
        el(
          'li',
          `${n.task}: ${modelName(n.model)} · ${shortLicence(n.licence)} · ${adapterLabel(n.adapter)}`,
        ),
      );
    const a = el('a', `recipes/${c.folder}/neural/`);
    a.href = `https://github.com/developerz-ai/ts23d/tree/main/recipes/${c.folder}/neural`;
    a.rel = 'noopener';
    const note = el('li');
    note.append('Outputs committed with their record.json in ', a, '; the compile reuses them.');
    ul.append(note);
    items.push(ul);
  } else if (c.paired)
    items.push(
      el('p', 'CPU tier: built from the recipe alone, no GPU and no model.', 'credits-line'),
    );
  if (c.data.length) {
    const ul = el('ul', undefined, 'credits-list');
    ul.append(...c.data.map(dataLine));
    items.push(ul);
  }
  root.replaceChildren(...items);
  root.hidden = items.length === 0;
}
