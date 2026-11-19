// Elf hair as sculpted locks: a centre-parted mass over the scalp, then long locks that start at
// the parting, follow the skull over the top and behind the pointed ears, and fall free onto the
// shoulders and back — tapered, overlapping, toned dark at the roots and pale gold at the tips —
// and two flat ribbon locks falling in front of the ears.
// Card hair (`hairBaseEdits` + `elfCardHair`): the parted mass, painted hair colour, is the scalp
// layer; strand cards root on the skull (`bustScalp`) inside a landmark hairline clear of the long
// ears, comb out from the centre parting, sweep back past the ears and fall behind them to the
// shoulders, colliding with the whole bust so no lock crosses the face or an ear.

import { type Field, type SculptEdit, sculptField, type Vec3 } from '@developerz.ai/ts23d';
import type { BustRecipe } from '../_lib/bust/bust.ts';
import { flowLocks, hairMass, lock, mix, ribbon } from '../_lib/bust/hair.ts';
import { type Surface, spline, surface, type V } from '../_lib/bust/kit.ts';
import { browLayers, browLine, withBrowComb } from '../_lib/face/brows.ts';
import { bustHairFields, type CardHairStyle, skullHairline } from '../_lib/face/hair-cards.ts';
import { C, H, L, SK } from './spec.ts';

/** Where the hair grows on the skull: trichion 4.6 cm above the glabella, the nape line 2 cm up,
 *  1.6 cm of skin round each long ear (lobe → top → helix tip): the base never swallows an ear. */
export const hairline: Field = skullHairline(SK, {
  front: 0.046,
  nape: 0.02,
  ear: 0.016,
  temple: 0.008,
});

export function hairEdits(scalp: Field, lod: number): SculptEdit[] {
  const box: [V, V] = [
    [L.back - 0.05, -0.15, L.mz - 0.2],
    [L.gx + 0.06, 0.15, L.crown + 0.05],
  ];
  const mass = hairMass(scalp, 0.007, hairline, box, C.hairRoot, 0.03);
  const out: SculptEdit[] = [mass];
  const hair: Surface = surface(
    sculptField([{ field: scalp, bounds: box }, mass], { color: C.hairRoot }).field,
  );
  const n = lod === 2 ? 3 : 7;
  for (const { ctrl, r } of longLocks(n, hair))
    out.push(
      ...lock(spline(ctrl, lod === 2 ? 6 : 16), r, 0.003, C.hairRoot, C.hairTip, { belly: 0.002 }),
    );
  if (lod < 2)
    // Two flat ribbon locks in front of the ears, down to the collarbones (asymmetric lengths):
    // 14 mm wide at the root, 7 mm at the tip, faces turned outward-forward.
    for (const { ctrl, y } of frontLocks(hair))
      out.push(
        ...ribbon(
          spline(ctrl, 14),
          [0.6, 0.8 * y, 0],
          [0.014, 0.007],
          [0.0042, 0.0026],
          C.hairRoot,
          C.hairTip,
          { mirror: false },
        ),
      );
  return out;
}

/** The long locks (left half, mirrored): from the parting over the skull, behind the ear, then
 *  free down over the trapezius; `on` lays the scalp stretch onto the hair surface. */
export function longLocks(n: number, on: Surface): Array<{ ctrl: V[]; r: number }> {
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    const part: V = [L.gx - 0.08 * H - t * 0.55 * H, 0.004, L.crown - 0.01 - t * 0.04 * H];
    const side: V = [part[0] - 0.05 * H, 0.06, L.mz + 0.75 * H - t * 0.1 * H];
    const behind: V = [L.back + (0.3 - t * 0.12) * H, 0.075 + t * 0.006, L.mz + 0.42 * H];
    const r = 0.0085 - t * 0.001;
    return {
      r,
      ctrl: [
        on.off(part, r * 0.3),
        on.off(side, r * 0.5),
        on.off(behind, r * 0.7),
        [behind[0] - 0.01, behind[1] + 0.012, L.mz + 0.1 * H],
        [behind[0] - 0.02 - t * 0.01, behind[1] + 0.02 + t * 0.01, L.mz - 0.25 * H - t * 0.08 * H],
      ],
    };
  });
}

/** The two front ribbon locks (right one shorter), not mirrored. */
export function frontLocks(on: Surface): Array<{ ctrl: V[]; y: number }> {
  return (
    [
      [1, 0.36],
      [-1, 0.3],
    ] as const
  ).map(([y, len]) => ({
    y,
    ctrl: [
      on.off([L.gx - 0.06 * H, 0.03 * y, L.mz + 0.9 * H], 0.003),
      on.off([L.gx - 0.16 * H, 0.072 * y, L.mz + 0.68 * H], 0.005),
      // Falling in front of the ear, clear of the cheek (no stripe of shadow down the face).
      [L.gx - 0.24 * H, 0.094 * y, L.mz + 0.3 * H],
      [L.gx - 0.28 * H, 0.1 * y, L.mz - len * H],
    ],
  }));
}

