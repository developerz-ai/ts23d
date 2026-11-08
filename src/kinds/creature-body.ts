// The body sculpt (trunk, neck, legs, tail, wings, fins as ONE sculpt so every join is a smooth
// blend), in stages, each its own function:
//   blockOut  trunk masses (ribcage, loin, pelvis), the neck and tail skins, body chains
//   planes    none by default: a mammal's back and flanks are round; planed flanks read as a box
//             (tiger dossier). The narrow, deep trunk comes from the masses' radii.
//   features  scapulae at the withers, the brisket keel, gluteals and croup → tail root, the ruff,
//             a spine ridge (LOD0/1); legs (creature-limbs.ts); wings; fins
//   ground    flat soles: everything below z = 0 is cut away so feet rest on the ground plane.

import type { Vec3 } from '../core/index.ts';
import type { SculptEdit } from '../primitives/index.ts';
import type { Bones, Wing } from './creature-bones.ts';
import { v3 } from './creature-curve.ts';
import { legEdits } from './creature-limbs.ts';
import { blade, blob, skin, tube } from './creature-skin.ts';
import type { CreatureSpec } from './creature-spec.ts';

/** Block-out: the primary masses. */
export function blockOut(b: Bones): SculptEdit[] {
  // Mammal trunks blend wide (ribcage → loin → pelvis read as one torso); other plans tighter.
  const k = b.skeleton === 'quadruped' || b.skeleton === 'winged' ? 1.6 : 0.9;
  const out: SculptEdit[] = b.trunk.map((m, i) =>
    blob(m.at, m.r, i === 0 ? 0 : Math.min(m.r[1], m.r[2]) * k, m.rotate),
  );
  const r0 = b.neck[0]?.r ?? 0.05;
  if (b.neck.length > 1) out.push(skin(b.neck, { blend: r0 * 0.5 }));
  if (b.chain.length > 1) out.push(skin(b.chain, { blend: (b.chain[0]?.r ?? 0.05) * 0.4 }));
  if (b.tail.length > 1) out.push(skin(b.tail, { blend: (b.tail[0]?.r ?? 0.03) * 0.8 }));
  return out;
}

/** Planes: intentionally none (see the header). */
export function planes(_b: Bones): SculptEdit[] {
  return [];
}

/** Mammal landmarks on the trunk: withers, brisket, gluteals, croup, ruff, spine. */
function trunkFeatures(b: Bones, s: CreatureSpec, lod: number): SculptEdit[] {
  const [chest, , pelvis] = b.trunk;
  if (!chest || !pelvis || (b.skeleton !== 'quadruped' && b.skeleton !== 'winged')) return [];
  const D = chest.r[2] * 2;
  const W = chest.r[1] * 2;
  const top = chest.at[2] + chest.r[2];
  const out: SculptEdit[] = [
    // Scapula: a long flat blade on the ribs rolling under the skin, its top at the withers.
    blob(
      [chest.at[0] + chest.r[0] * 0.5, W * 0.3, top - D * 0.3],
      [D * 0.2, W * 0.12, D * 0.3],
      D * 0.22,
      [0, -28, 0],
    ),
    // Brisket: the deep keel of the chest between the forelegs.
    blob(
      [chest.at[0] + chest.r[0] * 0.55, 0, chest.at[2] - D * 0.25],
      [chest.r[0] * 0.5, W * 0.3, D * 0.26],
      D * 0.2,
    ),
    // Gluteals: the rump's masses either side of the sacrum.
    blob(
      [pelvis.at[0] - pelvis.r[0] * 0.2, W * 0.24, pelvis.at[2] + pelvis.r[2] * 0.3],
      [pelvis.r[0] * 0.8, W * 0.22, pelvis.r[2] * 0.7],
      D * 0.15,
      [0, 18, 0],
    ),
  ];
  const tr = b.tail[0];
  if (tr)
    // Croup → tail root: the stump runs on past the root inside the tail, so it leaves tangentially.
    out.push(
      skin(
        tube(
          [pelvis.at, b.tailRoot, b.tail[2]?.at ?? b.tailRoot],
          (t) => pelvis.r[2] * 0.55 * (1 - t) + tr.r * t,
        ),
        {
          blend: D * 0.25,
        },
      ),
    );
  const ruff = s.build?.ruff ?? 0;
  if (ruff > 0 && b.neck.length > 1) {
    // Ruff: long guard hair on the nape, round the throat and down the chest.
    out.push(
      skin(
        // Stops short of the skull: the mane lies on the nape, it does not hood the head.
        // Its rear end tapers into the withers (a blunt end cap read as a fold over the shoulder).
        b.neck.slice(0, -1).map((n, i, all) => ({
          at: v3.add(n.at, [0, 0, n.r * 0.3]),
          r:
            i === 0
              ? n.r * 0.25 + ruff * 0.3
              : n.r * 0.55 + ruff * (1 - (0.7 * i) / Math.max(1, all.length - 1)),
        })),
        { blend: ruff * 2.5 },
      ),
      // The throat ruff hangs low at the base of the neck, over the brisket; the throat under
      // the jaw stays clear so the neck reads.
      blob(
        v3.add(b.neck[1]?.at ?? chest.at, [0, 0, -(b.neck[1]?.r ?? 0) * 0.9]),
        [ruff * 2, (b.neck[1]?.r ?? 0) * 0.8, ruff * 2.2],
        ruff * 2,
      ),
    );
  }
  if (lod < 2)
    // Spine: the dorsal line as a soft ridge.
    out.push(
      skin(
        tube(
          b.spine.map((p): Vec3 => [p[0], 0, p[2] - D * 0.1]),
          () => D * 0.1,
        ),
        // Wide blend: a narrow ridge standing over the dip behind the withers read as a fold.
        { blend: D * 0.3 },
      ),
    );
  return out;
}

