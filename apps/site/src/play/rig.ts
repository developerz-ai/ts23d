// The engine contract: bind gameplay to recipe part names. Nothing here knows a specific tank;
// it looks nodes up by the names recipes are required to use (`turret`, `gun`, `wheel_*`, …).

import { Box3, type Object3D, Vector3 } from 'three';

/** Running gear that rolls with the track: road wheels, sprockets, idlers, return rollers. */
export const RUNNING_GEAR = /^(road_)?wheel_|^sprocket|^idler|^return_roller/;

export interface Wheel {
  readonly node: Object3D;
  /** +1 left track, -1 right track (authoring +Y is left). */
  readonly side: 1 | -1;
  readonly radius: number;
}

export interface TankRig {
  readonly root: Object3D;
  readonly turret: Object3D | null;
  readonly gun: Object3D | null;
  /** What recoils on firing: `gun_barrel` if it survived pivot merging, else the `gun` pivot. */
  readonly barrel: Object3D | null;
  /** Hull length (authoring X) and width (authoring Y), metres. `root` must be front-to-X. */
  readonly length: number;
  readonly width: number;
  readonly wheels: readonly Wheel[];
  /** Half the distance between track centres, metres. */
  readonly halfTrack: number;
  /** Which names were bound, grouped into families for the on-screen toast. */
  readonly bound: readonly string[];
}

/** `wheel_l_3` → `wheel`, `sprocket_r` → `sprocket`, `road_wheel_l_0` → `road_wheel`. */
const family = (name: string): string => name.replace(/(_[lr])?(_\d+)?$/, '');

export function bindRig(root: Object3D): TankRig {
  root.updateMatrixWorld(true);
  const wheels: Wheel[] = [];
  root.traverse((node) => {
    if (!RUNNING_GEAR.test(node.name)) return;
    // Measured unmoved: authoring Z (up) is world Y, so the wheel's height is its diameter.
    const size = new Box3().setFromObject(node).getSize(new Vector3());
    const side =
      node.position.y !== 0 ? Math.sign(node.position.y) : /_l(_|$)/.test(node.name) ? 1 : -1;
    wheels.push({ node, side: side > 0 ? 1 : -1, radius: Math.max(0.1, size.y / 2) });
  });
  const ys = wheels.map((w) => Math.abs(w.node.position.y));
  const halfTrack = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 1.2;

  const turret = root.getObjectByName('turret') ?? null;
  const gun = root.getObjectByName('gun') ?? null;
  const barrelNode = root.getObjectByName('gun_barrel') ?? null;
  const barrel = barrelNode ?? gun;
  const hull = new Box3().setFromObject(root).getSize(new Vector3());

  const counts = new Map<string, number>();
  for (const w of wheels)
    counts.set(family(w.node.name), (counts.get(family(w.node.name)) ?? 0) + 1);
  const bound = [
    ...(turret ? ['turret → traverse (mouse X, Q/E)'] : []),
    ...(gun ? ['gun → elevation (mouse Y, R/F)'] : []),
    ...(barrelNode ? ['gun_barrel → recoil (Space)'] : gun ? ['gun → recoil (Space)'] : []),
    ...[...counts].map(([name, n]) => `${n} × ${name}_* → spin with track speed`),
  ];
  return { root, turret, gun, barrel, wheels, halfTrack, bound, length: hull.x, width: hull.z };
}
