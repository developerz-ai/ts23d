// The two tiers of one asset: the CPU tier (recipe `<name>`, no GPU, deterministic) and, when a
// recipe `<name>_hybrid` exists with committed model outputs (`neural/*/record.json`), the
// model tier (a model's surface on the same code skeleton). Pairing and grid filtering are pure;
// `tierSwitch` is the "CPU tier / With models" control the card and the asset page share.
// A hybrid never gets its own card: it is reached through its CPU asset's switch.

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

/** The grid's items: every hybrid whose CPU asset is listed is left out (the switch reaches it). */
export function gridItems<T extends Named>(items: readonly T[]): T[] {
  const names = new Set(items.map((i) => i.name));
  return items.filter((i) => {
    const base = baseOf(i.name);
    return !base || !names.has(base);
  });
}

const LABELS: Readonly<Record<Tier, string>> = { cpu: 'CPU tier', models: 'With models' };

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
