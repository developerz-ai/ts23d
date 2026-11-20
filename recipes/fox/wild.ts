// The fox's winter outdoors (`Wild`, recipes/_lib/creature/wild.ts): snow on the back and brush,
// mud on the stockings, wet belly fur, the colour blocks the kind's zones miss, the coat layers.

import { dmath, hex, type Vec3 } from '@developerz.ai/ts23d';
import type { Wild } from '../_lib/creature/wild.ts';
import { faceFur } from '../_lib/creature/wild-head.ts';
import { mix, nearChain, noise3, smooth } from '../_lib/creature/wild-paint.ts';
import { FOX } from './spec.ts';

/**
 * The fox's winter: the brush and back dusted with snow knocked off the brush it pushed through,
 * thaw mud drying pale on the black stockings, wet fur under the belly, the right ear nicked and a
 * healed bite on the left of the muzzle. Colour blocks the kind's zones miss are painted first:
 * the hind thigh and upper arm are red (the cream belly zone climbed over them), and the black
 * stockings start at the elbow and hock at every LOD.
 */
export const FOX_WILD: Wild = {
  wear: (info) => {
    const H = info.bones.height;
    const l = info.head;
    const muzzle = l.L - l.lc;
    const h = info.bones.head;
    const tailRoot = info.bones.tailRoot;
    const [c, s] = [dmath.cos(h.pitch), dmath.sin(h.pitch)];
    const onHead = (p: readonly [number, number, number]): [number, number, number] => [
      h.atlas[0] + c * p[0] + s * p[2],
      h.atlas[1] + p[1],
      h.atlas[2] - s * p[0] + c * p[2],
    ];
    return {
      seed: 8332,
      // A thin frost of fine flecks under the snowed hair tips (FOX_WILD.coat), not blobs.
      settle: {
        colour: [0.86, 0.89, 0.93],
        strength: 0.3,
        above: H * 0.78,
        patch: 0.016,
        // The back and shoulders, thinning to nothing on the face and the brush.
        mask: (p) =>
          smooth(tailRoot[0] - 0.02, tailRoot[0] + 0.05, p[0]) *
          smooth(h.atlas[0] + 0.03, h.atlas[0] - 0.04, p[0]),
      },
      // Clay caked on the paws and drying pale up the stockings' feet, splashed to the wrists
      // (any higher and the black stockings, the fox's mark, went a dusty brown).
      mud: { top: H * 0.2, colour: hex('#9a866c'), strength: 0.9 },
      // Wet clumped fur up the stockings' tops and under the belly: the snow melt it waded.
      damp: { top: H * 0.5, belly: H * 0.62, strength: 0.5 },
      matted: {
        zones: [
          { at: [tailRoot[0] + 0.14, 0.05, H * 0.62], radius: H * 0.3 },
          { at: [h.atlas[0] - 0.2, 0.05, H * 0.6], radius: H * 0.26 },
        ],
        strength: 0.5,
        width: 0.012,
      },
      scarColour: hex('#c9a79a'),
      scars: [
        {
          a: onHead([l.lc + muzzle * 0.2, l.rt * 0.7, l.zt + l.rt]),
          b: onHead([l.lc + muzzle * 0.62, l.rt * 0.3, l.zt + l.rt]),
          width: 0.004,
          axis: 2,
          reach: 0.02,
        },
      ],
    };
  },
  base: (info) => {
    const H = info.bones.height;
    const col = FOX.colours;
    const black = col.legs ?? col.coat;
    const leg = (name: 'fore' | 'hind') => info.bones.legs.find((x) => x.name === name);
    const fore = leg('fore');
    const hind = leg('hind');
    const r = info.bones.limbR;
    // Upper segments (shoulder → elbow, hip → stifle) and the lower chains to the paws.
    const upper = [fore, hind].map((x) => nearChain(x ? x.joints.slice(0, 2) : [], r * 1.5));
    const lower = [fore, hind].map((x) =>
      nearChain(x ? [...x.joints.slice(1), x.foot] : [], r * 1.3),
    );
    const [back, belly] = [col.back ?? col.coat, col.belly ?? col.coat];
    const rump = info.bones.tailRoot[0];
    // The white tip: the last fifth of the brush, every LOD (the far mesh's cells lost it).
    const tail = info.bones.tail;
    const girth = Math.max(...tail.map((t) => t.r), 0.01);
    const tip = nearChain(
      tail.slice(Math.floor(tail.length * 0.78)).map((t) => t.at),
      girth * 1.6,
    );
    // Snow caught on the black ear tips (head frame: the top of each ear above its root).
    const h = info.bones.head;
    const l = info.head;
    const earTop = l.ear ? l.ear[2] + l.earHeight * 0.55 : Infinity;
    const local = (p: Vec3): Vec3 => {
      const d: Vec3 = [p[0] - h.atlas[0], p[1] - h.atlas[1], p[2] - h.atlas[2]];
      const [cs, sn] = [dmath.cos(h.pitch), dmath.sin(h.pitch)];
      return [cs * d[0] - sn * d[2], d[1], sn * d[0] + cs * d[2]];
    };
    return ({ p, n, c: given, lod, part }) => {
      if (part === 'head' || part === 'head_fur') {
        const q = local(p);
        // Fine flecks on the black tip, never a cap: 3 mm noise, its top third only (6 mm flecks
        // over 45 % of the tip read as a flat grey-white card, D483).
        const fleck = noise3(q[0] / 0.003, q[1] / 0.003, q[2] / 0.003, 8333);
        const snow = smooth(earTop, earTop + l.earHeight * 0.3, q[2]) * smooth(0.62, 0.72, fleck);
        return mix(given, [0.88, 0.9, 0.94], snow * (lod === 2 ? 0 : 0.7));
      }
      if (part !== 'body' && part !== 'fur') return given;
      let c = mix(given, col.tailTip ?? given, tip(p) * (lod === 2 ? 1 : 0));
      if (lod === 2 && part === 'body') {
        // The far mesh's 4 cm cells turn the sculpt's per-vertex tone into facets: its coat is
        // the animal's blocks (russet back, red flank, cream underside and chest), with a
        // fifth of the sculpt's shading; the brush keeps its own paint and white tip.
        let k = mix(col.coat, back, smooth(0.1, 0.6, n[2]) * smooth(H * 0.7, H * 0.85, p[2]));
        k = mix(k, belly, smooth(-0.2, -0.7, n[2]) * smooth(H * 0.4, H * 0.55, p[2]));
        const chest = smooth(0.35, 0.8, n[0]) * smooth(H * 0.5, H * 0.62, p[2]);
        k = mix(k, belly, chest * smooth(H * 1.0, H * 0.85, p[2]) * 0.85);
        c = mix(k, c, 0.2 + 0.8 * smooth(rump + 0.01, rump - 0.03, p[0]));
      }
      // Outward-facing skin of the upper limb: red like the flank, not the belly's cream.
      const out = smooth(-0.1, 0.35, n[1] * Math.sign(p[1]));
      const thigh = Math.max(upper[0]?.(p) ?? 0, upper[1]?.(p) ?? 0) * out;
      let k = mix(c, col.coat, thigh * smooth(H * 0.42, H * 0.55, p[2]));
      // Stockings: black from just under the elbow and hock down, the same edge at every LOD
      // (the far leg tubes carry a ring where the colour turns).
      const top = H * 0.52;
      const sock = Math.max(lower[0]?.(p) ?? 0, lower[1]?.(p) ?? 0);
      k = mix(k, black, sock * smooth(top, top - H * 0.14, p[2]));
      return k;
    };
  },
  coat: (info) => {
    const H = info.bones.height;
    const tail = info.bones.tail;
    const girth = Math.max(...tail.map((t) => t.r), 0.01);
    const along = nearChain(
      tail.slice(1).map((t) => t.at),
      girth,
    );
    const brush = (p: readonly [number, number, number]): number =>
      along([p[0], 0, p[2]]) * smooth(0.012, 0, Math.abs(p[1]) - girth);
    const atlas = info.bones.head.atlas[0];
    const root = info.bones.tailRoot[0];
    // Snow on the hair tips along the topline, withers to croup: every second or third lock.
    const snowed = (p: Vec3): number =>
      smooth(H * 0.84, H * 0.96, p[2]) *
      smooth(root, root + 0.05, p[0]) *
      smooth(atlas - 0.02, atlas - 0.08, p[0]) *
      smooth(0.56, 0.66, noise3(p[0] / 0.014, p[1] / 0.014, p[2] / 0.014, 8332));
    return {
      // Dense and short: a fox's coat is a soft even pile, not a few guard hairs on bare skin.
      density: 9000,
      // The brush: guard hair three times the body's, standing off the tail all round.
      length: (p) => 0.02 + 0.04 * brush(p),
      width: 0.0055,
      // Trunk, shoulders and thighs down to the elbow and stifle; the stockings stay sleek.
      where: (p, n) =>
        Math.max(brush(p), smooth(H * 0.4, H * 0.52, p[2]) * smooth(-0.35, 0.05, n[2])),
      tone: [0.8, 1.28],
      // Longer guard hair in clumped locks, pale at the tips: the winter coat's loft.
      guard: { density: 1700, length: 0.034, width: 0.008, tone: [0.76, 1.4] },
      // Snow on the topline's tips and caught on the upper side of the brush it dragged.
      color: (p, skin) =>
        mix(
          skin,
          [0.9, 0.92, 0.95],
          Math.max(
            snowed(p) * 0.8,
            brush(p) *
              smooth(0.6, 0.7, noise3(p[0] / 0.012, p[1] / 0.012, p[2] / 0.012, 8334)) *
              0.75,
          ),
        ),
      // Far: a fringe along the back and the brush's ragged edge.
      far: {
        density: 700,
        length: 0.035,
        width: 0.02,
        where: (p, n) =>
          Math.max(brush(p) * 0.8, smooth(0.3, 0.75, n[2]) * smooth(H * 0.86, H * 0.95, p[2])),
      },
    };
  },
  // Locks 1.9 cm across (2.5 body cells) along the coat's lie.
  locks: { size: 0.019, strength: 0.45, seed: 8332 },
  // The coated width (README: 0.18 m): no lock past 9.2 cm off the midline.
  box: { y: 0.092 },
  whiskers: { count: 12, length: 0.05, radius: 0.00045, colour: [0.07, 0.06, 0.055], brow: 1 },
  // The cards carry the wear: each painted from the skin under its root, clotted short in the
  // clay on the paws, parted along the muzzle's bite.
  cardWear: { mud: 0.55, scar: 0.15 },
  nick: -1,
  // A shallow notch: at the default 0.32 of the ear's height the fox's thin shell was cut to a
  // stalk under its tip, which then stood off it as a grey-white card (D483).
  nickDepth: 0.14,
  sheen: [0.14, 0.08, 0.05],
  // The cards back at the coat's value in the path-traced hero: the strand texture averages about
  // 0.9 of the coat (D481; the renderer's strand shading, once 0.7 of a matte surface, is fixed in
  // D476).
  cardLift: 1.1,
  // A velvet of short cards over the face: the planes read as fur, not as painted plastic.
  groom: (info, lod) => faceFur(info, lod, { density: 16000, length: [0.008, 0.02], width: 0.004 }),
};
