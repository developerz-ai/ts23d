// The skull edit list, primary → secondary forms (the ZBrush order): cranium, face plate, cheek
// bones, muzzle, mandible + chin, neck; then sockets, brow ridge, lids, nose, lips and the mouth
// line. Head units, mirrored across Y. The jaw cut (head-split.ts) later divides this one field
// into the `head` and `jaw` parts, so their surfaces meet without a seam.

import type { Vec3 } from '../core/index.ts';
import type { SculptEdit } from '../primitives/index.ts';
import { alongX, alongZ, unit } from './head-geom.ts';
import type { HeadLayout } from './head-layout.ts';
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

export function skullEdits(p: HeadParams, l: HeadLayout): SculptEdit[] {
  const c = p.colors;
  const cx = l.cranium.at[0];
  const [ex, ey, ez] = l.eye;
  const r = l.eyeR;
  const lipT = p.mouth.lips;
  const mw = p.mouth.width;
  const [ax, ay, az] = l.angle;
  const [hx, hz] = l.hinge;
  const chin = l.chin;
  const tipX = l.faceX + 0.06 + p.nose.length * 0.25 + p.nose.bridge + p.jaw.muzzle * 0.5;
  const tipZ = l.noseZ + 0.035 - p.nose.hook;
  const e: SculptEdit[] = [
    // Primary: brain case, face plate, cheek bones, muzzle, mandible, chin, neck.
    ...primaryEdits(l),
    {
      shape: 'ellipsoid',
      at: [ex - 0.03, (ey + 0.06) * p.cheeks.width, ez - r - 0.065 * p.cheeks.size],
      size: [0.09 * p.cheeks.size, 0.08 * p.cheeks.size, 0.065 * p.cheeks.size],
      rotate: [0, 0, 25],
      blend: 0.09,
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
      shape: 'ellipsoid',
      at: chin,
      size: [0.065 * p.jaw.chin, 0.09 * p.jaw.chin, 0.07 * p.jaw.chin],
      blend: 0.06,
    },
    {
      shape: 'capsule',
      at: [cx + 0.02, 0, ez - 0.22],
      to: [cx - 0.05, 0, l.base + 0.45],
      size: p.neck.radius,
      blend: 0.1,
    },
    // Secondary: sockets, brow, lids.
    {
      shape: 'capsule',
      at: [ex + r * 0.75, 0.025, l.browZ - p.brow.scowl],
      to: [ex + r * 0.1, ey + r * 1.25, l.browZ + p.brow.scowl * 0.5],
      size: p.brow.ridge,
      blend: 0.06,
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
  const noseRoot: Vec3 = [ex + r * 0.4, 0, ez - r * 0.4];
  const noseDir: Vec3 = [tipX - noseRoot[0], 0, tipZ + 0.01 - noseRoot[2]];
  const midNose: Vec3 = [
    (ex + r * 0.6 + tipX) / 2,
    0,
    (ez - 0.02 + tipZ) / 2 + p.nose.hook * 0.6 + 0.01,
  ];
  e.push(
    {
      shape: 'cone',
      at: noseRoot,
      size: [0.02 + p.nose.width * 0.6, p.nose.tip * 0.8, Math.hypot(...noseDir)],
      rotate: alongZ(noseDir),
      blend: 0.04,
    },
    { shape: 'sphere', at: midNose, size: 0.02 + p.nose.width * 0.2, blend: 0.04 },
    { shape: 'sphere', at: [tipX, 0, tipZ], size: p.nose.tip, blend: 0.03 },
    {
      shape: 'ellipsoid',
      at: [tipX - p.nose.tip * 1.2, p.nose.width, l.noseZ + 0.02],
      size: [0.045, 0.035, 0.032],
      blend: 0.025,
    },
    {
      shape: 'ellipsoid',
      at: [tipX - p.nose.tip * 0.6, p.nose.width * 0.55, l.noseZ + 0.005],
      size: [0.022, 0.014, 0.012],
      op: 'subtract',
      blend: 0.008,
      color: c.mouth,
    },
  );
  // Lips and the mouth line (a grin opens it and lifts the corners).
  const g = p.mouth.grin;
  e.push(
    {
      shape: 'ellipsoid',
      at: [l.mouthX - 0.01, 0, l.mouthZ + lipT * 0.7],
      size: [0.032, mw, lipT],
      color: c.lips,
      blend: 0.03,
    },
    {
      shape: 'ellipsoid',
      at: [l.mouthX - 0.015 + p.jaw.underbite * 0.7, 0, l.mouthZ - lipT * 0.8],
      size: [0.034, mw * 0.85, lipT * 1.1],
      color: c.lips,
      blend: 0.03,
    },
    {
      shape: 'capsule',
      at: [l.mouthX + 0.05, 0, l.mouthZ],
      to: [l.mouthX - 0.03 - 0.02 * g, mw * 0.98, l.mouthZ + 0.012 + g * 0.05],
      size: 0.006 + g * 0.022,
      op: 'subtract',
      blend: 0.012,
      color: c.mouth,
    },
  );
  if (g > 0.15) e.push(...teethRows(p, l));
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
  return e;
}

/** Upper and lower teeth, visible in a grin: rounded blocks along the dental arch. */
function teethRows(p: HeadParams, l: HeadLayout): SculptEdit[] {
  const out: SculptEdit[] = [];
  const mw = p.mouth.width * 0.8;
  for (let i = 0; i < 4; i++) {
    const a = ((i + 0.5) / 4) * 0.9;
    const y = Math.sin(a) * mw;
    const x = l.mouthX - 0.025 - (1 - Math.cos(a)) * mw * 0.9;
    const z = l.mouthZ + 0.004 + p.mouth.grin * 0.03 * (i / 4);
    for (const [dz, h] of [
      [0.016, 0.02],
      [-0.016, 0.018],
    ] as const)
      out.push({
        shape: 'roundBox',
        at: [x, y, z + dz * (1 + p.mouth.grin)],
        size: [0.02, 0.028, h * (1 + p.mouth.grin * 0.6)],
        round: 0.006,
        rotate: [0, 0, (a * 180) / Math.PI],
        color: p.colors.teeth,
        blend: 0.003,
      });
  }
  return out;
}
