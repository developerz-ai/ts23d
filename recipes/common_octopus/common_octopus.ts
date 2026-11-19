// Common octopus (Octopus vulgaris), large adult female settled over the seabed: 1.2 m total length,
// 0.25 m mantle, 0.90 m arms (README.md: sources, and which numbers are design values). A radial body
// plan: mantle, head, funnel and eight separately posed arms, each a 16-bone chain, with the web,
// double sucker rows, papillae and slit-pupil eyes bound to those bones.

import {
  bodyPlan,
  type Check,
  defineBodyPlan,
  octopusClips,
  type Vec3,
} from '@developerz.ai/ts23d';
import {
  ARM_IDS,
  DORSAL_ARM,
  OCTOPUS_SPEC,
  REAL,
  REGEN_ARM,
  REGEN_LENGTH,
  RIB_NAMES,
} from './anatomy.ts';
import { octopusDetail } from './detail.ts';

export const OCTOPUS_PLAN = bodyPlan(OCTOPUS_SPEC);

/** Scale keys need a coordinate axis, and the mantle axis is 34 degrees off Z: Z is the nearest, an
 *  approximation. Measured at full contraction: 7.1 % across Y, 4.4 % across the tilted width,
 *  0.5 cm of slide along the mantle axis. */
const PULSE_AXIS: Vec3 = [0, 0, 1];

/** Breathing, not jetting: depth and rate are design values (README). The skin shares its weight
 *  with the mantle bones, so the surface moves about half of these numbers. */
export const MANTLE_BREATH = {
  seconds: 3.2,
  contract: -0.18,
  inflate: 0.1,
  timing: { inflate: 0.3, contract: 0.25, coast: 0.05 },
} as const;

/** A chain's arc length must match its sourced number, at every LOD (bones do not change). */
function arcCheck(label: string, ids: readonly string[], want: number): Check {
  return (asset) => {
    const sk = asset.skeleton?.bones ?? [];
    return ids.flatMap((id) => {
      const got = sk
        .filter((b) => b.name.startsWith(`${id}_`) && /_\d+$/.test(b.name.slice(id.length)))
        .reduce(
          (t, b) =>
            t + Math.hypot(b.tail[0] - b.head[0], b.tail[1] - b.head[1], b.tail[2] - b.head[2]),
          0,
        );
      return Math.abs(got - want) / want <= 0.02
        ? []
        : [
            {
              message: `${label} '${id}' is ${got.toFixed(3)} m along its bones, spec ${want} m`,
              fix: 'rebuild the chain from the sourced length (anatomy.ts), never edit the spec',
            },
          ];
    });
  };
}

const dorsal = (k: number): boolean => k === 0 || k === ARM_IDS.length - 1;

export const common_octopus = defineBodyPlan({
  name: 'common_octopus',
  description:
    'Common octopus (Octopus vulgaris), large adult female at true scale: wet, warty mottled mantle, slit-pupil eyes, funnel, deep web, eight individually posed tapering arms with double sucker rows, papillae and skin folds, pale translucent tips; healed scars and one arm regrowing its lost tip.',
  tags: ['creature', 'animal', 'marine', 'cephalopod', 'octopus', 'body-plan'],
  sources: [
    'https://www.fao.org/4/ac479e/ac479e34.pdf',
    'https://en.wikipedia.org/wiki/Common_octopus',
    'https://ns-zooplankton.linnaeus.naturalis.nl/linnaeus_ng/app/views/species/taxon.php?id=132450',
    'https://commons.wikimedia.org/wiki/Category:Octopus_vulgaris',
  ],
  medium: 'water',
  // The box of this settled pose (a design value); the sourced lengths are held by `checks`,
  // along the bones, because `measures` only reads straight extents.
  real: { length: 1.43, width: 1.28, height: 0.46 },
  plan: OCTOPUS_PLAN,
  colours: { back: '#8f5238', belly: '#d9a593', line: -0.2, soft: 0.3 },
  // Wet skin: the satin built-in strip (roughness 0.35, neutral albedo) under the vertex colour.
  strip: 'plastic',
  paint: { skin: [1, 1, 1] },
  // LOD2 ~3 k: enough rings that the mantle stays round and the curled tips stay curves far away.
  budget: { triangles: [160000, 18000, 3700] },
  creases: [
    {
      name: 'arm_crown_rear',
      part: 'body',
      at: [-0.045, 0, 0.145],
      radius: 0.085,
      why: 'small pinches on the head where the funnel base and the rear arm fillets gather under the mantle opening',
    },
  ],
  checks: [
    arcCheck(
      'arm',
      ARM_IDS.filter((_, k) => !dorsal(k) && k !== REGEN_ARM),
      REAL.arm,
    ),
    // The regrowing arm holds its own design length (README), not the sourced one.
    arcCheck('regenerating arm', [`arm_${REGEN_ARM}`], REGEN_LENGTH),
    arcCheck(
      'dorsal arm',
      ARM_IDS.filter((_, k) => dorsal(k)),
      DORSAL_ARM,
    ),
    arcCheck('mantle', ['mantle'], REAL.mantle),
  ],
  clips: octopusClips(OCTOPUS_PLAN, {
    arms: ARM_IDS,
    seed: 1797,
    mantle: {
      bones: RIB_NAMES.map((r) => `${r}_0`),
      skeleton: OCTOPUS_PLAN.bones,
      axis: PULSE_AXIS,
    },
    pulse: MANTLE_BREATH,
  }),
  detail: (ctx, _plan, kit) => octopusDetail(ctx, kit),
});
