// connections: a part that hovers inside the 2 cm tolerance is not held, and a grown or socket
// part must reach the part it is declared to grow from or sit in.

import { describe, expect, it } from 'bun:test';
import {
  type BuildContext,
  compile,
  defineAsset,
  type Mesh,
  type PartOptions,
  type Vec3,
} from '../core/index.ts';
import { box, lathe, sd, sdf } from '../primitives/index.ts';
import { connectionReport } from './connections.ts';
import type { ConnectIssue } from './connections-declare.ts';
import { rimContact } from './connections-rim.ts';
import { assetShells } from './connections-shells.ts';

const grey: Vec3 = [0.5, 0.5, 0.5];
type Piece = readonly [string, Mesh, PartOptions?];

const issues = (kind: string, pieces: readonly Piece[]): readonly ConnectIssue[] =>
  connectionReport(
    compile(
      defineAsset({
        name: 'fixture',
        kind,
        budget: { triangles: [400000, 400000, 400000] },
        build: (ctx: BuildContext) => {
          for (const [name, mesh, o] of pieces) ctx.part(name, mesh, o);
        },
      }),
    ),
  ).issues;
const codes = (kind: string, pieces: readonly Piece[]): string[] =>
  issues(kind, pieces).map((i) => `${i.code}:${i.part}`);

const base: Piece = ['base', box({ size: [1, 1, 0.5], color: grey })];
const lampBox = (gap: number): Mesh =>
  box({ size: [0.3, 0.3, 0.3], at: [0, 0, 0.5 + gap], color: grey });
const lamp = (gap: number, o?: PartOptions): Piece =>
  o ? ['lamp', lampBox(gap), o] : ['lamp', lampBox(gap)];
const head: Piece = [
  'head',
  sdf({
    field: sd.sphere([0, 0, 0.3], 0.3),
    bounds: [
      [-0.35, -0.35, -0.05],
      [0.35, 0.35, 0.65],
    ],
    resolution: 0.02,
    color: grey,
  }),
];
const cone = (at: Vec3): Mesh =>
  lathe({
    profile: [
      [0.06, 0],
      [0, 0.25],
    ],
    segments: 24,
    caps: true,
    color: grey,
    at,
  });

describe('connections: hovering inside the tolerance', () => {
  it('fails a part hovering 1 cm and 1.9 cm over a face, saying it hovers and how far', () => {
    for (const gap of [0.01, 0.019]) {
      const found = issues('prop', [base, lamp(gap)]);
      expect(found.map((i) => `${i.code}:${i.part}`)).toEqual(['T3D_CONNECT_POINT:lamp']);
      expect(found[0]?.message).toContain(`hover ${(gap * 100).toFixed(1)} cm off 'base'`);
      expect(found[0]?.fix).toContain("onto 'base'");
    }
  });

  it('fails a rail hovering 1 cm over both of its posts: two hovers are not a span', () => {
    const post = (name: string, x: number): Piece => [
      name,
      box({ size: [0.1, 0.1, 0.5], at: [x, 0, 0], color: grey }),
    ];
    const rail = (gap: number): Piece => [
      'rail',
      box({ size: [1.1, 0.1, 0.05], at: [0, 0, 0.5 + gap], color: grey }),
    ];
    const posts = [post('post_a', -0.5), post('post_b', 0.5)];
    expect(codes('prop', [...posts, rail(0.01)])).toEqual(['T3D_CONNECT_POINT:rail']);
    expect(codes('prop', [...posts, rail(0)])).toEqual([]);
  });

  it('passes the same part seated on the face, and within its own contact tolerance', () => {
    expect(codes('prop', [base, lamp(0)])).toEqual([]);
    expect(codes('prop', [base, lamp(0.004)])).toEqual([]);
  });

  it('still calls a real corner contact a point contact, not a hover', () => {
    const corner: Piece = ['lamp', box({ size: [0.3, 0.3, 0.3], at: [0.65, 0, 0.5], color: grey })];
    expect(issues('prop', [base, corner])[0]?.message).toContain('hang on by a point');
  });
});

