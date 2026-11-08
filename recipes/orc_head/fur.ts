// Orc fur mantle: a ruff of fur clumps round the neck base, lying over the shoulders and traps.
// It also hides the seam where the fine-celled `head` sculpt meets the coarser `bust` sculpt.
// Built on the seam curve itself (the skin ∩ the seam plane, found by projection): a rolled base
// that buries the seam, then two rings of tapered clumps fanning out and down, each toned dark at
// the root and light at the tip, seeded so no two clumps match.

import type { BuildContext, Field, Mesh, SculptEdit } from '@developerz.ai/ts23d';
import {
  add,
  chain,
  frameOf,
  k,
  local,
  mul,
  norm,
  onCurve,
  type Surface,
  sub,
  type V,
} from '../_lib/bust/kit.ts';
import { L } from './landmarks.ts';
import { C } from './palette.ts';
import { skinMesh } from './skin.ts';

const mix = (a: V, b: V, t: number): V => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** The seam plane as a field: ≥ 0 on the head side. */
export function seamField(): Field {
  const n = norm(L.seamN);
  const off = L.seamZ / Math.hypot(L.seamN[0], L.seamN[1], L.seamN[2]);
  return (p) => p[0] * n[0] + p[1] * n[1] + p[2] * n[2] - off;
}

/** Points round the seam curve on the skin, from angle a0 to a1 (deg, 0 = front, + = left). */
export function seamRing(body: Surface, n: number, a0 = 0, a1 = 360): V[] {
  const seam = seamField();
  const seeds = Array.from({ length: n }, (_, i): V => {
    const a = ((a0 + ((a1 - a0) * i) / (n - 1)) * Math.PI) / 180;
    const x = -0.03 + 0.2 * Math.cos(a);
    return [x, 0.2 * Math.sin(a), L.seamZ - 0.35 * x];
  });
  return onCurve(body.field, seam, seeds);
}

/** The fur mantle over the back half of the seam: shoulders, traps and nape. */
export function furMantle(ctx: BuildContext, body: Surface): Mesh {
  const rng = ctx.rng.fork('fur');
  const n = ctx.pick([26, 16, 7]);
  const ring = seamRing(body, n, 62, 298);
  const edits: SculptEdit[] = [];
  // The rolled base over the seam.
  edits.push(chain(ring, 0.022, { color: C.fur, join: 0.014 }));
  const rows = ctx.lod === 2 ? 1 : 2;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[Math.min(i + 1, ring.length - 1)];
    if (!p || !q) continue;
    for (let row = 0; row < rows; row++) {
      // Rows staggered half a step, outer rows longer and lower: clumps overlap like shingles.
      const root0 = row === 1 ? mul(add(p, q), 0.5) : p;
      const nrm = body.normal(root0);
      const out = norm([root0[0] + 0.03, root0[1], 0]);
      const fall = norm(add(add(mul(out, 0.55), mul(nrm, 0.35)), [0, 0, -1]));
      const root = add(root0, add(mul(nrm, 0.004 + row * 0.006), mul(fall, row * 0.014)));
      const len = 0.05 + row * 0.014 + rng.next() * 0.022;
      const w = norm(sub(nrm, mul(fall, nrm[0] * fall[0] + nrm[1] * fall[1] + nrm[2] * fall[2])));
      const f = frameOf(root, fall, w);
      const curl = (rng.next() - 0.5) * 0.024;
      const r0 = 0.019 + rng.next() * 0.005;
      const tip = mix(C.fur, C.furTip, 0.5 + rng.next() * 0.5);
      const box: [V, V] = [
        [-0.03, -0.035, -0.03],
        [len + 0.03, 0.035, 0.03],
      ];
      edits.push(
        local(f, k.roundCone([0, 0, 0], [len * 0.55, curl * 0.5, 0.004], r0, r0 * 0.75), box, {
          squash: 1.8,
          color: C.fur,
          blend: 0.007,
        }),
        local(
          f,
          k.roundCone([len * 0.55, curl * 0.5, 0.004], [len, curl, 0.002], r0 * 0.75, 0.003),
          box,
          {
            squash: 1.8,
            color: tip,
            blend: 0.005,
          },
        ),
      );
    }
  }
  return skinMesh(edits, ctx.pick([0.0072, 0.012, 0.028]), {
    rng: ctx.rng.fork('fur-tone'),
    color: C.fur,
    mirror: false,
  });
}

/** A bead necklace over the front half of the seam: a leather cord strung with bone beads. */
export function necklace(ctx: BuildContext, body: Surface): Mesh {
  const n = ctx.pick([24, 14, 8]);
  const ring = seamRing(body, n, -80, 80).map((p) => body.off(p, 0.004));
  const edits: SculptEdit[] = [chain(ring, 0.0065, { color: C.cord, join: 0.003 })];
  // Carved bone beads along the cord, larger toward the front; nothing hangs below it.
  if (ctx.lod < 2)
    for (let i = 2; i < ring.length - 2; i += 2) {
      const p = ring[i];
      if (!p) continue;
      const big = 1 - Math.abs(i / (ring.length - 1) - 0.5) * 2;
      edits.push({
        shape: 'ellipsoid',
        at: body.off(p, 0.007),
        size: [0.006 + big * 0.003, 0.007 + big * 0.003, 0.0055 + big * 0.002],
        color: i % 4 === 0 ? C.bone : C.cordBead,
        blend: 0.002,
      });
    }
  return skinMesh(edits, ctx.pick([0.0038, 0.0055, 0.01]), {
    rng: ctx.rng.fork('necklace'),
    color: C.cord,
    mirror: false,
  });
}
