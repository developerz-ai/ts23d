// Credits for what the shown variant is made from: the models and tools behind a model tier (read
// from its committed `neural/<key>/record.json`: model id, licence, task, adapter, tool, terms),
// the Blender steps a tool record ran (from its committed report) and the data attributions a
// licence asks for (OpenStreetMap, ODbL). Neutral wording: what made it, under which licence,
// never a comparison. The record readers are pure (the media scan uses them at build).

import { byCodeUnit } from './compare.ts';
import type { MediaNeural } from './media-types.ts';

export type Tier = 'cpu' | 'models';

/** Display names for model ids the records use; anything else shows its id. */
const NAMES: Readonly<Record<string, string>> = {
  pixal3d: 'Pixal3D',
  trellis2: 'TRELLIS.2',
  'z-image': 'Z-Image-Turbo',
  hunyuan3d: 'Hunyuan3D',
  flux: 'FLUX',
  'meshy-7.1': 'Meshy 7.1 image-to-3D',
  'meshy-rigging': 'Meshy rigging and animation',
};

/** Adapters that call a hosted, paid service (the record's `adapter`, before any `:` detail). */
const HOSTED: readonly string[] = ['meshy', 'kubeez'];

/** Credits in this order: what shaped the surface and its motion, the tool steps, then the concept. */
const TASKS = ['mesh', 'rig', 'texture', 'hair', 'groom', 'cloth', 'motion', 'blender', 'image'];

type Json = Readonly<Record<string, unknown>>;
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {});
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const cap = (s: string): string => s.replace(/^\w/, (c) => c.toUpperCase());

type Credit = Omit<MediaNeural, 'dir'>;
type Named = Pick<MediaNeural, 'model' | 'tool'>;
type Licensed = Pick<MediaNeural, 'licence' | 'tool'>;

/** A model by its display name; a tool record by its tool and version (`Blender 5.3.0`). */
export const modelName = (c: string | Named): string => {
  if (typeof c === 'string') return NAMES[c] ?? c;
  return c.tool ? `${cap(c.tool.name)} ${c.tool.version}`.trim() : (NAMES[c.model] ?? c.model);
};

/** `MIT (model card …: "license: mit")` → `MIT`. */
export const shortLicence = (licence: string): string =>
  licence.split(' (')[0]?.trim() || 'licence not stated';

/**
 * The licence as shown: a tool's own licence (its outputs are the maker's), `own` spelled out
 * (the service or tool leaves the outputs to whoever ran it), else the model's short licence.
 */
export function licenceLabel(c: Licensed): string {
  if (c.tool) return `${shortLicence(c.tool.licence)} tool, own outputs`;
  const short = shortLicence(c.licence);
  return short === 'own' ? 'own outputs' : short;
}

/** A parsed `record.json` → its credit, or null when it is not a t3d-neural record. */
export function creditOf(json: unknown): Credit | null {
  const r = obj(json);
  const model = obj(r['model']);
  const key = str(r['key']);
  const id = str(model['id']);
  if (!str(r['contract']).startsWith('t3d-neural/') || !key || !id) return null;
  // Local outputs (ADR 014: raw model files kept on the machine that made them) are not published.
  const outputs = (Array.isArray(r['outputs']) ? r['outputs'] : [])
    .map(obj)
    .filter((o) => o['local'] !== true && str(o['file']));
  const tool = obj(model['tool']);
  return {
    key,
    task: str(r['task']) || str(model['task']),
    model: id,
    licence: str(model['licence']),
    adapter: str(r['adapter']),
    files: outputs.map((o) => str(o['file'])),
    bytes: outputs.reduce((n, o) => n + num(o['bytes']), 0),
    terms: /^https:\/\//.test(str(model['terms'])) ? str(model['terms']) : '',
    tool: str(tool['name'])
      ? { name: str(tool['name']), version: str(tool['version']), licence: str(tool['licence']) }
      : null,
    steps: [],
  };
}

/** The step ops of a committed Blender report (`t3d-blender-report/…`), in run order; else []. */
export function stepsOf(report: unknown): string[] {
  const r = obj(report);
  if (!str(r['contract']).startsWith('t3d-blender-report/') || !Array.isArray(r['steps']))
    return [];
  return r['steps'].map((s) => str(obj(s)['op'])).filter(Boolean);
}

/**
 * What kind of adapter ran: the word before any detail. `http:http://127.0.0.1:8190` and
 * `http (ts23d-neural-server)` are both `http`; `blender:blender` is `blender`.
 */
