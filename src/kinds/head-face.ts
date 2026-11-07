// The skull edit list, primary → secondary forms (the ZBrush order): cranium, face plate, cheek
// bones, muzzle, mandible + chin, neck; then sockets, brow ridge, lids, nose, lips and the mouth
// line. Head units, mirrored across Y. The jaw cut (head-split.ts) later divides this one field
// into the `head` and `jaw` parts, so their surfaces meet without a seam.

import type { Vec3 } from '../core/index.ts';
import type { SculptEdit } from '../primitives/index.ts';
import { alongX, alongZ, unit } from './head-geom.ts';
import type { HeadLayout } from './head-layout.ts';
import { mouthEdits } from './head-mouth.ts';
import type { HeadParams } from './head-params.ts';

/** Brain case + face plate: the forms the eyes are seated against (head.ts probes them). */
export function primaryEdits(l: HeadLayout): SculptEdit[] {
  const [cx, , cz] = l.cranium.at;
  const [rx, ry, rz] = l.cranium.r;
  return [
    { shape: 'ellipsoid', at: [cx, 0, cz], size: [rx, ry, rz] },
    {
      shape: 'ellipsoid',
      at: [l.faceX - 0.19, 0, l.eye[2] - 0.03],
      size: [0.2, ry * 0.86, 0.24],
      blend: 0.08,
    },
  ];
}

/** `cell`: the sculpt cell (head units). Far LODs drop the teeth and floor the nose's radii at
 *  about 0.6 cells so a long nose survives. */
