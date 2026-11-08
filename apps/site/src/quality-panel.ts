// The asset page's quality panel: the committed critique (rubric scores 0–10 with the reviewer's
// reasons) and the measured art metrics behind it (silhouette IoU per view, focal parts, rest
// share, shape class), plus what the manifest measures (LOD reduction, weathering coverage,
// joints). Hidden when there is nothing to show.

import { loadFacts } from './facts.ts';
import type { Item } from './items.ts';
import type { MediaCritique, MediaFacts } from './media-types.ts';

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

const pct = (f: number): string => `${(f * 100).toFixed(f < 0.1 ? 1 : 0)}%`;

function scores(c: MediaCritique): HTMLElement {
  const list = el('ul', undefined, 'scores');
  for (const [k, v] of Object.entries(c.scores)) {
    const li = el('li');
    const meter = el('meter');
    meter.min = 0;
    meter.max = 10;
    meter.low = 5;
    meter.high = 7;
    meter.optimum = 10;
    meter.value = v.score;
    meter.setAttribute('aria-label', `${k} ${v.score} of 10`);
    const row = el('div', undefined, 'score-row');
    row.append(el('span', k, 'score-k'), meter, el('span', String(v.score), 'score-v'));
    const why = el('details');
    why.append(el('summary', 'why'), el('p', v.reason));
    li.append(row, why);
    list.append(li);
  }
  return list;
}

function metric(k: string, v: string, ok?: boolean): HTMLElement[] {
  const dd = el('dd', v);
  if (ok !== undefined) dd.className = ok ? 'ok' : 'warn';
  return [el('dt', k), dd];
}

function metrics(item: Item, f: MediaFacts | null): HTMLElement {
  const dl = el('dl', undefined, 'metrics');
  const c = f?.critique;
  for (const s of c?.silhouette ?? [])
    dl.append(...metric(`silhouette IoU · ${s.view}`, s.iou.toFixed(3), s.iou >= 0.85));
  if (c?.rest)
    dl.append(
      ...metric(
        'rest share',
        `${pct(c.rest.share)} (min ${pct(c.rest.min)})`,
        c.rest.share >= c.rest.min,
      ),
    );
  if (c?.shape) dl.append(...metric('shape language', c.shape));
  if (c?.focal.length)
    dl.append(
      ...metric('focal parts', c.focal.map((p) => `${p.part} ${pct(p.share)}`).join(' · ')),
    );
  const t = item.media?.triangles ?? [];
  const [l0, l1, l2] = t;
  if (l0 && l1 && l2)
    dl.append(...metric('LOD1 / LOD2 of LOD0', `${pct(l1 / l0)} / ${pct(l2 / l0)}`));
  for (const w of f?.weather ?? [])
    dl.append(
      ...metric(
        `weather · ${w.effect}`,
        `${w.actual.toFixed(3)} (target ${w.target.toFixed(3)}, ${w.area.toFixed(1)} m²)`,
      ),
    );
  if (f?.joints) dl.append(...metric('checked joints', String(f.joints)));
  return dl;
}

let token = 0;

export function renderQuality(section: HTMLElement, item: Item): void {
  const ticket = ++token;
  const body = section.querySelector<HTMLElement>('[data-quality]');
  section.hidden = true;
  void loadFacts(item).then((f) => {
    if (ticket !== token || !body) return;
    const c = f?.critique ?? null;
    const parts: HTMLElement[] = [];
    if (c) {
      const head = el('p', undefined, 'overall');
      head.append(el('strong', c.overall.toFixed(1)), ` / 10 overall · reviewed by ${c.reviewer}`);
      parts.push(head, scores(c));
    }
    const m = metrics(item, f);
    if (m.childElementCount) parts.push(m);
    body.replaceChildren(...parts);
    section.hidden = parts.length === 0;
  });
}
