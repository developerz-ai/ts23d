// The registered model surface (register.ts) applied to a solid coat part, in two moves. `skin`:
// along the part's own normals onto the model's smoothed brick SDF (≤ 12 mm, smoothed over the
// mesh): every coat vertex, legs, tail and paws included. `shape`: a shrinkwrap onto the model
// mesh (Taubin-smoothed: its facets are not shape), taken by each vertex's share (masks.ts: head
// and jaw all of it, torso and neck most, forearms, shanks, paws and tail none) — the head gets the
// model's skull, muzzle and ears, the torso its ruff and chest (a smooth union: the code keeps its
// sourced girth where the model is slimmer). Pinches and new creases are relaxed out (wrap.ts),
// teeth ride the skin (ride.ts), and every vertex takes the model's texture by closest point.

import {
  type BuildContext,
  type Mesh,
  meshBrick,
  meshOffset,
  triBvh,
  type Vec3,
  warpMesh,
} from '@developerz.ai/ts23d';
import { closestColour, closestTexture } from '@developerz.ai/ts23d/finish';
import { type Coat, registerModel } from './register.ts';
import { ride } from './ride.ts';
import { BLEND, modelSurface } from './surface.ts';
import { mainShell, shrinkwrap, smoothOver, taubin, unfold, weld } from './wrap.ts';

/** World-space reshaping and colour from the registered model surface. */
export interface Hybrid {
  /** The skin move (≤ BLEND.skin.amp) onto the model's surface at a world point. */
  readonly skin: (p: Vec3) => Vec3;
  /** The silhouette move (≤ BLEND.shape.amp) onto the model's surface at a world point. */
  readonly shape: (p: Vec3) => Vec3;
  /** False at LOD2: its few hundred triangles take the colour only. */
  readonly moves: boolean;
  /** The model's colour at a world point and how much of it to take (0 = ours). */
  readonly colour: (p: Vec3) => { readonly c: Vec3; readonly w: number };
}

const hybrids = new Map<string, Hybrid>();

/** The hybrid for the code wolf's coat, or null on a cache miss. */
export function hybridOf(ctx: BuildContext, coat: Coat): Hybrid | null {
  const model = modelSurface(ctx);
  if (!model) return null;
  const key = `${model.key}:${ctx.lod}`;
  const seen = hybrids.get(key);
  if (seen) return seen;
  const registered = registerModel(model, coat, ctx.lod);
  const cell = ctx.lod === 0 ? BLEND.cell[0] : BLEND.cell[1];
  const reach = BLEND.shape.reach;
  const brick = meshBrick(registered, { cell, band: BLEND.skin.reach * 2 + cell * 2 });
  const skin = meshOffset(brick, { ...BLEND.skin, fine: Math.max(BLEND.fine, cell) });
  const sample = model.albedo
    ? closestTexture(registered, model.albedo)
    : closestColour(registered);
  const near = triBvh(registered);
  const smooth = triBvh(taubin(registered, BLEND.taubin));
  // The silhouette move: to the closest point of the model mesh, Taubin-smoothed (unsigned: a model's holes and
  // flipped patches cannot turn it inside out), full within `reach`, none past twice it.
  const q: [number, number, number] = [0, 0, 0];
  const shape = (p: Vec3): Vec3 => {
    const d = smooth.closest(p, q);
    if (d >= reach * 2) return [0, 0, 0];
    const t = d <= reach ? 1 : 2 - d / reach;
    const k = t * t * (3 - 2 * t);
    return [(q[0] - p[0]) * k, (q[1] - p[1]) * k, (q[2] - p[2]) * k];
  };
  const [r0, r1] = BLEND.texture;
  // The paws stay the code's (claws grow from them).
  const paws = (p: Vec3, d: Vec3): Vec3 => {
    const t = Math.max(0, Math.min(1, p[2] / BLEND.paws - 1));
    const k = t * t * (3 - 2 * t);
    return [d[0] * k, d[1] * k, d[2] * k];
  };
  const out: Hybrid = {
    skin: (p) => paws(p, skin(p)),
    shape: (p) => paws(p, shape(p)),
    moves: ctx.lod !== 2,
    colour: (p) => {
      const d = near.distance(p, r1);
      if (d >= r1) return { c: [0, 0, 0], w: 0 };
      const t = d <= r0 ? 1 : (r1 - d) / (r1 - r0);
      return { c: sample(p), w: BLEND.colour * t * t * (3 - 2 * t) };
    },
  };
  hybrids.set(key, out);
  return out;
}

/** The model's texture over our colours at the moved positions. */
function recolour(mesh: Mesh, at: Vec3, h: Hybrid): Mesh {
  const P = mesh.positions;
  const C = mesh.colors;
  const colors = new Float32Array(C.length);
  for (let i = 0; i < P.length; i += 3) {
    const s = h.colour([(P[i] ?? 0) + at[0], (P[i + 1] ?? 0) + at[1], (P[i + 2] ?? 0) + at[2]]);
    for (let a = 0; a < 3; a++) {
      const c = C[i + a] ?? 0;
      colors[i + a] = Math.max(0, Math.min(1, c + ((s.c[a] ?? 0) - c) * s.w));
    }
  }
  return { ...mesh, colors };
}

/** A solid coat part (`at`: its world offset; parts are placed by translation only) onto the
 *  model surface: first the skin move along its own normals (smoothed over the mesh, `rounds`),
 *  then each vertex of the main shell (not the teeth) takes `share` of a shrinkwrap onto the
 *  silhouette surface, `buried` vertices only inward (buriedIn); recoloured. */