export function skullEdits(p: HeadParams, l: HeadLayout, cell = 0): SculptEdit[] {
  const fine = cell < 0.03;
  const tipR = Math.max(p.nose.tip, cell * 0.6);
  const c = p.colors;
  const cx = l.cranium.at[0];
  const [ex, ey, ez] = l.eye;
  const r = l.eyeR;
  const mw = p.mouth.width;
  const [ax, ay, az] = l.angle;
  const [hx, hz] = l.hinge;
  const chin = l.chin;
  const tipX = l.faceX + 0.06 + p.nose.length * 0.25 + p.nose.bridge + p.jaw.muzzle * 0.5;
  const tipZ = l.noseZ + 0.035 - p.nose.hook;
  const bIn: Vec3 = [ex + r * 0.75, 0.03, l.browZ - p.brow.scowl];
  const bOut: Vec3 = [ex + r * 0.05, ey + r * 1.3, l.browZ + p.brow.scowl * 0.5];
  const e: SculptEdit[] = [
    // Primary: brain case, face plate, cheek bones, muzzle, mandible, chin, neck.
    ...primaryEdits(l),
    {
      shape: 'ellipsoid',
      at: [ex - 0.03, (ey + 0.06) * p.cheeks.width, ez - r - 0.065 * p.cheeks.size],
      size: [0.075 * p.cheeks.size, 0.07 * p.cheeks.size, 0.055 * p.cheeks.size],
      rotate: [0, 0, 25],
      blend: 0.08,
    },
    // Zygomatic arch: the cheekbone ridge running back from under the eye towards the ear.
    {
      shape: 'capsule',
      at: [ex - r * 0.2, (ey + 0.05) * p.cheeks.width, ez - r - 0.03],
      to: [cx + 0.06, l.cranium.r[1] * 0.92, ez - 0.07],
      size: 0.028 * p.cheeks.size,
      blend: 0.05,
    },
    // Maxilla: fills the midface between cheekbones, nose and muzzle.
    {
      shape: 'ellipsoid',
      at: [l.faceX - 0.13 + p.jaw.muzzle * 0.6, 0, l.noseZ + 0.01],
      size: [0.15, 0.2 * p.cheeks.width, 0.13],
      blend: 0.08,
    },
    {
      shape: 'ellipsoid',
      at: [l.mouthX - 0.13, 0, l.mouthZ + 0.02],
      size: [0.14, Math.max(mw * 1.15, 0.13), 0.12 + p.jaw.drop * 0.2],
      blend: 0.07,
    },
    // Mandible: a U of bone — body from the jaw angles to the chin, ramus up to the hinge.
    {
      shape: 'roundBox',
      at: [(ax + chin[0]) / 2 + 0.01, 0, (az + chin[2]) / 2 + 0.03],
      size: [chin[0] - ax + 0.04, ay * 1.75, 0.16 + p.jaw.drop * 0.5],
      round: 0.07,
      rotate: [0, Math.atan2(az - chin[2], chin[0] - ax) * (180 / Math.PI) * 0.6, 0],
      blend: 0.08,
    },
    {
      shape: 'capsule',
      at: [hx - 0.04, ay * 0.85, hz],
      to: [ax, ay, az],
      size: 0.055,
      blend: 0.07,
    },
    { shape: 'sphere', at: [ax + 0.02, ay * 0.95, az], size: 0.065, blend: 0.07 },
    {
      shape: 'roundBox',
      at: chin,
      size: [0.13 * p.jaw.chin, 0.18 * p.jaw.chin, 0.14 * p.jaw.chin],
      round: 0.06 * p.jaw.chin,
      blend: 0.06,
    },
    {
      shape: 'capsule',
      at: [cx + 0.02, 0, ez - 0.22],
      to: [cx - 0.05, 0, l.base + 0.45],
      size: p.neck.radius,
      blend: 0.1,
    },
    // Sternocleidomastoid: the cords from behind the ear to the throat.
    {
      shape: 'capsule',
      at: [cx - 0.03, l.cranium.r[1] * 0.68, ez - 0.28],
      to: [cx + p.neck.radius * 0.6, 0.05, l.base + 0.74],
      size: p.neck.radius * 0.26,
      blend: 0.05,
    },
    // Secondary: brow shelf (a flattened bar along the brow line, lowered inside by the scowl)
    // with the glabella knot between the eyes, then the sockets and lids.
    {
      shape: 'ellipsoid',
      at: [(bIn[0] + bOut[0]) / 2, (bIn[1] + bOut[1]) / 2, (bIn[2] + bOut[2]) / 2],
      size: [
        Math.hypot(bOut[0] - bIn[0], bOut[1] - bIn[1], bOut[2] - bIn[2]) / 2 + p.brow.ridge * 0.6,
        p.brow.ridge * 1.25,
        p.brow.ridge * 0.85,
      ],
      rotate: alongX([bOut[0] - bIn[0], bOut[1] - bIn[1], bOut[2] - bIn[2]]),
      blend: 0.05,
    },
    {
      shape: 'sphere',
      at: [bIn[0] - 0.01, 0, bIn[2] - p.brow.ridge * 0.15],
      size: p.brow.ridge * 1.05,
      blend: 0.05,
    },
    { shape: 'sphere', at: l.eye, size: r * 1.12, op: 'subtract', blend: r * 0.5, color: c.shade },
  ];
  // Lids: a shell over the eyeball, kept above (upper) / below (lower) a plane through the eye
  // centre tilted to the lid angle, so the lid edge crosses the cornea exactly at that angle.
  const lid = (deg: number, upper: boolean): SculptEdit => {
    const t = (deg * Math.PI) / 180;
    const n: Vec3 = upper ? [-Math.sin(t), 0, Math.cos(t)] : [Math.sin(t), 0, Math.cos(t)];
    const k = upper ? 1 : -1;
    return {
      group: [
        { shape: 'sphere', at: l.eye, size: r * (upper ? 1.14 : 1.1) },
        {
          shape: 'roundBox',
          at: [ex + n[0] * k, ey, ez + n[2] * k],
          size: [4, 4, 2],
          rotate: [0, upper ? -deg : deg, 0],
          op: 'intersect',
        },
      ],
      blend: r * 0.22,
    };
  };
  e.push(lid(p.eyes.lid, true), lid(p.eyes.lowerLid, false));
  // Nose: bridge (humped by `hook`), tip, wings, nostrils.
  const long = p.nose.bridge > 0.06 ? 0.65 : 1;
  const wing = Math.min(1.4, Math.max(0.55, p.nose.width / 0.065)) * long;
  const rootR = Math.max(0.02 + p.nose.width * 0.6, cell * 0.65);
  // Nostril wings sit at the nose base, however far a long nose reaches past them.
  const wingX = Math.min(tipX - p.nose.tip * 1.2, l.faceX + 0.1 + p.jaw.muzzle * 0.5);
  const noseRoot: Vec3 = [ex + r * 0.4, 0, ez - r * 0.4];
  const noseDir: Vec3 = [tipX - noseRoot[0], 0, tipZ + 0.01 - noseRoot[2]];
  const midNose: Vec3 = [
    (ex + r * 0.6 + tipX) / 2,
    0,
    (ez - 0.02 + tipZ) / 2 + p.nose.hook * 0.3 + 0.01,
  ];
  e.push(
    {
      shape: 'cone',
      at: noseRoot,
      size: [rootR, tipR * 0.85, Math.hypot(...noseDir)],
      rotate: alongZ(noseDir),
      blend: 0.045,
    },
    {
      shape: 'sphere',
      at: midNose,
      size: ((rootR + tipR) / 2) * 0.85 + Math.max(0, p.nose.hook) * 0.12,
      blend: 0.05,
    },
    { shape: 'sphere', at: [tipX, 0, tipZ], size: tipR, blend: 0.035 },
    // A strong hook draws the tip out into a drooping point (one form, not a ball on a stick).
    ...(p.nose.hook > 0.04
      ? [
          {
            shape: 'cone',
            at: [tipX, 0, tipZ],
            size: [tipR * 0.9, 0.01, p.nose.tip + p.nose.hook * 1.2],
            rotate: alongZ([0.6, 0, -1]),
            blend: 0.03,
          } satisfies SculptEdit,
        ]
      : []),
    {
      shape: 'ellipsoid',
      at: [wingX, p.nose.width, l.noseZ + 0.02],
      size: [0.045 * wing, 0.035 * wing, 0.032 * wing],
      blend: 0.025,
    },
    {
      shape: 'ellipsoid',
      at: [Math.min(tipX - p.nose.tip * 0.6, wingX + 0.035), p.nose.width * 0.55, l.noseZ + 0.005],
      size: [0.022 * wing, 0.014 * wing, 0.012 * wing],
      op: 'subtract',
      blend: 0.008,
      color: c.mouth,
    },
  );
  e.push(...mouthEdits(p, l, fine));
  // Nasolabial fold from the nose wing towards the mouth corner.
  const fold = unit([-0.02, mw - p.nose.width, l.mouthZ - l.noseZ]);
  e.push({
    shape: 'ellipsoid',
    at: [tipX - p.nose.tip * 1.5 - 0.035, p.nose.width + 0.05, l.noseZ - 0.035],
    size: [0.08, 0.006, 0.006],
    rotate: alongX(fold),
    op: 'subtract',
    blend: 0.03,
    color: c.shade,
  });
  // Forehead creases, painted (a groove that thin is below the sculpt cell): thin discs through
  // the brow, fading where the forehead turns away.
  const [, , cz] = l.cranium.at;
  const [crx, , crz] = l.cranium.r;
  for (let i = 0; i < (p.wrinkles ?? 0); i++) {
    const z = l.browZ + 0.07 + i * 0.05;
    const x = cx + crx * Math.sqrt(Math.max(0, 1 - ((z - cz) / crz) ** 2)) + 0.005;
    e.push({
      shape: 'ellipsoid',
      at: [x, 0.06, z - 0.008],
      size: [0.05, 0.08 - i * 0.012, 0.005],
      rotate: [-14, -12, 0],
      op: 'paint',
      blend: 0.01,
      color: c.shade,
    });
  }
  return e;
}
