// Scene composition: the terrain, the light, and every recipe other than the player's tank placed
// as scenery. Props get three distance LODs, each compiled from the recipe at that LOD (not
// decimated), so the HUD's triangle count drops the way it would in a game.

import {
  type AnimationClip,
  AnimationMixer,
  Box3,
  BufferGeometry,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Line,
  LineBasicMaterial,
  LOD,
  Mesh,
  type Object3D,
  Scene,
  Vector3,
} from 'three';
import { frontToX } from '../axes.ts';
import { type AssetInfo as Asset, build, LODS, loadBuilt, recipe } from '../compile.ts';
import { prng } from '../noise.ts';
import type { Particles } from '../particles.ts';
import type { Recipe } from '../recipes.ts';
import { token } from '../theme.ts';
import { groundY, isOpenGround, LANDMARK, RAIL, TOWN_Y } from './height.ts';
import { fitToGround, terrainChunks } from './terrain.ts';

export interface Levels {
  readonly asset: Asset;
  readonly objects: readonly Object3D[];
  readonly clip: AnimationClip | null;
  /** Footprint radius on the ground, metres. */
  readonly radius: number;
  readonly length: number;
  readonly width: number;
}

export interface World {
  readonly scene: Scene;
  readonly sun: DirectionalLight;
  /** Prop LODs (the HUD reports their level mix). */
  readonly lods: readonly LOD[];
  readonly terrain: readonly LOD[];
  readonly mixers: readonly AnimationMixer[];
  readonly movers: readonly ((dt: number) => void)[];
  readonly props: readonly string[];
  readonly emitters: readonly string[];
}

type Role = 'rail' | 'landmark' | 'building' | 'tree' | 'lamp' | 'vehicle' | 'prop';

const words = (a: Asset): string => [a.name, a.kind, ...(a.tags ?? [])].join(' ').toLowerCase();

function roleOf(a: Asset, radius: number): Role {
  const w = words(a);
  if (/loco|locomotive|train|rail/.test(w)) return 'rail';
  if (/landmark|monument|tower/.test(w) || radius > 30) return 'landmark';
  if (/tree|vegetation|plant|bush|palm|pine|oak/.test(w)) return 'tree';
  if (a.kind === 'building') return 'building';
  if (/lamp|light|post/.test(w)) return 'lamp';
  if (a.kind === 'vehicle') return 'vehicle';
  return 'prop';
}

/** Prefer the Tiger, then the T-34, then any vehicle with a turret, then any vehicle. */
export async function pickPlayer(recipes: readonly Recipe[]): Promise<Asset | null> {
  const assets = recipes.map((r) => r.asset);
  const named = (n: string): Asset | undefined => assets.find((a) => a.name === n);
  const named0 = named('tiger_1') ?? named('t34');
  if (named0) return named0;
  // Otherwise ask the worker which vehicle has a `turret` pivot. Only runs when names don't match.
  for (const a of assets.filter((x) => x.kind === 'vehicle')) {
    const built = await build(recipe(a.name, 2));
    if (built.parts.some((p) => p.name === 'turret')) return a;
  }
  return assets.find((a) => a.kind === 'vehicle') ?? null;
}

export async function loadLevels(asset: Asset): Promise<Levels> {
  const loaded = await Promise.all(LODS.map((lod) => loadBuilt(recipe(asset.name, lod))));
  // Wrapped so the asset's front is +X, the frame `stand` and the terrain use.
  const objects = loaded.map((l) => frontToX(l.scene));
  const clip = loaded[0]?.animations.find((c) => c.name === 'run') ?? null;
  const size = objects[0]
    ? new Box3().setFromObject(objects[0]).getSize(new Vector3())
    : new Vector3(2, 2, 2);
  return {
    asset,
    objects,
    clip,
    radius: Math.max(1.5, Math.hypot(size.x, size.z) / 2),
    length: Math.max(0.5, size.x),
    width: Math.max(0.5, size.z),
  };
}

interface Placer {
  readonly scene: Scene;
  readonly lods: LOD[];
  readonly mixers: AnimationMixer[];
  readonly particles: Particles;
  readonly emitters: string[];
}

/** One prop instance: three LOD levels, its baked clip if it should animate, its emitters. */
function instance(levels: Levels, animate: boolean, moving: () => number, p: Placer): LOD {
  const lod = new LOD();
  // Swap distances scale with the asset (a lamp drops detail sooner than a station), capped so
  // a huge landmark still drops to LOD1 a reasonable way off.
  const at = [0, Math.min(levels.radius * 7, 60), Math.min(levels.radius * 20, 150)];
  levels.objects.forEach((o, i) => {
    const copy = o.clone();
    copy.traverse((n) => {
      if (n instanceof Mesh) n.castShadow = true;
    });
    if (animate && levels.clip) {
      const mixer = new AnimationMixer(copy);
      mixer.clipAction(levels.clip).play();
      p.mixers.push(mixer);
    }
    // Emitters only on the LOD0 copy, so smoke doesn't triple when levels swap.
    if (i === 0) {
      const names = p.particles.attach(copy, (e) =>
        (e.when ?? 'always') === 'moving' ? moving() : 1,
      );
      for (const n of names) p.emitters.push(`${levels.asset.name}/${n}`);
    }
    lod.addLevel(copy, at[i] ?? 0);
  });
  return lod;
}

/** Stand an object on the terrain at (x, z) facing `heading`. */
function stand(o: Object3D, levels: Levels, x: number, z: number, heading: number): void {
  const fit = fitToGround(x, z, heading, levels.length * 0.8, levels.width * 0.8);
  o.rotation.order = 'YZX';
  o.position.set(x, fit.y, z);
  o.rotation.set(fit.roll, heading, fit.pitch);
}