export function hybridSolid(
  mesh: Mesh,
  at: Vec3,
  h: Hybrid,
  share: Float64Array,
  buried: Float64Array,
  rounds: number,
  mode: { readonly cone: boolean; readonly inward: number; readonly pin: boolean },
): Mesh {
  if (!h.moves) return recolour(mesh, at, h);
  const N = mesh.normals;
  const P = mesh.positions;
  const w = weld(mesh);
  const unit = (v: number): Vec3 => {
    const n: Vec3 = [N[v * 3] ?? 0, N[v * 3 + 1] ?? 0, N[v * 3 + 2] ?? 0];
    const l = Math.hypot(...n) || 1;
    return [n[0] / l, n[1] / l, n[2] / l];
  };
  const world = (v: number): Vec3 => [
    (P[v * 3] ?? 0) + at[0],
    (P[v * 3 + 1] ?? 0) + at[1],
    (P[v * 3 + 2] ?? 0) + at[2],
  ];
  const push = smoothOver(
    w,
    Float64Array.from({ length: P.length / 3 }, (_, v) => {
      const d = h.skin(world(v));
      const n = unit(v);
      return d[0] * n[0] + d[1] * n[1] + d[2] * n[2];
    }),
    rounds,
  );
  const base = new Float32Array(P.length);
  for (let v = 0; v < P.length / 3; v++) {
    const n = unit(v);
    for (let a = 0; a < 3; a++)
      base[v * 3 + a] = (P[v * 3 + a] ?? 0) + (n[a] ?? 0) * (push[v] ?? 0);
  }
  const shell = mainShell(w);
  const free = new Float64Array(w.n);
  const deep = new Float64Array(w.n);
  const normal = new Float64Array(w.n * 3);
  w.of.forEach((id, v) => {
    free[id] = Math.max(free[id] ?? 0, (share[v] ?? 0) * (shell[id] ?? 0));
    deep[id] = Math.max(deep[id] ?? 0, buried[v] ?? 0);
    normal.set(unit(v), id * 3);
  });
  // `cone`: the closest model point counts only near the vertex's own normal line (a skull
  // vertex must not fan out onto the back of an ear): full within ~30°, none past ~60°. The
  // torso goes without (its back drops straight down onto the model's lower withers).
  const move = (p: Vec3, id: number): Vec3 => {
    const d = h.shape(p);
    const l = Math.hypot(d[0], d[1], d[2]);
    if (!(l > 1e-9)) return d;
    const out =
      (d[0] * (normal[id * 3] ?? 0) +
        d[1] * (normal[id * 3 + 1] ?? 0) +
        d[2] * (normal[id * 3 + 2] ?? 0)) /
      l;
    const t = mode.cone ? Math.max(0, Math.min(1, (Math.abs(out) - 0.5) / 0.37)) : 1;
    const k = t * t * (3 - 2 * t) * (out > 0 || mode.pin ? 1 - (deep[id] ?? 0) : 1);
    return [d[0] * k, d[1] * k, d[2] * k];
  };
  const wrapped = shrinkwrap(
    { ...mesh, positions: base },
    w,
    at,
    free,
    move,
    BLEND.wrap,
    BLEND.settle,
  );
  // `inward` < 1 (the torso): the code's surface and the wrapped one meet in a smooth union —
  // the model adds mass (ruff, chest) and the code keeps its sourced girth where the model is
  // slimmer, filleted over BLEND.soft (a plain max leaves a concave crease where they cross).
  const r = BLEND.soft;
  const union = (sn: number): number =>
    Math.max(sn, 0) + Math.max(r - Math.abs(sn), 0) ** 2 / (4 * r);
  const disp = new Float32Array(P.length);
  for (let v = 0; v < P.length / 3; v++) {
    const id = w.of[v] ?? 0;
    const k = (share[v] ?? 0) * (shell[id] ?? 0);
    const n = normal.subarray(id * 3, id * 3 + 3);
    const D = [0, 1, 2].map(
      (a) => (wrapped[id * 3 + a] ?? 0) - (at[a] ?? 0) - (base[v * 3 + a] ?? 0),
    );
    const sn = (D[0] ?? 0) * (n[0] ?? 0) + (D[1] ?? 0) * (n[1] ?? 0) + (D[2] ?? 0) * (n[2] ?? 0);
    const f = mode.inward * sn + (1 - mode.inward) * union(sn);
    const slide = sn >= 0 ? 1 : mode.inward + (1 - mode.inward) * Math.max(0, 1 + sn / r) ** 2;
    for (let a = 0; a < 3; a++) {
      const tangent = (D[a] ?? 0) - (n[a] ?? 0) * sn;
      const b = base[v * 3 + a] ?? 0;
      disp[v * 3 + a] = b + (tangent * slide + (n[a] ?? 0) * f) * k - (P[v * 3 + a] ?? 0);
    }
  }
  // A pinch or fold-over the move left (a closest point that jumped sheets) is relaxed out.
  const x = new Float64Array(w.n * 3);
  w.of.forEach((id, v) => {
    for (let a = 0; a < 3; a++)
      x[id * 3 + a] = (P[v * 3 + a] ?? 0) + (disp[v * 3 + a] ?? 0) + (at[a] ?? 0);
  });
  unfold(mesh, w, at, x, free, BLEND.unfold, BLEND.crease);
  w.of.forEach((id, v) => {
    for (let a = 0; a < 3; a++)
      disp[v * 3 + a] = (x[id * 3 + a] ?? 0) - (at[a] ?? 0) - (P[v * 3 + a] ?? 0);
  });
  ride(P, disp, (v) => (shell[w.of[v] ?? 0] ?? 0) > 0);
  const moved = warpMesh(mesh, (_, v) => [
    disp[v * 3] ?? 0,
    disp[v * 3 + 1] ?? 0,
    disp[v * 3 + 2] ?? 0,
  ]);
  return recolour(moved, at, h);
}
