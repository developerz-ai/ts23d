// The two tiers of one asset: the CPU tier (no GPU, no model, deterministic) and the model tier
// (built with committed model outputs, `neural/*/record.json`). Two layouts: a pair of recipes,
// `<name>` and `<name>_hybrid` (the hybrid never gets its own card: its CPU asset's switch reaches
// it), or ONE recipe that holds both (`selfTiered`: a model-first asset whose build without the
// cache is its CPU fallback; it opens on the model tier, `#<name>@cpu` opens the fallback).
// Pairing and grid filtering are pure; `tierSwitch` is the "CPU tier / Model tier" control.

import type { Tier } from './credits-panel.ts';

export type { Tier } from './credits-panel.ts';

export const HYBRID = '_hybrid';

interface Named {
  readonly name: string;
  readonly folder: string;
}

/** `wolf_hybrid` → `wolf`; null for a name that is not a hybrid. */
export const baseOf = (name: string): string | null =>
  name.endsWith(HYBRID) && name.length > HYBRID.length ? name.slice(0, -HYBRID.length) : null;

/**
 * The model-tier variant of `item`: the asset `<name>_hybrid`, only when its folder has committed
 * neural records (a hybrid with no cache compiles as the CPU asset, so it would show nothing new).
 */
export function pairOf<T extends Named>(
  item: Named,
  items: readonly T[],
  neural: Readonly<Record<string, readonly unknown[]>>,
): T | null {
  if (baseOf(item.name)) return null;
  const hybrid = items.find((i) => i.name === `${item.name}${HYBRID}`);
  return hybrid && (neural[hybrid.folder]?.length ?? 0) > 0 ? hybrid : null;
}

/** Hash suffix that opens the CPU tier of a recipe holding both tiers: `#ranger@cpu`. */
export const CPU_SUFFIX = '@cpu';

/** True when `item`'s own recipe folder has committed neural records: both tiers are this recipe. */
export const selfTiered = (
  item: Named,
  neural: Readonly<Record<string, readonly unknown[]>>,
): boolean => !baseOf(item.name) && (neural[item.folder]?.length ?? 0) > 0;

/** `ranger@cpu` → `['ranger', 'cpu']`; any other hash names the asset on its default tier. */
export const parseHash = (hash: string): readonly [name: string, tier: Tier | null] =>
  hash.endsWith(CPU_SUFFIX) ? [hash.slice(0, -CPU_SUFFIX.length), 'cpu'] : [hash, null];

/** The home showcase never fetches more model output than this for one asset (first paint stays light). */
export const SHOWCASE_MODEL_BYTES = 2_000_000;

/** Bytes a model-tier view of these records fetches. */
export const payloadOf = (records: readonly { readonly bytes: number }[]): number =>
  records.reduce((n, r) => n + r.bytes, 0);

/**
 * The live showcase's items: a recipe holding both tiers shows its model tier there, so one whose
 * outputs are a heavy download is left out (its card and page still show it).
 */
export const showcaseItems = <T extends Named>(
  items: readonly T[],
  neural: Readonly<Record<string, readonly { readonly bytes: number }[]>>,
): T[] =>
  items.filter(
    (i) => !selfTiered(i, neural) || payloadOf(neural[i.folder] ?? []) <= SHOWCASE_MODEL_BYTES,
  );

/** The grid's items: every hybrid whose CPU asset is listed is left out (the switch reaches it). */
export function gridItems<T extends Named>(items: readonly T[]): T[] {
  const names = new Set(items.map((i) => i.name));
  return items.filter((i) => {
    const base = baseOf(i.name);
    return !base || !names.has(base);
  });
}

const LABELS: Readonly<Record<Tier, string>> = { cpu: 'CPU tier', models: 'Model tier' };

let uid = 0;

/** A two-way radio switch (native radios: keyboard and screen readers work as is). */
export function tierSwitch(
  label: string,
  tier: Tier,
  onChange: (tier: Tier) => void,
): HTMLFieldSetElement {
  const set = document.createElement('fieldset');
  set.className = 'segmented tier-switch';
  set.dataset['tier'] = tier;
  const legend = document.createElement('legend');
  legend.className = 'visually-hidden';
  legend.textContent = label;
  set.append(legend);
  const name = `tier-${++uid}`;
  for (const t of ['cpu', 'models'] as const) {
    const l = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = t;
    input.checked = t === tier;
    input.addEventListener('change', () => {
      if (!input.checked) return;
      set.dataset['tier'] = t;
      onChange(t);
    });
    const span = document.createElement('span');
    span.textContent = LABELS[t];
    l.append(input, span);
    set.append(l);
  }
  return set;
}
