// The grey wolf's season outdoors (`Wild`, recipes/_lib/creature/wild.ts): thaw mud, wet fur,
// matted flanks, bite scars, the LOD2 colour blocks, the coat card layers and the face's velvet.

import { type CreatureInfo, dmath, hex, type Vec3 } from '@developerz.ai/ts23d';
import type { Wild } from '../_lib/creature/wild.ts';
import { faceFur } from '../_lib/creature/wild-head.ts';
import { mix, nearChain, smooth } from '../_lib/creature/wild-paint.ts';
import { WOLF } from '../_lib/creature/wolf-spec.ts';

/** Head-local point (+X to the nose, origin at the atlas) → world. */
const onHead = (info: CreatureInfo, p: Vec3): Vec3 => {
  const h = info.bones.head;
  const [c, s] = [dmath.cos(h.pitch), dmath.sin(h.pitch)];
  return [h.atlas[0] + c * p[0] + s * p[2], h.atlas[1] + p[1], h.atlas[2] - s * p[0] + c * p[2]];
};

/**
 * The wolf's season outdoors: thaw mud caked on the paws and splashed up the cannons, wet darker
 * fur to the hocks and under the belly, the flank and breeches matted into clumps, an old bite
 * scar across the right shoulder and a claw line down the right side of the muzzle, the right ear
 * nicked. At LOD2 the coarse cells lose the saddle: it is painted back as one dark block.
 */
