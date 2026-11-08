// The face on the bust library's head (head.ts): the orbit — a soft lid aperture in front of the
// ball and a snug bore behind its equator that the eye's `socket` joint measures — the cheekbone
// as a low ridge on the block's planes, the malar fat pad, the nose (bridge, tip, wings,
// nostrils), lips round a teeth cylinder with the lip line, lids from eye.ts, and the expression
// lines (nasolabial, lid fold) scaled by the race's `lines`.

import { type SculptEdit, sculptField } from '@developerz.ai/ts23d';
import { type EyeSpec, lidEdits } from './eye.ts';
import { type HeadSpec, headBlock, kn, type Landmarks, landmarks } from './head.ts';
import {
  chain,
  clayOn,
  creaseOn,
  ell,
  frameOf,
  k,
  local,
  type Surface,
  surface,
  taper,
  type V,
} from './kit.ts';

/** The orbit's bore radius ÷ the eyeball's: a snug fit with a hair of clearance. */
export const SEAT = 1.1;

/** The orbit behind the eyeball's equator: a round bore along the gaze, R × SEAT, a radius deep. */
function orbitBore(l: Landmarks): SculptEdit {
  const [ex, ey, ez] = l.eye;
  const r = l.eyeR * SEAT;
  const front = ex - l.eyeR * 0.05;
  const back = ex - l.eyeR * 1.1;
  return {
    field: (p) => Math.max(Math.hypot(p[1] - ey, p[2] - ez) - r, p[0] - front, back - p[0]),
    bounds: [
      [back - 0.002, ey - r - 0.002, ez - r - 0.002],
      [front + 0.002, ey + r + 0.002, ez + r + 0.002],
    ],
    op: 'subtract',
    blend: l.eyeR * 0.08,
  };
}

