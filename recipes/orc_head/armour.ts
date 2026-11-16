// Orc armour: plate pauldrons and their harness. Each pauldron is a domed cap plate over the
// deltoid, hammer-peened, and three overlapping lames down the arm, each flaring wider than the
// one above — forged plates with real thickness, a rolled bead along every lower edge, the cap's
// lip included (plates.ts), rivets and a boss
// — three bone spikes rooted in the boss and in iron collars; a leather baldric crosses the chest
// from under the left pauldron with an iron buckle. Plates on `steel_painted` (gunmetal paint, chips to rusty steel), straps on `leather`.
// LOD0 carries the rivets and the hammer peening; LOD2 coarsens the plates' rings. Straps and
// their stitching come from ../_lib/bust/cloth-strap.ts.

import {
  type BuildContext,
  type Mesh,
  merge,
  type Rng,
  type SculptEdit,
  sculpt,
} from '@developerz.ai/ts23d';
import { stitches, strap } from '../_lib/bust/cloth-strap.ts';
import {
  add,
  cone2,
  cross,
  dot,
  k,
  local,
  mul,
  norm,
  rbox,
  type Surface,
  sub,
  type V,
} from '../_lib/bust/kit.ts';
import { plateProfile, revolvePlate } from '../_lib/bust/plates.ts';
import { BALDRIC, cap, capPoint, SPIKES } from './fittings.ts';
import { L } from './landmarks.ts';
import { C } from './palette.ts';

/** One pauldron (s = +1 left, −1 right): plate meshes, rivet + collar edits, spike edits. */
function pauldron(
  s: number,
  lod: number,
  rng: Rng,
): { plates: Mesh[]; iron: SculptEdit[]; bone: SculptEdit[] } {
  const [dx, dy] = L.deltoid;
  const steps = [36, 22, 8][lod] ?? 8;
  const plates: Mesh[] = [];
  const iron: SculptEdit[] = [];
  const bone: SculptEdit[] = [];
  // Cap: a dome revolved about an axis tilted out over the shoulder, its lip flaring at the rim.
  const { at: capAt, axis: capAxis, R, H } = cap(s);
  const meridian: Array<readonly [number, number]> = [];
  const nm = [12, 8, 5][lod] ?? 5;
  for (let i = 0; i <= nm; i++) {
    const phi = ((8 + (84 * i) / nm) * Math.PI) / 180;
    meridian.push([R * Math.sin(phi), H * Math.cos(phi)]);
  }
  meridian.push([R * 1.07, -0.016]);
  const arc = lod < 2 ? 5 : 2;
  const capProfile = plateProfile(meridian, 0.009, arc);
  // Battle damage (LOD0): 3 dents on the exposed dome (2–3.5 mm deep, 12–20 mm wide); the lip's
  // paint chipped to bare iron on ~15 % of its length; rust running 25 mm below each rivet.
  const dents = (n: number, h0: number, h1: number, from: number, to: number) =>
    lod === 0
      ? Array.from({ length: n }, () => ({
          theta: from + (to - from) * rng.next(),
          h: h0 + (h1 - h0) * rng.next(),
          radius: 0.012 + rng.next() * 0.008,
          depth: 0.002 + rng.next() * 0.0015,
        }))
      : [];
  const wear = (from: number, to: number, drip: Array<{ theta: number; h: number }>) => ({
    rng,
    from,
    to,
    edge: C.plateRim,
    bare: C.bareIron,
    chip: 0.15,
    rust: C.rust,
    drip: lod === 0 ? drip : [],
    length: 0.025,
  });
  // Hammer peening (LOD0): the forging's shallow facets over the whole dome, 0.6–1.2 mm deep,
  // 9–15 mm wide — raking light reads beaten iron, not a pressed bowl.
  const peen =
    lod === 0
      ? Array.from({ length: 22 }, () => ({
          theta: 360 * rng.next(),
          h: H * (0.2 + 0.75 * rng.next()),
          radius: 0.009 + rng.next() * 0.006,
          depth: 0.0006 + rng.next() * 0.0006,
        }))
      : [];
  const capRivets = Array.from({ length: 9 }, (_, i) => i * 40 + 20);
  const rev = {
    at: capAt,
    axis: capAxis,
    ref: [1, 0, 0] as V,
    color: C.plate,
    strip: 'steel_painted' as const,
  };
  plates.push(
    revolvePlate(capProfile, {
      ...rev,
      from: 0,
      to: 360,
      steps,
      dents: [...dents(3, 0.02, 0.06, 0, 360), ...peen],
      // The lip rolled over a wire like the lames' (a forged edge, not a cut one).
      ...(lod < 2
        ? { bead: { r: 0.006, segments: 8, color: C.plateRim, at: meridian.length - 1 } }
        : {}),
      wear: wear(
        meridian.length - 1,
        meridian.length + arc,
        capRivets.map((theta) => ({ theta, h: H * Math.cos((80 * Math.PI) / 180) })),
      ),
    }),
  );
  const onCap = (phi: number, theta: number, lift = 0): V => capPoint(s, phi, theta, lift);
  // Boss over the crown of the dome, where the central spike roots.
  iron.push({ shape: 'sphere', at: onCap(12, 90 * s, -0.004), size: 0.022, color: C.plateRim });
  // Lames: three overlapping bands down the outer arm, each flaring wider than the one above.
  const armAt: V = [dx - 0.006, (dy + 0.012) * s, 0];
  const armAxis = norm([0, 0.14 * s, 1]);
  for (let i = 0; i < (lod === 2 ? 2 : 3); i++) {
    const top = 0.232 - i * 0.037;
    const r0 = 0.086 + i * 0.007;
    const outer: Array<readonly [number, number]> = [
      [r0, top],
      [r0 + 0.006, top - 0.024],
      [r0 + 0.013, top - 0.046],
    ];
    plates.push(
      revolvePlate(plateProfile(outer, 0.007, arc), {
        ...(lod < 2
          ? { bead: { r: 0.0055, segments: 8, color: C.plateRim, at: outer.length - 1 } }
          : {}),
        at: armAt,
        axis: armAxis,
        ref: [0, s, 0],
        from: -105,
        to: 105,
        steps: Math.max(5, Math.round(steps * 0.55)),
        color: C.plate,
        strip: 'steel_painted',
        dents: i < 2 ? dents(1, top - 0.035, top - 0.012, -70, 70) : [],
        wear: wear(
          2,
          2 + arc,
          [-92, 0, 92].map((theta) => ({ theta, h: top - 0.013 })),
        ),
      }),
    );
    // Rivets at the band ends and centre, set into the outer face.
    if (lod === 0)
      for (const a of [-92, 0, 92]) {
        const t = (a * Math.PI) / 180;
        const zz = norm(armAxis);
        const xr = norm(sub([0, s, 0], mul(zz, zz[1] * s)));
        const yr = cross(zz, xr);
        const dir = add(mul(xr, Math.cos(t)), mul(yr, Math.sin(t)));
        const zc = top - 0.013;
        iron.push({
          shape: 'sphere',
          at: add(add(armAt, mul(dir, r0 + 0.003)), mul(zz, zc)),
          size: 0.0048,
          color: C.rivet,
        });
      }
  }
  // Rivets round the cap above the lip.
  if (lod === 0)
    for (let i = 0; i < 9; i++) {
      iron.push({
        shape: 'sphere',
        at: onCap(80, i * 40 + 20, -0.002),
        size: 0.005,
        color: C.rivet,
      });
    }
  // Bone spikes: one big through the boss, a smaller one raked forward, each in a flared collar.
  for (const [phi, theta, len, r] of SPIKES) {
    const root = onCap(phi, theta * s, -0.004);
    const out = norm(sub(root, capAt));
    const dir = norm(add(mul(out, 0.6), mul(capAxis, 0.8)));
    // The collar flares onto the plate (a ~35° skirt, not a step) and the spike is filleted
    // into it: one sculpt, so the root is blended, iron below and bone above.
    bone.push(
      cone2(add(root, mul(dir, -0.008)), add(root, mul(dir, 0.009)), r + 0.013, r + 0.003, {
        color: C.plateRim,
      }),
      cone2(add(root, mul(dir, 0.004)), add(root, mul(dir, len)), r, 0.002, { blend: 0.004 }),
    );
  }
  return { plates, iron, bone };
}

