// The "how it works" strip: the contact sheet an agent reads, and two tiny engine examples of the
// named-node contract.

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

/** Fill the "how it works" strip: highlighted engine samples and one real contact sheet. */
export function renderHow(root: HTMLElement, sheet: { name: string; src: string } | null): void {
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
  if (!sheet) {
    img.closest('figure')?.setAttribute('hidden', '');
    return;
  }
  img.src = sheet.src;
  img.alt = `Contact sheet for ${sheet.name}: orthographic views the agent reads before its next edit`;
  if (caption)
    caption.textContent = `recipes/${sheet.name}/out/${sheet.name}/sheet.png, from t3d shot`;
}
