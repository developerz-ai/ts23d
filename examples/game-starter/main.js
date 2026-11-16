// game-starter: game code written from the build's contract alone. index.json lists the assets,
// manifest.json gives the GLB path, the clips (name, seconds, loop, ground speed in m/s), sockets
// and hitboxes; the GLB carries the meshes and animations under the same names. The asset walks
// forward at the clip's own `speed`, so the feet do not slide. ?asset=wolf&clip=walk picks them.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MODELS = '/models';
const params = new URLSearchParams(location.search);
const hud = document.getElementById('hud');

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#9fb3c4');
scene.fog = new THREE.Fog('#9fb3c4', 12, 40);
scene.add(new THREE.HemisphereLight('#dfe9f2', '#5b5347', 1.6));
const sun = new THREE.DirectionalLight('#fff4e0', 2.4);
sun.position.set(4, 8, 5);
sun.castShadow = true;
scene.add(sun);
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  new THREE.MeshStandardMaterial({ color: '#d9dee3', roughness: 0.95 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
scene.add(new THREE.GridHelper(80, 80, '#8c96a0', '#b8c0c8'));

const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.05, 200);
const controls = new OrbitControls(camera, renderer.domElement);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const json = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status} (build first: bun run assets)`);
  return r.json();
};

async function main() {
  const index = await json(`${MODELS}/index.json`);
  const names = (index.assets ?? []).map((a) => a.name);
  const name = params.get('asset') ?? names.find((n) => n === 'wolf') ?? names[0];
  const manifest = await json(`${MODELS}/${name}/manifest.json`);
  const file = manifest.files.single ?? manifest.files.lods[0];
  const gltf = await new GLTFLoader().loadAsync(`${MODELS}/${name}/${file}`);
  const model = gltf.scene;
  model.traverse((o) => {
    if (o.userData?.ts23d?.collider) o.visible = false; // collider helpers (--physics)
    if (o.isMesh) o.castShadow = true;
  });
  scene.add(model);

  // ts23d's +X front, as three.js sees it after the GLB's Z-up → Y-up root rotation.
  const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(model.children[0].quaternion);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3()).length();
  controls.target.set(0, box.max.y * 0.5, 0);
  camera.position.set(size * 1.8, size * 0.7, size * 1.8);

  const mixer = new THREE.AnimationMixer(model);
  const clips = manifest.clips ?? [];
  let current = null;
  const play = (clipName) => {
    const info = clips.find((c) => c.name === clipName);
    const clip = gltf.animations.find((a) => a.name === clipName)?.clone();
    // A single MSFT_lod file also animates the LOD1/2 skeletons; drop tracks for nodes this
    // loader did not create (it draws LOD0 only).
    if (clip) clip.tracks = clip.tracks.filter((t) => model.getObjectByName(t.name.split('.')[0]));
    if (!info || !clip) return;
    mixer.stopAllAction();
    const action = mixer.clipAction(clip);
    action.setLoop(info.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = !info.loop;
    action.play();
    current = info;
    for (const b of hud.querySelectorAll('button'))
      b.classList.toggle('on', b.dataset.clip === clipName);
  };

  hud.innerHTML = `<b>${name}</b> <small>${manifest.kind} · ${manifest.triangles.join('/')} tris</small><br>
    ${clips.map((c) => `<button data-clip="${c.name}">${c.name}</button>`).join('')}<br>
    <small>sockets: ${manifest.sockets.map((s) => s.name).join(', ') || 'none'} ·
    hitboxes: ${(manifest.hitboxes ?? []).map((h) => h.bone).join(', ') || 'build with --physics'}</small>`;
  for (const b of hud.querySelectorAll('button')) b.onclick = () => play(b.dataset.clip);
  const wanted = params.get('clip') ?? clips.find((c) => c.name === 'walk')?.name ?? clips[0]?.name;
  if (wanted) play(wanted);
  window.t3dReady = true; // for screenshots

  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    mixer.update(dt);
    if (current?.loop && current.speed > 0) {
      model.position.addScaledVector(forward, current.speed * dt);
      if (model.position.length() > 6) model.position.set(0, 0, 0).addScaledVector(forward, -6);
      controls.target.set(model.position.x, box.max.y * 0.5, model.position.z);
    }
    controls.update();
    renderer.render(scene, camera);
  });
}

main().catch((e) => {
  hud.textContent = String(e.message ?? e);
  console.error(e);
});
