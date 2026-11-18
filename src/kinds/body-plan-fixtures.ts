// Three body plans the creature kind cannot describe, for tests and motion work: a shark, a radial
// octopus and a five-necked hydra. Each rests its lowest tips on z = 0, so the ground gates hold
// without a water medium. Shapes only; not sourced from a real animal's measurements.

import type { Vec3 } from '../core/index.ts';
import type { BodyPlanSpec, ChainSpec } from './body-plan-types.ts';

const Z = 0.62;

export const SHARK: BodyPlanSpec = {
  name: 'plan_shark',
  length: 3,
  chains: [
    {
      name: 'spine',
      path: [
        [1.5, 0, Z - 0.02],
        [1.28, 0, Z + 0.02],
        [0.8, 0, Z + 0.03],
        [0.15, 0, Z + 0.02],
        [-0.55, 0, Z + 0.02],
        [-1.05, 0, Z + 0.05],
        [-1.32, 0, Z + 0.08],
      ],
      radius: [0.012, 0.13, 0.28, 0.33, 0.22, 0.09, 0.055],
      links: 10,
      bias: 1.25,
      flatten: 1.08,
    },
    {
      name: 'caudal_upper',
      parent: { chain: 'spine', link: 9 },
      path: [
        [-1.28, 0, Z + 0.09],
        [-1.45, 0, Z + 0.26],
        [-1.62, 0, Z + 0.47],
        [-1.8, 0, Z + 0.68],
      ],
      radius: [0.012, 0.012, 0.007, 0.0015],
      flatten: 10,
      links: 3,
    },
    {
      name: 'caudal_lower',
      parent: { chain: 'spine', link: 9 },
      path: [
        [-1.28, 0, Z + 0.05],
        [-1.42, 0, Z - 0.1],
        [-1.56, 0, Z - 0.27],
      ],
      radius: [0.011, 0.01, 0.0015],
      flatten: 9,
      links: 2,
    },
    {
      name: 'dorsal',
      parent: { chain: 'spine', link: 3 },
      path: [
        [0.2, 0, Z + 0.3],
        [0.06, 0, Z + 0.5],
        [-0.12, 0, Z + 0.72],
      ],
      radius: [0.022, 0.016, 0.002],
      flatten: 9,
      links: 2,
    },
    {
      name: 'pectoral',
      parent: { chain: 'spine', link: 2 },
      repeat: { kind: 'mirror' },
      path: [
        [0.72, 0.22, Z - 0.16],
        [0.5, 0.55, Z - 0.36],
        [0.26, 0.86, Z - 0.6],
      ],
      radius: [0.2, 0.15, 0.02],
      flatten: 0.1,
      links: 2,
    },
  ],
};

export const OCTOPUS: BodyPlanSpec = {
  name: 'plan_octopus',
  length: 1,
  chains: [
    {
      name: 'mantle',
      path: [
        [-0.34, 0, 1.2],
        [-0.26, 0, 1.08],
        [-0.08, 0, 0.82],
        [0, 0, 0.56],
        [0, 0, 0.36],
      ],
      radius: [0.07, 0.23, 0.33, 0.25, 0.2],
      links: 4,
    },
    {
      name: 'arm',
      parent: { chain: 'mantle', link: 3 },
      repeat: { kind: 'radial', count: 8, axis: [0, 0, 1], about: [0, 0, 0], start: Math.PI / 8 },
      path: [
        [0.12, 0, 0.36],
        [0.42, 0, 0.2],
        [0.8, 0, 0.08],
        [1.15, 0, 0.05],
        [1.42, 0, 0.14],
        [1.55, 0, 0.32],
      ],
      radius: [0.1, 0.085, 0.06, 0.04, 0.022, 0.003],
      links: 7,
      bias: 1.2,
    },
  ],
};

const NECKS = 5;

/** A neck rising from the shoulders in a shallow S, fanned out by its place in the row. */
function hydraNeck(k: number): ChainSpec[] {
  const f = k / (NECKS - 1) - 0.5;
  const base = f * 0.34;
  const spread = f * 1.5;
  const height = 1.95 - Math.abs(f) * 0.55;
  const neck = `neck_${k}`;
  const at = (t: number): Vec3 => [
    0.36 + 0.64 * t + 0.09 * Math.sin(t * Math.PI * 2),
    base + (spread - base) * t ** 1.2,
    0.78 + (height - 0.78) * t,
  ];
  const top = at(1);
  // Each head looks along its own neck's fan.
  const ahead = (d: number, drop: number): Vec3 => [
    top[0] + d,
    top[1] + d * f * 0.9,
    top[2] + drop,
  ];
  return [
    {
      name: neck,
      parent: { chain: 'body', link: 0 },
      path: [0, 0.25, 0.5, 0.75, 1].map(at),
      radius: [0.15, 0.115, 0.095, 0.08, 0.07],
      links: 5,
    },
    {
      name: `head_${k}`,
      parent: { chain: neck, link: 4 },
      path: [top, ahead(0.16, 0.01), ahead(0.42, -0.06)],
      radius: [0.075, 0.09, 0.016],
      flatten: 0.75,
      links: 2,
    },
  ];
}

const hydraLeg = (name: string, x: number, link: number): ChainSpec => ({
  name,
  parent: { chain: 'body', link },
  repeat: { kind: 'mirror' },
  path: [
    [x, 0.17, 0.62],
    [x + 0.03, 0.38, 0.36],
    [x + 0.02, 0.45, 0.18],
    [x + 0.07, 0.46, 0.03],
  ],
  radius: [0.15, 0.12, 0.085, 0.05],
  links: 3,
});

export const HYDRA: BodyPlanSpec = {
  name: 'plan_hydra',
  length: 2.8,
  chains: [
    {
      name: 'body',
      path: [
        [0.74, 0, 0.72],
        [0.3, 0, 0.74],
        [-0.3, 0, 0.72],
        [-0.8, 0, 0.62],
      ],
      radius: [0.12, 0.42, 0.44, 0.27],
      links: 5,
      flatten: 0.92,
    },
    {
      name: 'tail',
      parent: { chain: 'body', link: 4 },
      path: [
        [-0.72, 0, 0.62],
        [-1.2, 0.05, 0.42],
        [-1.65, -0.05, 0.26],
        [-2.1, 0, 0.12],
      ],
      radius: [0.22, 0.14, 0.075, 0.012],
      links: 5,
      bias: 1.2,
    },
    hydraLeg('fore', 0.32, 1),
    hydraLeg('hind', -0.46, 3),
    ...Array.from({ length: NECKS }, (_, k) => hydraNeck(k)).flat(),
  ],
};