function place(lod: LOD, levels: Levels, x: number, z: number, heading: number, p: Placer): void {
  stand(lod, levels, x, z, heading);
  p.scene.add(lod);
  p.lods.push(lod);
}

/** Two rails following the ground round the loop. */
function railLoop(scene: Scene, cx: number, cz: number, r: number): void {
  const mat = new LineBasicMaterial({ color: token('--ink') });
  for (const off of [-0.72, 0.72]) {
    const pts: Vector3[] = [];
    for (let i = 0; i <= 240; i++) {
      const a = (i / 240) * Math.PI * 2;
      const x = cx + (r + off) * Math.cos(a);
      const z = cz - (r + off) * Math.sin(a);
      pts.push(new Vector3(x, groundY(x, z) + 0.08, z));
    }
    scene.add(new Line(new BufferGeometry().setFromPoints(pts), mat));
  }
}

export async function composeWorld(
  recipes: readonly Recipe[],
  player: Asset,
  particles: Particles,
): Promise<World> {
  const scene = new Scene();
  const sky = token('--paper');
  scene.background = sky;
  scene.fog = new Fog(sky, 90, 280);
  scene.add(new HemisphereLight(0xdfe8ff, 0x4a4434, 1.5));
  const sun = new DirectionalLight(0xfff4e0, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -45,
    right: 45,
    top: 45,
    bottom: -45,
    near: 1,
    far: 160,
  });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target, particles.object);

  const terrain = await terrainChunks();
  for (const chunk of terrain) scene.add(chunk);

  const p: Placer = { scene, lods: [], mixers: [], particles, emitters: [] };
  const movers: ((dt: number) => void)[] = [];
  // Test cards and swatch sheets are recipes too, but not scenery.
  const props = recipes
    .map((r) => r.asset)
    .filter((a) => a !== player && !/swatch|test card|calibration/i.test(words(a) + a.description));
  const next = prng(23);
  const rng = { range: (a: number, b: number): number => a + (b - a) * next() };
  const all = await Promise.all(props.map(loadLevels));
  const still = (): number => 0;
  const going = (): number => 1;

  // Town street along authoring y = TOWN_Y, i.e. world z = -TOWN_Y.
  const streetZ = -TOWN_Y;
  let street = -110;
  let vehicles = 0;
  for (const levels of all) {
    const role = roleOf(levels.asset, levels.radius);
    const r = levels.radius;
    if (role === 'rail') {
      const cx = RAIL.x;
      const cz = -RAIL.y;
      const R = Math.max(RAIL.r, r * 4);
      railLoop(scene, cx, cz, R);
      const lod = instance(levels, true, going, p);
      place(lod, levels, cx + R, cz, Math.PI / 2, p);
      let a = 0;
      movers.push((dt) => {
        a += (9 / R) * dt;
        const x = cx + R * Math.cos(a);
        const z = cz - R * Math.sin(a);
        stand(lod, levels, x, z, a + Math.PI / 2);
      });
    } else if (role === 'landmark') {
      // On its own flattened rise, on the skyline: authoring (x, y) → world (x, -y).
      place(instance(levels, true, still, p), levels, LANDMARK.x, -LANDMARK.y, Math.PI * 0.75, p);
    } else if (role === 'tree') {
      // Copses on open ground, clear of the start area, the town and the tracks.
      let planted = 0;
      for (let tries = 0; planted < 16 && tries < 400; tries++) {
        const ang = rng.range(0, Math.PI * 2);
        const d = rng.range(45, 185);
        const x = Math.cos(ang) * d;
        const z = Math.sin(ang) * d;
        if (!isOpenGround(x, -z)) continue;
        place(instance(levels, true, still, p), levels, x, z, rng.range(0, Math.PI * 2), p);
        planted++;
      }
    } else if (role === 'building') {
      for (const side of [-1, 1]) {
        const z = streetZ + side * (r + 7);
        place(
          instance(levels, true, still, p),
          levels,
          street + r,
          z,
          side > 0 ? Math.PI / 2 : -Math.PI / 2,
          p,
        );
      }
      street += r * 2 + 6;
    } else if (role === 'lamp') {
      for (let x = -100; x <= 100; x += 25) {
        place(instance(levels, true, still, p), levels, x, streetZ + 6, 0, p);
        place(instance(levels, true, still, p), levels, x + 12, streetZ - 6, Math.PI, p);
      }
    } else if (role === 'vehicle') {
      // A parked column climbing into the hills: near copies at LOD0, far ones at LOD2.
      for (let i = 0; i < 6; i++) {
        const x = 22 + i * 26 + vehicles * 6;
        const z = 18 + vehicles * 14 + (i % 2) * 5;
        place(
          instance(levels, false, still, p),
          levels,
          x,
          z,
          Math.PI / 2 + rng.range(-0.25, 0.25),
          p,
        );
      }
      vehicles++;
    } else {
      for (let i = 0; i < 8; i++) {
        const ang = rng.range(0, Math.PI * 2);
        const d = rng.range(25, 140);
        place(
          instance(levels, true, still, p),
          levels,
          Math.cos(ang) * d,
          Math.sin(ang) * d,
          rng.range(0, Math.PI * 2),
          p,
        );
      }
    }
  }
  return {
    scene,
    sun,
    lods: p.lods,
    terrain,
    mixers: p.mixers,
    movers,
    props: props.map((a) => a.name),
    emitters: p.emitters,
  };
}
