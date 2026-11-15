// The quadruped muscle map: where each trunk and girdle muscle runs, origin → insertion, from the
// skeleton's landmarks (scapula from the shoulder joint up to the withers, pelvis from hip and
// croup). Anatomy after Evans & de Lahunta, Miller's Anatomy of the Dog (4th ed.): scapula and
// its spine, supra/infraspinatus, triceps long head, latissimus dorsi, serratus ventralis,
// brachiocephalicus, splenius, trapezius, pectorals, gluteals, tensor fasciae
// latae, biceps femoris, semitendinosus; bony landmarks:
// withers, ischial tuberosity, manubrium. Sizes × the allometric limb radius `r`.

import type { Vec3 } from '../core/index.ts';
import { type Bones, headToWorld } from './creature-bones.ts';
import { v3 } from './creature-curve.ts';
import type { FibreMuscle } from './creature-muscles.ts';

/** Half-width (+Y) of the trunk envelope at (x, z): the widest trunk mass section there. */
export function envelope(b: Bones, x: number, z: number): number {
  let y = 0;
  for (const m of b.trunk) {
    const n = m.power ?? 2;
    const s = 1 - Math.abs((x - m.at[0]) / m.r[0]) ** n - Math.abs((z - m.at[2]) / m.r[2]) ** n;
    if (s > 0) y = Math.max(y, m.r[1] * s ** (1 / n));
  }
  return y;
}

/** A point on the left trunk surface at (x, z), sunk `sink` metres under it. */
const side = (b: Bones, x: number, z: number, sink = 0): Vec3 => [
  x,
  Math.max(0, envelope(b, x, z) - sink),
  z,
];

const dir = (x: number, y: number, z: number): Vec3 => v3.norm([x, y, z]);
const L: Vec3 = [0, 1, 0];

