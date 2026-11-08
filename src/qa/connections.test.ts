import { describe, expect, it } from 'bun:test';
import {
  type Asset,
  type BuildContext,
  compile,
  defineAsset,
  type Mesh,
  merge,
  type PartOptions,
  Ts23dError,
  type Vec3,
} from '../core/index.ts';
import { box, lathe, sd, sdf } from '../primitives/index.ts';
import { connectionFindings, connectionReport, connections } from './connections.ts';
import { connectionsOverlay } from './connections-overlay.ts';
import { DEFAULT_GATES } from './gates.ts';

const grey: Vec3 = [0.5, 0.5, 0.5];
type Piece = readonly [string, Mesh, PartOptions?];

const asset = (kind: string, pieces: readonly Piece[], extra: Partial<Asset> = {}): Asset =>
  defineAsset({
    name: 'fixture',
    kind,
    budget: { triangles: [400000, 400000, 400000] },
    build: (ctx: BuildContext) => {
      for (const [name, mesh, o] of pieces) ctx.part(name, mesh, o);
    },
    ...extra,
  });

const codes = (a: Asset): string[] =>
  connectionReport(compile(a)).issues.map((i) => `${i.code}:${i.part}`);

/** A 0.3 m ball standing on the ground (closed sdf mesh). */
const ball = (): Mesh =>
  sdf({
    field: sd.sphere([0, 0, 0.3], 0.3),
    bounds: [
      [-0.35, -0.35, -0.05],
      [0.35, 0.35, 0.65],
    ],
    resolution: 0.02,
    color: grey,
  });
/** A horn: a cone 25 cm tall, `base` radius, its base `sink` below z = 0.6 (the ball's top). */
const horn = (sink: number, profile?: readonly (readonly [number, number])[]): Mesh =>
  lathe({
    profile: (
      profile ?? [
        [0.06, 0],
        [0.0, 0.25],
      ]
    ).map(([r, z]) => [r, z - sink] as [number, number]),
    segments: 24,
    caps: true,
    color: grey,
    at: [0, 0, 0.6],
  });

describe('connections: islands and point contacts', () => {
  it('fails a loose shell hidden inside a merged mesh (island)', () => {
    const hull = merge([
      box({ size: [1, 1, 0.5], color: grey }),
      box({ size: [0.1, 0.1, 0.1], at: [0, 0, 0.7], color: grey }),
    ]);
    expect(codes(asset('prop', [['hull', hull]]))).toContain('T3D_CONNECT_ISLAND:hull');
  });

  it('fails a beam that meets a wall only at a corner, passes one seated on its top', () => {
    const wall = box({ size: [0.2, 2, 2], color: grey });
    const corner = box({ size: [0.5, 0.2, 0.2], at: [0.35, 1.1, 2], color: grey });
    expect(
      codes(
        asset('prop', [
          ['wall', wall],
          ['beam', corner],
        ]),
      ),
    ).toContain('T3D_CONNECT_POINT:beam');
    const seated = box({ size: [0.2, 0.5, 0.2], at: [0, 0.5, 2], color: grey });
    expect(
      codes(
        asset('prop', [
          ['wall', wall],
          ['beam', seated],
        ]),
      ),
    ).toEqual([]);
  });

  it('fails a ball balanced on a deck unless declared rest', () => {
    const deck = box({ size: [2, 2, 0.5], at: [0, 0, 0], color: grey });
    const onDeck = sdf({
      field: sd.sphere([0, 0, 0.8], 0.3),
      bounds: [
        [-0.35, -0.35, 0.45],
        [0.35, 0.35, 1.15],
      ],
      resolution: 0.02,
      color: grey,
    });
    expect(
      codes(
        asset('prop', [
          ['deck', deck],
          ['globe', onDeck],
        ]),
      ),
    ).toContain('T3D_CONNECT_POINT:globe');
    expect(
      codes(
        asset('prop', [
          ['deck', deck],
          ['globe', onDeck, { connect: { as: 'rest' } }],
        ]),
      ),
    ).toEqual([]);
  });
});

describe('connections: declarations, gate and overlay', () => {
  it('throws on a free part without a why, and reports an unknown connect.to', () => {
    const loose = asset('prop', [
      ['crate', box({ size: [1, 1, 1], color: grey }), { connect: { as: 'free' } }],
    ]);
    expect(() => compile(loose)).toThrow(Ts23dError);
    const typo = asset('prop', [
      ['crate', box({ size: [1, 1, 1], color: grey }), { connect: { as: 'welded', to: 'nope' } }],
    ]);
    expect(codes(typo)).toContain('T3D_CONNECT_INVALID:crate');
  });

  it('prefixes connect.to through ctx.use', () => {
    const child = asset('prop', [
      ['base', box({ size: [1, 1, 1], color: grey })],
      [
        'lid',
        box({ size: [1, 1, 0.1], at: [0, 0, 1], color: grey }),
        { connect: { as: 'bolted', to: 'base' } },
      ],
    ]);
    const parent = defineAsset({
      name: 'yard',
      kind: 'prop',
      budget: { triangles: [999, 999, 999] },
      build: (ctx) => ctx.use(child, { prefix: 'crate_0' }),
    });
    expect(compile(parent).parts.find((p) => p.name === 'crate_0_lid')?.connect?.to).toBe(
      'crate_0_base',
    );
  });

  it('is a default gate, runs at LOD0 only, and prefixes findings with their code', () => {
    expect(DEFAULT_GATES).toContain(connections);
    const hull = merge([
      box({ size: [1, 1, 0.5], color: grey }),
      box({ size: [0.1, 0.1, 0.1], at: [0, 0, 0.7], color: grey }),
    ]);
    const a = asset('prop', [['hull', hull]]);
    expect(connections(compile(a)).map((f) => f.message.split(':')[0])).toEqual([
      'T3D_CONNECT_ISLAND',
    ]);
    expect(connections(compile(a, { lod: 1 }))).toEqual([]);
    expect(connectionFindings({ issues: [], ok: [] })).toEqual([]);
  });

  it('draws an overlay PNG', () => {
    const png = connectionsOverlay(
      compile(
        asset('creature', [
          ['body', ball()],
          ['horn', horn(0)],
        ]),
      ),
      { size: 256 },
    );
    expect([...png.subarray(1, 4)].map((c) => String.fromCharCode(c)).join('')).toBe('PNG');
  });
});