export const CAP: V = mix(mix(C.hairRoot, C.hairTip, 0.35), [0, 0, 0], 0.3);

/** Lock lines over the cap (left half, mirrored): meridians from the brow over the crown and
 *  down the back, fanning from the centre parting; kept where the hair grows. */
function capLines(hair: Surface): V[][] {
  const c: V = [(SK.glabella[0] + SK.occiput[0]) / 2, 0, SK.euryon[2]];
  return [7, 20, 33, 47, 62, 78]
    .map((deg) => {
      const phi = (deg * Math.PI) / 180;
      const pts: V[] = [];
      for (let i = 0; i <= 9; i++) {
        const e = ((30 + (175 * i) / 9) * Math.PI) / 180;
        const d: V = [Math.cos(e), Math.sin(e) * Math.sin(phi), Math.sin(e) * Math.cos(phi)];
        pts.push(hair.on([c[0] + d[0] * 0.1, c[1] + d[1] * 0.1, c[2] + d[2] * 0.1]));
      }
      return pts.filter((p) => hairline(p) < -0.012);
    })
    .filter((l) => l.length >= 4);
}

/** The base layer under card hair: the parted mass, combed into broad locks (LOD0/1) so the
 *  crown, where the cards lie flattest, still reads as strands drawn back from the parting. */
export const hairBaseEdits = (scalp: Field, lod: number): SculptEdit[] => {
  const box: [V, V] = [
    [L.back - 0.05, -0.15, L.mz - 0.2],
    [L.gx + 0.06, 0.15, L.crown + 0.05],
  ];
  // The cap under the cards: a shadowed gold (hair in shade), so a parting or a gap between locks
  // reads as depth, not as an orange scalp.
  const mass: SculptEdit = {
    // 6 mm inside the hairline: the cap's edge lies under the cards.
    ...hairMass(scalp, 0.007, (p) => hairline(p) + 0.006, box, CAP, 0.03),
    blend: 0.006,
  };
  if (lod === 2) return [mass];
  const hair = surface(sculptField([{ field: scalp, bounds: box }, mass], { color: CAP }).field);
  // (Toned between the cap and the cards' gold: lighter ridges, the cap's shade between them.)
  const tone = { root: CAP, tip: mix(C.hairRoot, C.hairTip, 0.25) };
  return [mass, ...flowLocks(hair, capLines(hair), 0.0058, tone)];
};

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** Half-width of the solid in front of the ears that keeps locks off the face: a finger past the
 *  ear tips. (At 16 cm a lock that met it slid out along its side and hung in the air beside the
 *  shoulder as a stray.) */
const SHIELD = Math.abs(SK.earTip[1]) + 0.012;

/** Away from the centre parting, then back and down: over the ears' roots the hair is swept back
 *  hard, so it falls behind them; at the back straight down to the shoulders. */
const comb = (p: Vec3, n: Vec3): Vec3 => {
  const out = Math.sign(p[1] || 1);
  const top = clamp01(n[2]);
  // 0 at the forehead, 1 at the back of the skull.
  const t = clamp01((SK.glabella[0] - p[0]) / (SK.glabella[0] - SK.occiput[0]));
  // Near the ear (above and in front of its root): back, not down.
  const ear = clamp01(1 - Math.hypot(p[0] - SK.earTop[0], p[2] - SK.earTop[2] - 0.03) / 0.06);
  return [
    -(1.1 - 0.7 * t) - 1.2 * ear,
    // Off the parting: sideways only once past the crown's front, so the front stays covered.
    out * (0.5 * top * clamp01((t - 0.15) / 0.3) * (1 - t) + 0.1),
    -0.25 - 1.1 * (1 - top) * (1 - ear) - 0.5 * t,
  ];
};

/** Long at the back and behind the ears (to the shoulders), shorter at the front where the hair
 *  sweeps back over the top. */
const long = (p: Vec3): number => {
  const t = clamp01((SK.glabella[0] - p[0]) / (SK.glabella[0] - SK.occiput[0]));
  return 0.12 + 0.125 * clamp01((t - 0.15) / 0.5);
};

/** Card hairstyle for `cardHair` (recipes/_lib/face/hair-cards.ts) on the elf bust `b`: long,
 *  centre-parted. */
