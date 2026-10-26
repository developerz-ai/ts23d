// Hero "how it works" strip: the contact sheet an agent reads, and two tiny engine examples of
// the named-node contract.

import { highlight } from './source.ts';

/** Every ts23d pivot keeps the recipe's local axes: Z is up, X is forward. */
const SAMPLES: Record<string, string> = {
  three: `const tank = (await loader.loadAsync('tiger_1_lod0.glb')).scene;
const turret = tank.getObjectByName('turret');
const gun = tank.getObjectByName('gun');
turret.rotation.z = yaw;  // local Z is up
gun.rotation.y = -pitch;  // local Y: trunnions`,
  godot: `var tank = preload("res://tiger_1_lod0.glb").instantiate()
add_child(tank)
var turret = tank.find_child("turret")
var gun = tank.find_child("gun")
turret.rotate_object_local(Vector3.BACK, yaw)  # local Z up
gun.rotate_object_local(Vector3.UP, -pitch)`,
};

/** Try each recipe's published contact sheet in turn; hide the figure if none is deployed. */
export function renderHero(root: HTMLElement, names: readonly string[]): void {
  for (const pre of root.querySelectorAll<HTMLElement>('[data-binding]')) {
    const code = pre.querySelector<HTMLElement>('code');
    const sample = SAMPLES[pre.dataset['binding'] ?? ''];
    if (code && sample) code.innerHTML = highlight(sample);
    // The samples can scroll sideways on narrow screens; keyboard users need to reach them.
    pre.tabIndex = 0;
  }

  const img = root.querySelector<HTMLImageElement>('[data-sheet]');
  const caption = root.querySelector<HTMLElement>('[data-sheet-caption]');
  if (!img) return;
  const queue = [...names];
  const next = (): void => {
    const name = queue.shift();
    if (!name) {
      img.hidden = true;
      if (caption)
        caption.textContent = 'Contact sheets ship with the Pages build under /renders/.';
      return;
    }
    img.src = contactSheetUrl(name);
    img.alt = `Contact sheet for ${name}: orthographic views the agent reads before its next edit`;
    if (caption) caption.textContent = `renders/${name}.png, the contact sheet from t3d shot`;
  };
  img.addEventListener('error', next);
  next();
}

/** Where the Pages build publishes each asset's contact sheet. */
export const contactSheetUrl = (name: string): string =>
  `${import.meta.env.BASE_URL}renders/${name}.png`;