/** Stage 2+: eye sockets; 3+: nose, cheekbones, mouth, lids; 4: lines. */
export function faceEdits(s: HeadSpec, eye: EyeSpec, stage: number, sf?: Surface): SculptEdit[] {
  const l = landmarks(s);
  const { H } = l;
  const out: SculptEdit[] = [];
  // Zygoma: a low RIDGE on the block's surface from the malar eminence under the outer eye corner
  // back along the arch toward the ear, blended wide into the cheek plane — a plane change the
  // light catches, never a knob.
  const cb = kn(s, 'cheekbone');
  const block = surface(sculptField([headBlock(s, 2)], { color: s.skin, mirror: 'y' }).field);
  const [ex0, , ez1] = l.eye;
  const ez0 = ez1 + kn(s, 'cheekLift') * H;
  out.push(
    clayOn(
      block,
      [
        [ex0 + 0.03 * H, l.zygoma[1] * 0.78, ez0 - 0.1 * H],
        [ex0 - 0.03 * H, l.zygoma[1] * 0.98, ez0 - 0.085 * H],
        [ex0 - 0.13 * H, l.zygoma[1] * 1.12, ez0 - 0.07 * H],
        [ex0 - 0.24 * H, l.zygoma[1] * 1.16, ez0 - 0.08 * H],
      ],
      0.035 * H,
      0.009 * H * cb,
      { blend: 0.1 * H, tips: 0.45 },
    ),
  );
  // Malar fat pad: the soft "apple" on the front of the cheek under the eye — fullness that reads
  // young; `hollow` drains it.
  out.push(
    ell(
      [l.gx - 0.07 * H, 0.165 * H, ez0 - 0.14 * H],
      [0.06 * H, 0.065 * H, 0.06 * H * (1 - 0.5 * kn(s, 'hollow'))],
      { blend: 0.1 * H },
    ),
  );
  // Nose: bridge from the nasion, a tip, wings.
  const nw = kn(s, 'noseWidth');
  const hook = kn(s, 'noseHook');
  const tip: V = [l.noseTip[0], 0, l.noseTip[2] - hook * H];
  const bridge = frameOf(l.nasion, [tip[0] - l.nasion[0], 0, tip[2] - l.nasion[2]], [1, 0, 0.6]);
  const bl = Math.hypot(tip[0] - l.nasion[0], tip[2] - l.nasion[2]);
  out.push(
    local(
      bridge,
      k.ellipsoid(bl * 0.5, 0, -0.012 * H, bl * 0.58, 0.042 * H * nw, 0.035 * H),
      [
        [-0.1 * H, -0.1 * H, -0.1 * H],
        [bl + 0.1 * H, 0.1 * H, 0.1 * H],
      ],
      { blend: 0.07 * H },
    ),
  );
  out.push(
    ell([tip[0] - 0.02 * H, 0, tip[2]], [0.04 * H, 0.05 * H * nw, 0.04 * H], {
      blend: 0.05 * H,
      mirror: false,
    }),
  );
  out.push(
    ell(
      [l.subnasale[0] - 0.02 * H, 0.055 * H * nw, l.subnasale[2] + 0.02 * H],
      [0.035 * H, 0.03 * H, 0.03 * H],
      { blend: 0.04 * H },
    ),
  );
  if (stage < 2) return out;
  // Sockets: the lid aperture opened in front of the ball, wide and soft so the brow and cheek
  // planes roll into the orbit without a ledge; behind the ball's equator, a snug bore (the orbit
  // proper) that the `socket` joint measures against the ball — cut after the lids, which would
  // otherwise fill it.
  const [ex, ey, ez] = l.eye;
  const R = l.eyeR;
  out.push(
    ell([ex + R * 0.85, ey, ez + R * 0.05], [R * 0.95, R * 1.3, R * 1.0], {
      op: 'subtract',
      blend: R * 0.7 * kn(s, 'socket'),
    }),
  );
  if (stage < 3 || !sf) return [...out, orbitBore(l)];
  out.push(...lidEdits(eye), orbitBore(l));
  // Nostrils.
  out.push(
    ell(
      [l.subnasale[0] + 0.01 * H, 0.03 * H * nw, l.subnasale[2] + 0.012 * H],
      [0.02 * H, 0.016 * H * nw, 0.012 * H],
      { op: 'subtract', blend: 0.01 * H, rotate: [0, 25, 15], color: [0.08, 0.03, 0.02] },
    ),
  );
  // Lips on the muzzle, round the teeth cylinder.
  const lips = kn(s, 'lips');
  const arc = (rr: number, a: number, zz: number): V => {
    const t = (a * Math.PI) / 180;
    return [l.teeth.x + rr * Math.cos(t), rr * Math.sin(t), zz];
  };
  const mz = l.mouth[2];
  // The lips end at the mouth corners: the arc angle whose half-width is the mouth's.
  const corner = (Math.asin(Math.min(0.9, (kn(s, 'mouth') * H) / l.teeth.r)) * 180) / Math.PI;
  const up = Array.from({ length: 8 }, (_, i) =>
    arc(l.teeth.r + 0.006 * H, (i * corner) / 7, mz + 0.014 * H - i * i * 0.0004 * H),
  );
  out.push(
    chain([...up].reverse(), taper(8, 0.006 * H, 0.018 * H * lips, 0), {
      blend: 0.04 * H,
      join: 0.015 * H,
      color: s.lips,
    }),
  );
  const lo = Array.from({ length: 8 }, (_, i) =>
    arc(l.teeth.r + 0.002 * H, (i * corner * 0.95) / 7, mz - 0.024 * H + i * i * 0.0005 * H),
  );
  out.push(
    chain([...lo].reverse(), taper(8, 0.006 * H, 0.022 * H * lips, 0), {
      blend: 0.04 * H,
      join: 0.015 * H,
      color: s.lips,
    }),
  );
  out.push(
    creaseOn(
      sf,
      Array.from({ length: 6 }, (_, i) =>
        arc(l.teeth.r + 0.02 * H, (i * corner * 1.05) / 5, mz - i * i * 0.0003 * H),
      ),
      0.005 * H,
      // Shallower on a smooth young face (`lines` 0); the corners taper out, not pits.
      0.005 * H * (0.6 + 0.4 * kn(s, 'lines')),
      { blend: 0.005 * H, tips: 0.15, color: [s.lips[0] * 0.4, s.lips[1] * 0.3, s.lips[2] * 0.3] },
    ),
  );
  const lines = kn(s, 'lines');
  if (stage < 4 || lines <= 0) return out;
  // Nasolabial fold and the upper lid fold — scaled by `lines`.
  out.push(
    creaseOn(
      sf,
      [
        [l.subnasale[0] - 0.02 * H, 0.08 * H * nw, l.subnasale[2] + 0.03 * H],
        [l.mouth[0] - 0.05 * H, 0.15 * H, mz + 0.02 * H],
        [l.mouth[0] - 0.07 * H, 0.17 * H, mz - 0.03 * H],
      ],
      0.008 * H,
      0.005 * H * lines,
    ),
  );
  out.push(
    creaseOn(
      sf,
      [
        [ex + l.eyeR * 0.6, ey - l.eyeR * 0.9, ez + l.eyeR * 1.15],
        [ex + l.eyeR * 0.75, ey, ez + l.eyeR * 1.35],
        [ex + l.eyeR * 0.3, ey + l.eyeR * 1.1, ez + l.eyeR * 1.1],
      ],
      0.005 * H,
      0.0035 * H * lines,
    ),
  );
  return out;
}