export interface ArmourParts {
  readonly pauldrons: Mesh;
  readonly spikes: Mesh;
  readonly harness: Mesh | null;
}

export function armour(ctx: BuildContext, body: Surface): ArmourParts {
  const lod = ctx.lod;
  const rng = ctx.rng.fork('armour');
  const l = pauldron(1, lod, rng.fork('l'));
  const r = pauldron(-1, lod, rng.fork('r'));
  const fittings = sculpt({
    edits: [...l.iron, ...r.iron],
    resolution: ctx.pick([0.0022, 0.004, 0.016]),
    color: C.plateRim,
    strip: 'steel_painted',
  });
  const pauldrons = merge([...l.plates, ...r.plates, fittings]);
  const spikes = sculpt({
    edits: [...l.bone, ...r.bone],
    resolution: ctx.pick([0.004, 0.0055, 0.017]),
    color: C.bone,
  });
  // Baldric: from under the left pauldron across the chest to the right flank.
  const ctrl = BALDRIC;
  const leather = sculpt({
    edits: [
      ...strap(body, ctrl, 0.042, 0.007),
      ...(lod === 0 ? stitches(body, ctrl, 0.042, 0.007, C.thread) : []),
    ],
    resolution: ctx.pick([0.0048, 0.0055, 0.014]),
    color: C.strap,
    strip: 'leather',
  });
  // LOD2: the strap lies flat on the chest and would fold at that cell; it is left off.
  if (lod === 2) return { pauldrons, spikes, harness: null };
  // Buckle on the chest: an iron frame proud of the strap, its face along the skin normal.
  const mid = ctrl[5] ?? [0.12, 0, 0.18];
  const bc = body.off(mid, 0.0085);
  const bn = body.normal(bc);
  const along = norm(sub(ctrl[6] ?? mid, ctrl[4] ?? mid));
  // Orthonormal: a raw cross product sheared the frame into a knife-cornered parallelogram.
  const u = norm(sub(along, mul(bn, dot(along, bn))));
  const f = { o: bc, u, v: cross(bn, u), w: bn };
  const near: [V, V] = [
    [-0.04, -0.04, -0.02],
    [0.04, 0.04, 0.02],
  ];
  const buckle = sculpt({
    edits: [
      local(f, k.box([0, 0, 0], [0.024, 0.03, 0.004], 0.002), near),
      // The opening's corners rounded (a forged frame, not a knife-cut slot).
      local(f, k.box([0, 0, 0], [0.016, 0.022, 0.01], 0.004), near, {
        op: 'subtract',
        blend: 0.003,
      }),
      rbox(add(bc, mul(bn, 0.001)), [0.006, 0.006, 0.006], 0.002, { color: C.rivet }),
    ],
    resolution: ctx.pick([0.003, 0.005, 0.01]),
    color: C.plateRim,
    strip: 'steel_painted',
  });
  return { pauldrons, spikes, harness: merge([leather, buckle]) };
}