export const WOLF_WILD: Wild = {
  wear: (info) => {
    const H = info.bones.height;
    const fore = info.bones.legs.find((l) => l.name === 'fore');
    const hind = info.bones.legs.find((l) => l.name === 'hind');
    const shoulder = fore?.joints[0] ?? [0.38, 0.075, 0.56];
    const hip = hind?.joints[0] ?? [-0.24, 0.075, 0.65];
    const l = info.head;
    const muzzle = l.L - l.lc;
    return {
      seed: 41,
      // Thaw mud caked on the paws, graded up to the wrists and hocks, splashed to the elbows; grey-brown clay, paler than
      // the wet fur above it, so the band reads as mud and not as a darker leg.
      mud: { top: H * 0.32, colour: hex('#6e5c48'), strength: 0.92 },
      // Wet to the wrists and hocks only (to the elbows it dyed the whole leg one dark sock).
      damp: { top: H * 0.32, belly: H * 0.62, strength: 0.4 },
      matted: {
        zones: [
          { at: [(shoulder[0] + hip[0]) / 2, 0.1, H * 0.66], radius: H * 0.24 },
          { at: [hip[0] - 0.03, 0.1, H * 0.6], radius: H * 0.2 },
          { at: [shoulder[0] + 0.02, 0.1, H * 0.55], radius: H * 0.16 },
        ],
        strength: 0.6,
        width: 0.02,
      },
      patches: [
        // Clay dried pale where it rolled: the right haunch and the point of the shoulder,
        // each a hand or two across so they read with the whole wolf in frame.
        {
          at: [hip[0] - 0.02, -0.14, H * 0.6],
          radius: H * 0.2,
          colour: hex('#7e6c55'),
          strength: 0.85,
          far: false,
        },
        {
          at: [shoulder[0] - 0.05, -0.13, H * 0.5],
          radius: H * 0.13,
          colour: hex('#a89676'),
          strength: 0.75,
          // On the far mesh's flat cells the dried clay read as pale slabs on hip and shoulder.
          far: false,
        },
        // Wet mud where it lay down on its right side in the thaw: the lower flank, the brisket
        // and the belly fringe dark and clotted, a hand and more across.
        {
          at: [shoulder[0] - 0.04, -0.1, H * 0.5],
          radius: H * 0.2,
          colour: hex('#3e3328'),
          strength: 0.8,
        },
        {
          at: [(shoulder[0] + hip[0]) / 2, -0.11, H * 0.5],
          radius: H * 0.24,
          colour: hex('#3e3328'),
          strength: 0.75,
        },
      ],
      // Healed bites under the winter coat: the hair grows back a shade paler and greyer than
      // the coat round it, shorter (`cardWear` paints and shortens the cards rooted on it), with
      // the fur parted darker either side. A fixed pale core (#b4a991) read as two bright white
      // paint strokes on the shoulder (D482).
      scarColour: (c) => {
        const grey = (c[0] + c[1] + c[2]) / 3;
        const k = (i: number): number => ((c[i] ?? 0) * 0.45 + grey * 0.55) * 1.5;
        return [k(0), k(1), k(2)];
      },
      scars: [
        {
          a: [shoulder[0] + 0.07, -0.12, shoulder[2] + 0.16],
          b: [shoulder[0] - 0.1, -0.12, shoulder[2] - 0.02],
          width: 0.016,
          axis: 1,
          reach: 0.07,
        },
        {
          a: [shoulder[0] + 0.0, -0.12, shoulder[2] + 0.19],
          b: [shoulder[0] - 0.13, -0.12, shoulder[2] + 0.06],
          width: 0.008,
          axis: 1,
          reach: 0.07,
        },
        {
          a: onHead(info, [l.lc + muzzle * 0.15, -l.rt * 0.75, l.zt + l.rt]),
          b: onHead(info, [l.lc + muzzle * 0.7, -l.rt * 0.35, l.zt + l.rt]),
          width: 0.0055,
          axis: 2,
          reach: 0.035,
        },
      ],
    };
  },
  base: (info) => {
    const H = info.bones.height;
    const col = WOLF.colours;
    const [back, belly, legs] = [col.back ?? col.coat, col.belly ?? col.coat, col.legs ?? col.coat];
    // The tail chain (its paint and dark tip stay): a cut at the rump's x also handed the back of
    // the thighs the sculpt's pale tawny, a flat pale slab on the far hip (D482).
    const tail = info.bones.tail;
    const girth = Math.max(...tail.map((t) => t.r), 0.01);
    const near = nearChain(
      tail.map((t) => t.at),
      girth * 1.6,
    );
    const root = info.bones.tailRoot[0];
    // Behind the root and inside the tail's own girth, not the buttocks either side of it.
    const onTail = (p: Vec3): number =>
      near(p) * smooth(root, root - 0.04, p[0]) * smooth(girth * 1.1, girth * 0.7, Math.abs(p[1]));
    // The near coat's value under its cards and locks: the far mesh has neither, so its blocks
    // are painted at the shade the LOD0 coat reads at (a plain `coat` read pale tan at the switch).
    const shade = (c: Vec3, k: number): Vec3 => [c[0] * k, c[1] * k, c[2] * k];
    const fx = info.bones.legs.find((l) => l.name === 'fore')?.joints[0]?.[0] ?? 0.38;
    return ({ p, n, c, lod, part }) => {
      if (lod !== 2 || part !== 'body') return c;
      // The far mesh's cells are 6 cm: the sculpt's per-vertex grizzle and cavity tone land on
      // it as checkers. Its coat is painted as the animal's blocks instead: the dark grizzled
      // saddle over the back and down the upper flanks, the shaded tawny lower flanks, the cream
      // underside and chest, the legs darkening to the mud on the paws.
      // The saddle: the near coat's dark grizzle (back × 0.5) over the back and halfway down the
      // flanks, the same reach as at LOD0 (at back × 0.68 over the top only, the far wolf read
      // as one pale tan: D482).
      // Below it the tawny flank and thigh at the shade the near cards give them (× 0.38: at
      // × 0.6 the far thigh's flat side read as a pale slab).
      let k = mix(
        shade(col.coat, 0.38),
        shade(back, 0.5),
        smooth(-0.6, 0.15, n[2]) * smooth(H * 0.42, H * 0.66, p[2]),
      );
      // The cream underside, shaded as the near belly fringe reads (× 0.7 the far groin and inner
      // thighs, flat cells facing down and back, read as a pale slab behind the hip).
      k = mix(k, shade(belly, 0.5), smooth(-0.35, -0.8, n[2]) * smooth(H * 0.36, H * 0.5, p[2]));
      // The cream chest, half strength: full cream on the far mesh's flat brisket cells read as a
      // pale slab before the near shoulder.
      // Forward of the shoulder joint only: every front-facing cell took it before, the far
      // thigh tube's front face and the foreleg tube's top among them (pale slabs on hip and
      // shoulder, D482).
      const chest =
        smooth(0.3, 0.8, n[0]) *
        smooth(H * 0.42, H * 0.56, p[2]) *
        smooth(fx - 0.02, fx + 0.06, p[0]);
      k = mix(k, shade(belly, 0.68), chest * smooth(H * 0.92, H * 0.76, p[2]) * 0.5);
      // The breeches' back face, under the tail: the far mesh's flat cells there face the key
      // and read as a pale slab behind the hip; the long dark guard hair of the breeches instead.
      k = mix(
        k,
        shade(back, 0.4),
        smooth(-0.45, -0.85, n[0]) * smooth(H * 0.4, H * 0.55, p[2]) * 0.7,
      );
      // The legs take their tawny below the elbow and stifle only: from the body down, the far
      // leg tubes' flat tops in the leg colour read as pale slabs on hip and shoulder (D482).
      const leg = smooth(H * 0.46, H * 0.3, p[2]) * smooth(0.02, 0.05, Math.abs(p[1]));
      k = mix(k, shade(legs, 0.38), leg);
      // The brush: the saddle's grizzle over its paint (its own pale tawny on the far tube's
      // flat faces read as a pale slab behind the hip), the dark tip still showing through.
      const brush = mix(shade(back, 0.5), [c[0] * 0.7, c[1] * 0.7, c[2] * 0.7], 0.4);
      k = mix(k, brush, onTail(p));
      // A tenth of the sculpt's own tone stays (form shading).
      return mix(k, c, 0.1);
    };
  },
  coat: (info) => {
    const H = info.bones.height;
    const rump = info.bones.tailRoot[0];
    // The far fringe: dense on the mane and back, the brush all round. No shag down the flanks:
    // a 3 cm card hanging flat on the far flank read as a pale slab on hip and shoulder (D482).
    const far = (p: Vec3, n: Vec3): number =>
      Math.max(
        smooth(0.25, 0.7, n[2]) * smooth(H * 0.7, H * 0.82, p[2]),
        smooth(rump, rump - 0.08, p[0]) * smooth(H * 0.25, H * 0.4, p[2]),
      );
    return {
      density: 3300,
      length: (p) => 0.026 + 0.012 * smooth(H * 0.5, H * 0.8, p[2]),
      width: 0.0085,
      // Flanks, shoulders, haunches and the upper legs: the smooth painted skin between the
      // kind's guard-hair zones. Not the underside (the fringe hangs there) nor the cannons.
      where: (p, n) => smooth(H * 0.3, H * 0.44, p[2]) * smooth(-0.35, 0.05, n[2]),
      // Shadowed roots, lit tips: each card a lock standing in the coat.
      tone: [0.78, 1.3],
      // Guard hair in clumped locks over the same skin, pale-tipped (the agouti band).
      guard: { density: 520, length: 0.06, width: 0.013, tone: [0.74, 1.45] },
      // The far mesh keeps a fringe of locks down the mane, back and tail.
      far: { density: 420, length: 0.055, width: 0.03, where: far },
    };
  },
  // A velvet of short cards over the face, so it reads as fur and not as painted plastic.
  groom: (info, lod) =>
    faceFur(info, lod, { density: 9000, length: [0.016, 0.032], width: 0.0065 }),
  // Locks 3.2 cm across (2.5 body cells), 6× as long, along the coat's lie.
  locks: { size: 0.032, strength: 0.5, seed: 41 },
  // The sourced 0.29 m coated width: no lock past 0.148 m off the midline.
  box: { y: 0.148 },
  whiskers: { count: 12, length: 0.085, radius: 0.0011, colour: [0.82, 0.8, 0.74] },
  // The cards carry the wear: each painted from the skin under its root (a matted streak darkens
  // whole cards, a clump), mud-clotted short on the paws, the paler regrowth along the scars a
  // third as long as the coat round it. Matted cards stay full length: shortened, they stood as stubs.
  cardWear: { mud: 0.55, scar: 0.3 },
  // The right ear: the side the hero shows.
  nick: -1,
  // Pale guard-hair tips catching the light.
  sheen: [0.12, 0.11, 0.09],
};