/** A wing: arm bones as a skin and the membrane as a thin slab bounded by its outline. */
function wingEdits(w: Wing, res: number, colour: Vec3): SculptEdit[] {
  const r = w.arm[0]?.r ?? 0.02;
  if (w.folded)
    return [
      blade(w.arm, [0, 1, 0.25], Math.max(r * 0.3, res * 0.7), { blend: r * 0.6, color: colour }),
    ];
  const out: SculptEdit[] = [skin(w.arm, { blend: r * 0.5 })];
  for (const t of w.tips) {
    const wrist = w.arm[w.arm.length - 1];
    if (wrist)
      out.push(skin([wrist, { at: t, r: Math.max(r * 0.25, res * 0.6) }], { blend: r * 0.2 }));
  }
  // Membrane plane from the outline's Newell normal; 2D outline in (e1, e2).
  const pts = w.membrane;
  let n: Vec3 = [0, 0, 0];
  for (let i = 0; i < pts.length; i++)
    n = v3.add(n, v3.cross(pts[i] ?? [0, 0, 0], pts[(i + 1) % pts.length] ?? [0, 0, 0]));
  n = v3.norm(n);
  const o = pts[0] ?? [0, 0, 0];
  const e1 = v3.norm(v3.sub(pts[2] ?? o, o));
  const e2 = v3.cross(n, e1);
  const flat = pts.map((p): [number, number] => [
    v3.dot(v3.sub(p, o), e1),
    v3.dot(v3.sub(p, o), e2),
  ]);
  const inside = polygon2(flat);
  const thick = Math.max(r * 0.12, res * 0.65);
  const lo: [number, number, number] = [Infinity, Infinity, Infinity];
  const hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const p of pts)
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k] ?? 0, (p[k] ?? 0) - 0.05);
      hi[k] = Math.max(hi[k] ?? 0, (p[k] ?? 0) + 0.05);
    }
  out.push({
    field: (p) => {
      const d = v3.sub(p, o);
      return Math.max(inside(v3.dot(d, e1), v3.dot(d, e2)), Math.abs(v3.dot(d, n)) - thick);
    },
    bounds: [lo, hi],
    blend: thick,
  });
  return out;
}

/** Signed distance to a simple 2D polygon (even-odd), negative inside. */
function polygon2(pts: readonly (readonly [number, number])[]): (x: number, y: number) => number {
  return (x, y) => {
    let d = Infinity;
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [ax, ay] = pts[i] ?? [0, 0];
      const [bx, by] = pts[j] ?? [0, 0];
      const [ex, ey] = [bx - ax, by - ay];
      const t = Math.max(
        0,
        Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey || 1)),
      );
      d = Math.min(d, Math.hypot(x - ax - ex * t, y - ay - ey * t));
      if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay || 1e-12) + ax)
        inside = !inside;
    }
    return inside ? -d : d;
  };
}

/** Every edit of the body sculpt at this LOD (left side when mirrored). */
export function bodyEdits(
  b: Bones,
  s: CreatureSpec,
  lod: number,
  res: number,
  hoof: Vec3,
  wing: Vec3,
): SculptEdit[] {
  const out: SculptEdit[] = [
    ...blockOut(b),
    ...planes(b),
    ...trunkFeatures(b, s, lod),
    ...legEdits(b, lod, hoof),
  ];
  for (const w of b.wings) out.push(...wingEdits(w, res, wing));
  for (const f of b.fins) {
    const r = f.nodes[0]?.r ?? 0.02;
    out.push(blade(f.nodes, f.side, Math.max(r * 0.12, res * 0.65), { blend: r * 0.25 }));
  }
  // Flat soles: everything under the ground plane is cut away.
  out.push({
    shape: 'roundBox',
    at: [0, 0, -50],
    size: [100, 100, 100],
    op: 'subtract',
    blend: res * 0.4,
  });
  return out;
}