export function elfCardHair(b: BustRecipe, lod: number): CardHairStyle {
  // Roots on the finished head (cap and all), falling round it.
  const { skin } = bustHairFields(b, lod);
  // No lock in front of the ears below the brow: a solid there pushes them back behind the ears.
  const shield: Field = (p) =>
    Math.max(SK.tragion[0] + 0.012 - p[0], Math.abs(p[1]) - SHIELD, p[2] - (SK.glabella[2] + 0.03));
  // The brows stay on the face: the shield would push their cards up into a fringe.
  const brows = browLine(SK, H, 0.012, 0.03);
  const collide: Field = (p) => (brows(p) < 0 ? skin(p) : Math.min(skin(p), shield(p)));
  const bounds: [V, V] = [
    [L.back - 0.05, -0.15, L.mz - 0.05],
    [L.gx + 0.06, 0.15, L.crown + 0.05],
  ];
  const pale: Vec3 = [1.08, 1.04, 0.9];
  return {
    field: skin,
    bounds,
    cell: 0.004,
    comb: withBrowComb(comb, SK, H, { thick: 0.0035 }),
    collide,
    segments: 8,
    color: mix(C.hairRoot, C.hairTip, 0.45),
    layers: [
      // Base: dark clumps flat on the painted cap, hiding the scalp.
      {
        name: 'hair_base',
        kind: 'hair',
        region: hairline,
        density: 5000,
        length: (p: Vec3) => long(p) * 0.55,
        width: 0.026,
        lift: 0.03,
        bend: 0.95,
        droop: 0.3,
        roll: 0.1,
        fold: 0,
        // (Tones close together across the layers: a wide spread between neighbouring cards
        // reads as straw, not as one head of hair.)
        tone: [0.64, 0.84],
        hug: 0.9,
      },
      // Long locks: clumped, curved across, falling to the shoulders, paler toward the tips.
      {
        name: 'hair_long',
        kind: 'hair',
        region: hairline,
        // Wide locks lying on one another: fewer and half again as wide as strands would be,
        // so the fall reads as a mass with a few breaks, not as separate strings.
        density: 3000,
        length: long,
        width: 0.036,
        lift: 0.05,
        bend: 0.95,
        droop: 0.8,
        roll: 0.12,
        fold: 0.45,
        clump: 4,
        tone: [0.8, 1.04],
        tint: pale,
        hug: 0.8,
      },
      // Outer locks over the crown and back: the volume and the silhouette.
      {
        name: 'hair_top',
        kind: 'hair',
        region: (p: Vec3) => Math.max(hairline(p), SK.euryon[2] - p[2]),
        density: 1500,
        length: (p: Vec3) => long(p) * 0.95,
        width: 0.03,
        lift: 0.07,
        bend: 0.9,
        droop: 0.8,
        roll: 0.16,
        fold: 0.5,
        clump: 3,
        tone: [0.9, 1.1],
        tint: pale,
        hug: 0.6,
      },
      // Crown: flat locks combed back over the parting's front, where the sideways comb opened
      // a bald-looking disc of cap (D57).
      {
        name: 'hair_crown',
        kind: 'hair',
        region: (p: Vec3) =>
          Math.max(hairline(p), Math.abs(p[1]) - 0.03, SK.euryon[2] + 0.01 - p[2]),
        density: 3200,
        length: 0.07,
        width: 0.02,
        lift: 0.05,
        bend: 0.9,
        droop: 0.3,
        roll: 0.15,
        fold: 0.4,
        tone: [0.82, 1.04],
        tint: pale,
        hug: 1,
      },
      // Hairline: short strands rooted on the edge band, over the cap's edge.
      {
        name: 'hair_edge',
        kind: 'wisp',
        // (Sparse and lifted: a dense band of them hugging the cap piled up along the hairline
        // like a braided circlet.)
        region: (p: Vec3) => Math.max(hairline(p), -hairline(p) - 0.014),
        density: 9000,
        length: 0.05,
        width: 0.01,
        lift: 0.08,
        bend: 0.8,
        droop: 0.15,
        roll: 0.3,
        fold: 0,
        hug: 0.5,
        tone: [0.75, 1.05],
      },
      // (No flyaways: at this length a strand with no clump to hold it arcs out past the
      // shoulders as a stray lock.)
      // Fine, fair brows: short strands on the painted brow.
      ...browLayers(SK, H, { thick: 0.0035, length: 0.008, tone: [0.5, 0.8] }),
    ],
  };
}

/** The far LOD's hair from the card style: its long locks and crown only, a quarter as many and
 *  three times as wide (scalpCards' LOD1 rule halves and widens them again), in the same tones. */
export function farHair(style: CardHairStyle): CardHairStyle {
  const keep = ['hair_long', 'hair_top', 'hair_crown'];
  return {
    ...style,
    layers: style.layers
      .filter((l) => keep.includes(l.name))
      .map((l) => ({ ...l, density: l.density * 0.3, width: l.width * 1.6 })),
  };
}