describe('connections: seated on a rim', () => {
  /** An open tube (no caps) standing on the base, `gap` above it; a cone roof on its top rim. */
  const tube = (gap: number): Piece => [
    'tank',
    lathe({
      profile: [
        [0.3, 0],
        [0.3, 0.5],
      ],
      segments: 24,
      caps: false,
      color: grey,
      at: [0, 0, 0.5 + gap],
    }),
  ];
  const roof: Piece = [
    'roof',
    lathe({
      profile: [
        [0.4, 0],
        [0, 0.3],
      ],
      segments: 24,
      caps: true,
      color: grey,
      at: [0, 0, 1],
    }),
  ];

  it('fails the same tube hovering 1 cm over the base: a rim that touches nothing holds nothing', () => {
    const found = issues('prop', [base, tube(0.01)]);
    expect(found.map((i) => `${i.code}:${i.part}`)).toEqual(['T3D_CONNECT_POINT:tank']);
    expect(found[0]?.message).toContain("hover 1.0 cm off 'base'");
  });

  it('holds an open tube standing on its rim, and a roof resting on the rim of the tube', () => {
    expect(codes('prop', [base, tube(0)])).toEqual([]);
    expect(codes('prop', [base, tube(0), roof])).toEqual([]);
  });

  it('measures the rim on the piece: a ring is one, a corner and a single edge are not', () => {
    const shells = assetShells(
      compile(
        defineAsset({
          name: 'rims',
          kind: 'prop',
          budget: { triangles: [9999, 9999, 9999] },
          build: (ctx: BuildContext) => {
            for (const [name, mesh] of [
              base,
              tube(0),
              ['edge', box({ size: [0.3, 0.3, 0.3], at: [0.65, 0, 0.5], color: grey })],
            ] as const)
              ctx.part(name, mesh);
          },
        }),
      ),
    );
    const of = (part: string) => shells.find((s) => s.part === part);
    const [b, t, e] = [of('base'), of('tank'), of('edge')];
    expect(b && t && rimContact(t, b, 0.003)).toBe(true);
    expect(b && e && rimContact(e, b, 0.005)).toBe(false);
  });
});

describe('connections: crossing contact', () => {
  /** A 3 m open tank wall standing across two joists: the joists' sparse samples miss the wall. */
  const joist = (name: string, y: number): Piece => [
    name,
    box({ size: [3.3, 0.1, 0.1], at: [0, y, 0], color: grey }),
  ];
  const wall = (gap: number): Piece => [
    'tank',
    lathe({
      profile: [
        [1.5, 0],
        [1.5, 2],
      ],
      segments: 48,
      caps: false,
      color: grey,
      at: [0, 0, 0.1 + gap],
    }),
  ];

  it('fails the tank hovering 1 cm over its joists', () => {
    const found = codes('prop', [joist('joist_a', 0.5), joist('joist_b', -0.5), wall(0.01)]);
    expect(found).toEqual(['T3D_CONNECT_POINT:tank']);
  });

  it('holds a tank wall standing across two joists, and calls one joist a point contact', () => {
    expect(codes('prop', [joist('joist_a', 0.5), joist('joist_b', -0.5), wall(0)])).toEqual([]);
    const lone = issues('prop', [joist('joist_a', 1.45), wall(0)]);
    expect(lone.map((i) => `${i.code}:${i.part}`)).toEqual(['T3D_CONNECT_POINT:tank']);
    expect(lone[0]?.message).toContain('hang on by a point');
  });
});

describe('connections: a grown or socket part needs its partner', () => {
  it('fails a horn declared grown from a head it stands 1 m away from', () => {
    const found = issues('creature', [
      head,
      ['horn', cone([1, 0, 0]), { connect: { as: 'grown', to: 'head' } }],
    ]);
    expect(found.map((i) => `${i.code}:${i.part}`)).toEqual(['T3D_CONNECT_ISLAND:horn']);
    expect(found[0]?.message).toContain("reaches 'head'");
  });

  it('fails a grown or socket part that touches another part than the one declared', () => {
    const pole: Piece = ['pole', box({ size: [0.1, 0.1, 1], at: [3, 0, 0], color: grey })];
    const grown = issues('prop', [
      base,
      pole,
      [
        'horn',
        box({ size: [0.1, 0.1, 0.3], at: [0, 0, 0.45], color: grey }),
        { connect: { as: 'grown', to: 'pole' } },
      ],
    ]);
    expect(grown.map((i) => `${i.code}:${i.part}`)).toEqual(['T3D_CONNECT_ISLAND:horn']);
    expect(grown[0]?.message).toContain("it touches 'base'");
    expect(codes('prop', [base, pole, lamp(0, { connect: { as: 'socket', to: 'pole' } })])).toEqual(
      ['T3D_CONNECT_SOCKET:lamp'],
    );
  });

  it('fails an eye (socket by its name) lying beside the head, and a connect.to naming itself', () => {
    const eye = sdf({
      field: sd.sphere([1, 0, 0.05], 0.05),
      bounds: [
        [0.9, -0.1, -0.05],
        [1.1, 0.1, 0.15],
      ],
      resolution: 0.01,
      color: grey,
    });
    expect(codes('creature', [head, ['eye_l', eye]])).toEqual(['T3D_CONNECT_SOCKET:eye_l']);
    const self = issues('prop', [base, lamp(0, { connect: { as: 'welded', to: 'lamp' } })]);
    expect(self.map((i) => `${i.code}:${i.part}`)).toEqual(['T3D_CONNECT_INVALID:lamp']);
    expect(self[0]?.message).toContain('the part itself');
  });

  it('passes a horn rooted in the head it declares, and a lone appendage with no other part', () => {
    const rooted = codes('creature', [
      head,
      ['horn', cone([0, 0, 0.55]), { connect: { as: 'grown', to: 'head' } }],
    ]);
    expect(rooted.filter((c) => /ISLAND|INVALID/.test(c))).toEqual([]);
    expect(codes('creature', [['horn', cone([0, 0, 0])]])).toEqual([]);
  });
});
