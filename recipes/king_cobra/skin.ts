// Cobra weights. Turns of the pile lie a body-width apart, so distance alone would tie one turn to the
// next and tear the skin in every clip that unwinds it. Each vertex finds its nearest spine bone, then
// blends only with that bone's neighbours along the body (and the hood ribs, on the neck).

import {
  type BodyPlan,
  capsuleDistance,
  type Mesh,
  SKIN_INFLUENCES,
  type Vec3,
} from '@developerz.ai/ts23d';

const STEPS = 255;

/** Largest-remainder 1/255 weights, heaviest first, summing to exactly 1. */
function quantised(pairs: readonly (readonly [number, number])[]): [number, number][] {
  const top = [...pairs].sort((a, b) => b[1] - a[1]).slice(0, SKIN_INFLUENCES);
  const sum = top.reduce((t, p) => t + p[1], 0);
  const raw = top.map((p) => (p[1] / sum) * STEPS);
  const q = raw.map(Math.floor);
  let left = STEPS - q.reduce((t, v) => t + v, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left-- <= 0) break;
    q[i] = (q[i] ?? 0) + 1;
  }
  return top.map((p, i): [number, number] => [p[0], q[i] ?? 0]).filter((p) => p[1] > 0);
}

export interface BodySkin {
  readonly spine: readonly string[];
  readonly ribs: readonly string[];
  /** Spine links, from the head, whose skin may follow the hood ribs. */
  readonly hoodLinks: number;
  /** Neighbour links each side that may share a vertex. */
  readonly window: number;
  readonly blend: number;
}

export function skinBody(mesh: Mesh, plan: BodyPlan, o: BodySkin): Mesh {
  const index = new Map(plan.bones.map((b, i) => [b.name, i]));
  const capsule = (name: string) => {
    const b = plan.bones[index.get(name) ?? 0];
    return { a: b?.head ?? ([0, 0, 0] as Vec3), b: b?.tail ?? ([0, 0, 0] as Vec3) };
  };
  const spine = o.spine.map(capsule);
  const ribs = o.ribs.map(capsule);
  const count = mesh.positions.length / 3;
  const joints = new Uint16Array(count * SKIN_INFLUENCES);
  const weights = new Float32Array(count * SKIN_INFLUENCES);
  for (let v = 0; v < count; v++) {
    const p: Vec3 = [
      mesh.positions[v * 3] ?? 0,
      mesh.positions[v * 3 + 1] ?? 0,
      mesh.positions[v * 3 + 2] ?? 0,
    ];
    let [near, best] = [0, Infinity];
    spine.forEach((c, i) => {
      const d = capsuleDistance(p, c);
      if (d < best) [near, best] = [i, d];
    });
    const found: [number, number][] = [];
    const lo = Math.max(0, near - o.window);
    const hi = Math.min(spine.length - 1, near + o.window);
    for (let i = lo; i <= hi; i++)
      found.push([i, capsuleDistance(p, spine[i] ?? (spine[0] as never))]);
    const all: [number, number][] = found.map(([i, d]) => [index.get(o.spine[i] ?? '') ?? 0, d]);
    if (near < o.hoodLinks)
      ribs.forEach((c, i) => {
        all.push([index.get(o.ribs[i] ?? '') ?? 0, capsuleDistance(p, c)]);
      });
    const min = Math.min(...all.map((x) => x[1]));
    const pairs = all
      .map(([j, d]) => [j, Math.exp(-(d - min) / o.blend)] as const)
      .filter((x) => x[1] > 0.0025);
    quantised(pairs).forEach(([j, w], s) => {
      joints[v * SKIN_INFLUENCES + s] = j;
      weights[v * SKIN_INFLUENCES + s] = w / STEPS;
    });
  }
  return { ...mesh, joints, weights };
}
