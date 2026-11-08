// Brinehound hull dressing (LOD0/1): what breaks up the big painted planes the way a real light
// tank's are broken up. Bolted applique plates on the glacis with a shut-line between them, weld
// beads along the plate seams, spare track links hung on the glacis, engine-deck access hatches
// with bolt rows, pioneer tools (shovel, crowbar) in clamps and a jerry-can rack on the hull
// sides — everything on the deck stays outside the turret's and mantlet's swept circles.

import { box, type Lod, type Mesh, merge, place, type Vec3 } from '@developerz.ai/ts23d';
import { BONE, BRASS, IRON, SLATE, tube } from '../_lib/rts/style.ts';

/** Glacis line in XZ: front foot (2.62, 0.93) → deck crease (1.55, 1.42). */
const FOOT = { x: 2.62, z: 0.93 } as const;
const CREASE = { x: 1.55, z: 1.42 } as const;
const GLACIS = Math.atan2(CREASE.z - FOOT.z, FOOT.x - CREASE.x);
const HALF_W = 1.485;
/** Ash tool shafts. */
const SHAFT: Vec3 = [0.3, 0.2, 0.1];

/** A box lying on the glacis: `t` along the slope from the crease (0) to the foot (1), sunk 1 cm. */
function onGlacis(
  t: number,
  y: number,
  size: Vec3,
  color: Vec3,
  bevel: number,
  strip?: 'iron_rust',
): Mesh {
  const x = CREASE.x + (FOOT.x - CREASE.x) * t;
  const z = CREASE.z + (FOOT.z - CREASE.z) * t;
  const b = box({ size, at: [0, 0, -0.012], color, bevel, ...(strip ? { strip } : {}) });
  return place(b, { at: [x, y, z], pitch: GLACIS });
}

/** Bolt heads in a row along X at height z (deck items), `n` of them from x0 to x1. */
function bolts(n: number, x0: number, x1: number, y: number, z: number): Mesh[] {
  return Array.from({ length: n }, (_, i) =>
    box({
      size: [0.035, 0.035, 0.025],
      at: [x0 + ((x1 - x0) * i) / Math.max(1, n - 1), y, z - 0.008],
      color: IRON,
      bevel: 0.006,
    }),
  );
}

export function hullDressing(lod: Lod, deck: number): Mesh | null {
  if (lod === 2) return null;
  const out: Mesh[] = [];
  const slope = Math.hypot(FOOT.x - CREASE.x, FOOT.z - CREASE.z);
  // Two applique plates, a 6 cm shut-line between them down the centre.
  for (const s of [1, -1])
    out.push(onGlacis(0.42, s * 0.72, [slope * 0.72, 1.38, 0.045], BONE, lod === 0 ? 0.012 : 0));
  // Weld beads: the deck crease and the deck's side edges.
  out.push(tube(lod, [CREASE.x, -HALF_W, deck], [CREASE.x, HALF_W, deck], 0.018, 0.018, SLATE));
  for (const s of [1, -1])
    out.push(
      tube(
        lod,
        [-2.3, s * HALF_W, deck - 0.01],
        [CREASE.x, s * HALF_W, deck - 0.01],
        0.016,
        0.016,
        SLATE,
      ),
    );
  if (lod === 1) return merge(out);
  // Spare links hung across the glacis foot (they double as extra armour).
  for (let i = 0; i < 4; i++)
    out.push(onGlacis(0.82, -0.45 + i * 0.3, [0.24, 0.26, 0.06], IRON, 0.008, 'iron_rust'));
  for (const s of [1, -1]) {
    // Engine-deck hatches beside the team panel, with bolt rows.
    out.push(
      box({
        size: [0.5, 0.42, 0.03],
        at: [-1.95, s * 1.22, deck - 0.012],
        color: BONE,
        bevel: 0.01,
      }),
    );
    out.push(...bolts(4, -2.13, -1.77, s * 1.43, deck + 0.018));
    out.push(...bolts(4, -2.13, -1.77, s * 1.01, deck + 0.018));
  }
  // Pioneer tools on the left hull side (clear of the turret and mantlet sweep): shovel and
  // crowbar in brass clamps bolted to the side plate.
  const y = HALF_W + 0.018;
  out.push(tube(lod, [-1.2, y, 1.22], [-0.06, y, 1.22], 0.018, 0.018, SHAFT));
  out.push(
    box({ size: [0.24, 0.03, 0.18], at: [-0.08, HALF_W + 0.005, 1.13], color: IRON, bevel: 0.006 }),
  );
  out.push(tube(lod, [-1.4, y, 1.07], [-0.3, y, 1.07], 0.015, 0.015, IRON));
  for (const x of [-1.0, -0.45])
    out.push(box({ size: [0.05, 0.07, 0.26], at: [x, HALF_W + 0.02, 1.02], color: BRASS }));
  // Jerry-can rack on the right hull side.
  for (const x of [-1.3, -0.95, -0.6])
    out.push(
      box({ size: [0.3, 0.1, 0.36], at: [x, -HALF_W - 0.035, 1.0], color: SLATE, bevel: 0.012 }),
    );
  out.push(box({ size: [1.1, 0.05, 0.05], at: [-0.95, -HALF_W - 0.02, 1.27], color: IRON }));
  return merge(out);
}