export const adapterKind = (adapter: string): string => adapter.split(/[:\s(]/)[0] ?? '';

/** True when the record's adapter called a hosted, paid service. */
export const isHosted = (adapter: string): boolean => HOSTED.includes(adapterKind(adapter));

/** `http:http://127.0.0.1:8193` → `http`; `script:x.py (lab …)` → `script:x.py` (no hosts, no notes). */
export const adapterLabel = (adapter: string): string =>
  isHosted(adapter)
    ? 'a hosted service (paid)'
    : (adapter.split(' (')[0] ?? '')
        .replace(/https?:\/\/\S*/g, '')
        .replace(/:+$/, '')
        .trim() || 'adapter not stated';

const rank = (task: string): number => {
  const i = TASKS.indexOf(task);
  return i < 0 ? TASKS.length : i;
};

const list = (parts: readonly string[]): string =>
  parts.length < 2 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;

/** Credits by task rank, then name. */
export const sorted = <T extends Pick<MediaNeural, 'task' | 'model'>>(credits: readonly T[]): T[] =>
  [...credits].sort((a, b) => rank(a.task) - rank(b.task) || byCodeUnit(a.model, b.model));

/** "Made with Pixal3D (MIT), Blender 5.3.0 (GPL-2.0-or-later tool, own outputs) and Z-Image-Turbo (Apache-2.0)". */
export function creditLine(
  credits: readonly Pick<MediaNeural, 'task' | 'model' | 'licence' | 'tool'>[],
): string {
  const seen = new Set<string>();
  const models = sorted(credits)
    .map((c) => `${modelName(c)} (${licenceLabel(c)})`)
    .filter((m) => !seen.has(m) && Boolean(seen.add(m)));
  return models.length ? `Made with ${list(models)}` : '';
}

/** One record as a line: `mesh: Pixal3D · MIT · script:x.py`; a tool record names its steps. */
export function recordLine(
  c: Pick<Credit, 'task' | 'model' | 'licence' | 'adapter' | 'tool' | 'steps'>,
): string {
  const what = c.steps.length ? `Blender steps (${c.steps.join(' → ')})` : c.task;
  const how = c.tool ? 'run headless, cached' : adapterLabel(c.adapter);
  return `${what}: ${modelName(c)} · ${licenceLabel(c)} · ${how}`;
}

/** `11.1 MB` / `224 KB` (decimal units, as download sizes read). */
export const megabytes = (bytes: number): string =>
  bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`;

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

const anchor = (text: string, href: string): HTMLAnchorElement => {
  const a = el('a', text);
  a.href = href;
  a.rel = 'noopener';
  return a;
};

/** A data line with its licence link (`… (https://…)` → text + link). */
function dataLine(text: string): HTMLLIElement {
  const li = el('li');
  const m = /^(.*?)\s*\((https?:\/\/[^)\s]+)\)\s*$/.exec(text);
  if (m?.[2]) li.append('Data: ', anchor(m[1] ?? '', m[2]));
  else li.textContent = `Data: ${text}`;
  return li;
}

export interface Credits {
  readonly tier: Tier;
  /** True when this asset has two tiers (so the CPU tier is worth naming). */
  readonly paired: boolean;
  /** True when both tiers are one recipe: its CPU tier is the build without the model outputs. */
  readonly fallback?: boolean;
  readonly neural: readonly MediaNeural[];
  readonly data: readonly string[];
  /** Recipe folder of the shown variant, for the record link. */
  readonly folder: string;
}

/** Fill the credits block under the viewer; hidden when there is nothing to credit. */
export function renderCredits(root: HTMLElement, c: Credits): void {
  const items: HTMLElement[] = [];
  if (c.tier === 'models' && c.neural.length) {
    items.push(
      el(
        'p',
        `Model tier. ${creditLine(c.neural)}. Code keeps the scale, the LODs and QA.`,
        'credits-line',
      ),
    );
    const ul = el('ul', undefined, 'credits-list');
    for (const n of sorted(c.neural)) {
      const li = el('li', recordLine(n));
      if (n.terms) li.append(' · ', anchor('service terms', n.terms));
      ul.append(li);
    }
    const href = `https://github.com/developerz-ai/ts23d/tree/main/recipes/${c.folder}/neural`;
    const bytes = c.neural.reduce((n, x) => n + x.bytes, 0);
    const note = el('li');
    note.append(
      'Outputs committed with their record.json in ',
      anchor(`recipes/${c.folder}/neural/`, href),
      `; the compile in this page fetches them (${megabytes(bytes)}) and reuses them.`,
    );
    ul.append(note);
    items.push(ul);
  } else if (c.paired)
    items.push(
      el(
        'p',
        c.fallback
          ? 'CPU tier: this recipe built without its model outputs, no GPU and no model. The renders and numbers on this page are the model tier’s.'
          : 'CPU tier: built from the recipe alone, no GPU and no model.',
        'credits-line',
      ),
    );
  if (c.data.length) {
    const ul = el('ul', undefined, 'credits-list');
    ul.append(...c.data.map(dataLine));
    items.push(ul);
  }
  root.replaceChildren(...items);
  root.hidden = items.length === 0;
}
