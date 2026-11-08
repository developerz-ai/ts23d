// The viewer's DOM: the elements it writes to and the controls it listens to. Kept apart from the
// three.js side so the markup contract lives in one place.

const q = <T extends Element>(root: ParentNode, sel: string): T => {
  const node = root.querySelector<T>(sel);
  if (!node) throw new Error(`viewer markup is missing ${sel}`);
  return node;
};

export type Mode = 'studio' | 'scene';

export const bindUi = (root: ParentNode) => ({
  viewport: q<HTMLElement>(root, '[data-viewport]'),
  stats: q<HTMLElement>(root, '[data-viewer-stats]'),
  parts: q<HTMLOListElement>(root, '[data-parts]'),
  play: q<HTMLButtonElement>(root, '[data-play]'),
  scenario: q<HTMLElement>(root, '[data-scenario]'),
  wire: q<HTMLInputElement>(root, '[data-wireframe]'),
  textures: q<HTMLInputElement>(root, '[data-textures]'),
  downloads: q<HTMLElement>(root, '[data-downloads]'),
  status: q<HTMLElement>(root, '[data-viewer-status]'),
  loading: q<HTMLElement>(root, '[data-loading]'),
  lod0: q<HTMLButtonElement>(root, '[data-load-lod0]'),
  lods: [...root.querySelectorAll<HTMLInputElement>('input[name="lod"]')],
  modes: [...root.querySelectorAll<HTMLInputElement>('input[name="mode"]')],
});

export type ViewerUi = ReturnType<typeof bindUi>;

export interface ViewerActions {
  lod(lod: 0 | 1 | 2): void;
  mode(mode: Mode): void;
  play(): void;
  wireframe(on: boolean): void;
  textures(on: boolean): void;
}

export function wireUi(ui: ViewerUi, act: ViewerActions): void {
  for (const r of ui.lods)
    r.addEventListener('change', () => r.checked && act.lod(Number(r.value) as 0 | 1 | 2));
  for (const r of ui.modes)
    r.addEventListener(
      'change',
      () => r.checked && act.mode(r.value === 'scene' ? 'scene' : 'studio'),
    );
  ui.play.addEventListener('click', () => act.play());
  ui.wire.addEventListener('change', () => act.wireframe(ui.wire.checked));
  ui.textures.addEventListener('change', () => act.textures(ui.textures.checked));
}

export function syncUi(ui: ViewerUi, lod: number, mode: Mode, playing: boolean): void {
  for (const r of ui.lods) r.checked = Number(r.value) === lod;
  for (const r of ui.modes) r.checked = r.value === mode;
  ui.play.textContent = playing ? 'Pause' : mode === 'scene' ? 'Play scene' : 'Play motion';
  ui.play.setAttribute('aria-pressed', String(playing));
  ui.scenario.hidden = mode !== 'scene';
}
