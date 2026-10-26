// Hero "how it works" strip: the contact sheet an agent reads, and the engine-side binding code.

import { highlight } from './source.ts';

/** The three.js an engine needs to drive a ts23d tank: names in, behaviour out. */
export const BINDING_SAMPLE = `import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const { scene: tank } = await new GLTFLoader().loadAsync('tiger_1_lod0.glb');
const turret = tank.getObjectByName('turret');  // yaws about its local Z
const gun = tank.getObjectByName('gun');        // pitches about its local Y
const wheels = [];
tank.traverse((n) => {
  if (/^(road_)?wheel_|^sprocket|^idler/.test(n.name)) wheels.push(n);
});

function drive(dt, speed, aimYaw, aimPitch) {
  turret.rotation.z = aimYaw;
  gun.rotation.y = -aimPitch;
  for (const w of wheels) w.rotation.y += (speed / 0.4) * dt;
}`;

/** Try each recipe's published contact sheet in turn; hide the figure if none is deployed. */
export function renderHero(root: HTMLElement, names: readonly string[]): void {
  const pre = root.querySelector<HTMLElement>('[data-binding]');
  const code = pre?.querySelector<HTMLElement>('code');
  if (code) code.innerHTML = highlight(BINDING_SAMPLE);
  // The sample can scroll sideways on narrow screens; keyboard users need to reach it.
  if (pre) pre.tabIndex = 0;

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
    img.src = `${import.meta.env.BASE_URL}renders/${name}.png`;
    img.alt = `Contact sheet for ${name}: orthographic views the agent reads before its next edit`;
    if (caption) caption.textContent = `renders/${name}.png, the contact sheet from t3d shot`;
  };
  img.addEventListener('error', next);
  next();
}
