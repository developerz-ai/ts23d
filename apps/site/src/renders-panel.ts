// The asset page's committed renders: the contact sheet (what the agent reads after every edit),
// the dimensioned blueprint, and for strategy-kit assets the command-card icon, the unit portrait
// and the in-game RTS camera shot. Each opens full size in a new tab.

import { loadFacts } from './facts.ts';
import type { Item } from './items.ts';
import type { MediaImage } from './media-types.ts';

const CAPTIONS: Readonly<Record<'sheet' | MediaImage, string>> = {
  sheet: 'Contact sheet: six orthographic views and the far LOD',
  blueprint: 'Blueprint: dimensioned orthographic views',
  icon: 'Command-card icon',
  portrait: 'Unit portrait',
  rts: 'In-game view from an RTS camera',
};

function figure(kind: 'sheet' | MediaImage, src: string, name: string): HTMLElement {
  const fig = document.createElement('figure');
  fig.className = `render render-${kind}`;
  const a = document.createElement('a');
  a.href = src;
  a.target = '_blank';
  a.rel = 'noopener';
  const img = document.createElement('img');
  img.src = src;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.alt = `${CAPTIONS[kind]} of ${name}`;
  a.append(img);
  const cap = document.createElement('figcaption');
  cap.textContent = CAPTIONS[kind];
  fig.append(a, cap);
  return fig;
}

let token = 0;

export function renderRenders(section: HTMLElement, item: Item): void {
  const ticket = ++token;
  const body = section.querySelector<HTMLElement>('[data-renders]');
  const sheet = item.media?.sheet;
  const first = sheet ? [figure('sheet', sheet, item.name)] : [];
  body?.replaceChildren(...first);
  section.hidden = first.length === 0;
  void loadFacts(item).then((facts) => {
    if (ticket !== token || !facts || !body) return;
    const order: MediaImage[] = ['blueprint', 'icon', 'portrait', 'rts'];
    const more = order.flatMap((k) => {
      const src = facts.images[k];
      return src ? [figure(k, src, item.name)] : [];
    });
    body.append(...more);
    section.hidden = first.length + more.length === 0;
  });
}
