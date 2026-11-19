// The body sculpt (trunk, neck, legs, tail, wings, fins as ONE sculpt so every join is a smooth
// blend), in stages, each its own function:
//   blockOut  the bones: a superellipsoid ribcage, the tucked loin, the pelvis block, blended
//             tightly (0.3 × radius, C2) so they stay separate forms; the neck of oval section;
//             tail skins, body chains
//   planes    none by default: a mammal's back and flanks are round; planed flanks read as a box
//             (tiger dossier). The narrow, deep trunk comes from the masses' radii.
//   features  fibre muscles and bony landmarks (creature-muscles.ts, LOD0/1), the separations
//             between them (creature-separations.ts), croup → tail root, the ruff; legs
//             (creature-limbs.ts); wings; fins
//   ground    flat soles: everything below z = 0 is cut away so feet rest on the ground plane.

import type { Vec3 } from '../core/index.ts';
import type { SculptEdit } from '../primitives/index.ts';
import type { Bones, Wing } from './creature-bones.ts';
import { v3 } from './creature-curve.ts';
import { legEdits } from './creature-limbs.ts';
import { muscleEdits, softBlend } from './creature-muscles.ts';
import { separations } from './creature-separations.ts';
import { blade, blob, type SkinNode, skin } from './creature-skin.ts';
import type { CreatureSpec } from './creature-spec.ts';

/** Trunk blend: mammals × the mass's mean radius (0.3: ribcage, loin and pelvis stay separate
 *  forms the muscles bridge), other plans × the smaller cross radius as before. */
const TRUNK_BLEND = { mammal: 0.3, other: 0.9 } as const;

const mammal = (b: Bones): boolean => b.skeleton === 'quadruped' || b.skeleton === 'winged';

/** A neck of elliptical section (deeper than wide): overlapping ellipsoids along the chain. */
function ovalNeck(nodes: readonly SkinNode[]): SculptEdit {
  const group: SculptEdit[] = [];
  for (let i = 0; i + 1 < nodes.length; i++) {
    const a = nodes[i];
    const c = nodes[i + 1];
    if (!a || !c) continue;
    const u = v3.sub(c.at, a.at);
    const r = (a.r + c.r) / 2;
    group.push({
      shape: 'ellipsoid',
      at: v3.lerp(a.at, c.at, 0.5),
      // Wider toward the head: the cheek fur runs on into the neck (no collar at the skull).
      size: [r * (0.85 + 0.3 * (i / Math.max(1, nodes.length - 2))), r, v3.len(u) / 2 + r * 0.7],
      // Long axis (local Z) along the segment, pitched in the sagittal plane.
      rotate: [0, (Math.atan2(u[0], u[2]) * 180) / Math.PI, 0],
      blend: r * 0.6,
      kernel: 'cubic',
    });
  }
  return { group, blend: (nodes[0]?.r ?? 0.05) * 0.7, kernel: 'cubic' };
}

/** Block-out: the primary masses (the bones: ribcage, loin, pelvis), the neck and tail skins. */
export function blockOut(b: Bones): SculptEdit[] {
  const k = mammal(b) ? TRUNK_BLEND.mammal : TRUNK_BLEND.other;
  const out: SculptEdit[] = b.trunk.map((m, i) => ({
    shape: m.power ? ('superellipsoid' as const) : ('ellipsoid' as const),
    at: m.at,
    size: m.r,
    blend:
      m.blend ??
      (i === 0
        ? 0
        : mammal(b)
          ? ((m.r[0] + m.r[1] + m.r[2]) / 3) * k
          : Math.min(m.r[1], m.r[2]) * k),
    ...(m.power ? { power: m.power } : {}),
    ...(m.rotate ? { rotate: m.rotate } : {}),
    ...(mammal(b) ? { kernel: 'cubic' as const } : {}),
  }));
  const r0 = b.neck[0]?.r ?? 0.05;
  if (b.neck.length > 1) out.push(mammal(b) ? ovalNeck(b.neck) : skin(b.neck, { blend: r0 * 0.5 }));
  if (b.chain.length > 1) out.push(skin(b.chain, { blend: (b.chain[0]?.r ?? 0.05) * 0.4 }));
  if (b.tail.length > 1) out.push(skin(b.tail, { blend: (b.tail[0]?.r ?? 0.03) * 0.8 }));
  return out;
}

/** Planes: intentionally none (see the header). */
export function planes(_b: Bones): SculptEdit[] {
  return [];
}

/** Mammal features on the trunk: muscles and bony landmarks (LOD0/1), croup → tail, ruff. */
function trunkFeatures(
  b: Bones,
  s: CreatureSpec,
  lod: number,
  base: readonly SculptEdit[],
): SculptEdit[] {
  const [chest, , pelvis] = b.trunk;
  if (!chest || !pelvis || !mammal(b)) return [];
  const D = chest.r[2] * 2;
  const out: SculptEdit[] = lod < 2 ? muscleEdits(b, s, base) : [];
  const tr = b.tail[0];
  if (tr)
    // Croup → tail root: the stump runs on past the root inside the tail, so it leaves
    // tangentially; no thicker than the tail at the root, so the root sits under the croup line.
    out.push(
      skin(
        [
          { at: pelvis.at, r: pelvis.r[2] * 0.45 },
          { at: b.tailRoot, r: tr.r * 1.1 },
          { at: b.tail[2]?.at ?? b.tailRoot, r: b.tail[2]?.r ?? tr.r },
        ],
        { blend: D * 0.1 },
      ),
    );
  const ruff = s.build?.ruff ?? 0;
  if (ruff > 0 && b.neck.length > 1) {
    // A thin ruff (a fox's 1.6 cm) would blend into the brisket tighter than a seam: floored.
    const soft = softBlend(b);
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
        { blend: Math.max(ruff * 2, soft) },
      ),
      // The throat ruff hangs low at the base of the neck, over the brisket; the throat under
      // the jaw stays clear so the neck reads.
      blob(
        v3.add(b.neck[1]?.at ?? chest.at, [0, 0, -(b.neck[1]?.r ?? 0) * 0.9]),
        [ruff * 2, (b.neck[1]?.r ?? 0) * 0.8, ruff * 2.2],
        Math.max(ruff * 1.5, soft),
      ),
    );
  }
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
  const masses = blockOut(b);
  const legs = legEdits(b, lod, hoof);
  const out: SculptEdit[] = [
    ...masses,
    ...planes(b),
    // Muscles seat on the three bones, the neck and the legs, not on a raised topline mass: the
    // withers ridge laid over a hump stood a second hump on it.
    ...trunkFeatures(b, s, lod, [
      ...masses.filter((_, i) => i < 3 || i >= b.trunk.length),
      ...legs,
    ]),
    ...legs,
  ];
  // Separations between the muscles, pressed into the finished masses (LOD0: finer than LOD1's cell).
  if (lod === 0) out.push(...separations(b, out));
  for (const w of b.wings) out.push(...wingEdits(w, res, wing));
  for (const f of b.fins) {
    const r = f.nodes[0]?.r ?? 0.02;
    out.push(blade(f.nodes, f.side, Math.max(r * 0.12, res * 0.65), { blend: r * 0.25 }));
  }
  // Flat soles: everything under the ground plane is cut away (LOD0: ⅓ cell above it — where the
  // fine toes graze the cut, mesh vertices land up to that far below the plane).
  out.push({
    shape: 'roundBox',
    at: [0, 0, -50 + (lod === 0 ? res * 0.3 : 0)],
    size: [100, 100, 100],
    op: 'subtract',
    blend: res * 0.4,
  });
  return out;
}