/** The quadruped's trunk and girdle muscles (left), or none for other body plans. */
export function trunkMuscles(b: Bones): FibreMuscle[] {
  const [rib, , pelvis] = b.trunk;
  const fore = b.legs.find((l) => l.name === 'fore');
  const hind = b.legs.find((l) => l.name === 'hind');
  const [S, E] = fore?.joints ?? [];
  const [Hp, K, Hk] = hind?.joints ?? [];
  const n1 = b.neck[1];
  const n2 = b.neck[2];
  if (!rib || !pelvis || !S || !E || !Hp || !K || !Hk || !n1 || !n2) return [];
  const r = b.limbR;
  const D = rib.r[2] * 2;
  const W = rib.r[1];
  const top = rib.at[2] + rib.r[2];
  const [xr, , zr] = rib.at;
  const [rx, , rz] = rib.r;
  const { length: hl, width: hw } = b.head;
  // Landmarks.
  const sd = side(b, S[0] - 0.3 * D, top - 0.04 * D, 0.004);
  const scap = (t: number, fwd: number, sink: number): Vec3 => {
    const p = v3.lerp(S, sd, t);
    return side(b, p[0] + fwd, p[2], sink);
  };
  // Triceps insertion just above the point of the elbow (the legs carry the elbow knob itself).
  const olecranon = v3.add(E, [-r * 0.45, r * 0.05, r * 1.3]);
  const manubrium: Vec3 = [S[0] + r * 0.9, W * 0.12, S[2] - r * 0.6];
  const sternum: Vec3 = [xr + rx * 0.35, W * 0.22, zr - rz * 0.9];
  const croup = pelvis.at[2] + pelvis.r[2];
  const coxae: Vec3 = [Hp[0] + r * 1.4, pelvis.r[1] * 0.95, croup - r * 0.55];
  const ischium: Vec3 = [Hp[0] - r * 1.5, pelvis.r[1] * 0.75, Hp[2] + r * 0.1];
  const trochanter = v3.add(Hp, [r * 0.1, r * 0.35, r * 0.45]);
  const nr = n1.r;
  const occiput = headToWorld(b.head, [-0.02 * hl, 0.3 * hw, 0.05 * hl]);
  const tibia = v3.add(v3.lerp(K, Hk, 0.15), [-r * 0.5, 0, 0]);
  const mu = (
    name: string,
    from: Vec3,
    to: Vec3,
    [width, thick]: readonly [number, number],
    out: Vec3,
    bone = false,
    rise = bone ? 0.3 : 0.4,
  ): FibreMuscle => ({ name, from, to, width, thick, out, rise, ...(bone ? { bone } : {}) });
  const at = (p: Vec3, x: number, y: number, z: number): Vec3 => v3.add(p, [x * r, y * r, z * r]);
  return [
    // Forequarter.
    mu('scapula', scap(0.12, 0, 0.004), sd, [r * 0.95, r * 0.22], dir(0, 1, 0.15), true, 0.15),
    mu('supraspinatus', scap(0.2, r * 0.45, 0), scap(0.95, r * 0.35, 0), [r * 0.45, r * 0.38], L),
    mu(
      'infraspinatus',
      scap(0.15, -r * 0.35, 0),
      scap(0.8, -r * 0.6, 0),
      [r * 0.6, r * 0.4],
      L,
      false,
      0.25,
    ),
    mu(
      'triceps_long',
      at(sd, -0.6, -0.1, -1.4),
      olecranon,
      [r * 0.9, r * 0.6],
      dir(-0.2, 1, 0),
      false,
      0.3,
    ),
    // Trapezius: a thin sheet from the crest of the neck and the withers onto the scapular spine.
    mu(
      'trapezius',
      v3.add(n1.at, [0, nr * 0.35, nr * 0.8]),
      scap(0.7, 0, 0),
      [r * 0.9, r * 0.35],
      dir(0, 1, 0.6),
      false,
      0.15,
    ),
    mu(
      'latissimus',
      side(b, xr - rx * 0.6, top - r * 2.2, r * 0.3),
      at(E, -0.2, 0.1, 1.7),
      [r * 1.1, r * 0.5],
      L,
      false,
      0.2,
    ),
    mu(
      'serratus',
      side(b, xr - rx * 0.05, zr - rz * 0.25, r * 0.15),
      scap(0.75, -r * 0.2, r * 0.3),
      [r * 0.9, r * 0.4],
      L,
      false,
      0.2,
    ),
    mu(
      'brachiocephalicus',
      v3.add(occiput, [-r * 0.2, 0, -r * 0.6]),
      at(S, 0.35, 0.25, -0.6),
      [nr * 0.32, nr * 0.36],
      dir(0.2, 1, 0.3),
      false,
      0.25,
    ),
    mu(
      'splenius',
      v3.add(n1.at, [0, nr * 0.3, nr * 0.75]),
      v3.add(b.head.atlas, [-r * 0.4, nr * 0.25, nr * 0.35]),
      [nr * 0.45, nr * 0.35],
      dir(0, 0.6, 1),
    ),
    mu(
      'pectoral_superficial',
      manubrium,
      at(E, 0.6, -0.1, 1.1),
      [r * 0.8, r * 0.4],
      dir(0.8, 0.5, -0.2),
    ),
    mu('pectoral_deep', sternum, at(E, 0.15, -0.05, 0.9), [r * 0.9, r * 0.5], dir(0.1, 0.4, -1)),
    // Trunk.
    // Hindquarter.
    mu(
      'gluteal_middle',
      at(coxae, -0.5, -0.1, -0.6),
      trochanter,
      [r * 0.85, r * 0.5],
      dir(0, 1, 0.5),
      false,
      0.1,
    ),
    mu(
      'tensor_fasciae_latae',
      at(coxae, 0.2, -0.2, -0.9),
      at(K, 0.55, 0.15, 0.6),
      [r * 0.75, r * 0.4],
      dir(0.6, 1, 0),
      false,
      0.25,
    ),
    mu(
      'biceps_femoris',
      at(ischium, 0.3, 0.2, 0.4),
      at(K, -0.45, 0.3, 0.3),
      [r * 1.1, r * 0.6],
      dir(-0.1, 1, 0),
      false,
      0.15,
    ),
    mu('semitendinosus', ischium, tibia, [r * 0.55, r * 0.55], dir(-1, 0.6, 0)),
    // Bony landmarks under the skin: the withers (spinous processes T1–T9, the highest point of
    // the back), the point of the buttock, the point of the chest.
    {
      ...mu(
        'withers',
        [S[0] + 0.05 * D, 0, top - 0.04 * D],
        [S[0] - 1.0 * D, 0, top - 0.2 * D],
        [r * 0.6, r * 0.8],
        [0, 0, 1],
        true,
        1,
      ),
      blend: 0.15 * D,
    },
    mu(
      'ischial_tuberosity',
      at(ischium, 0, 0, 0.2),
      at(ischium, -0.3, 0, -0.1),
      [r * 0.35, r * 0.32],
      dir(-1, 0.8, 0),
      true,
    ),
    mu(
      'manubrium',
      at(manubrium, 0.1, -1, 0.2),
      at(manubrium, -0.2, -1, -0.4),
      [r * 0.4, r * 0.35],
      dir(1, 0, -0.2),
      true,
    ),
  ];
}
