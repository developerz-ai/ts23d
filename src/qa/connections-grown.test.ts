import { describe, expect, it } from 'bun:test';
import {
  type Asset,
  type BuildContext,
  compile,
  defineAsset,
  type Mesh,
  type PartOptions,
  type Vec3,
} from '../core/index.ts';
import { box, cylinder, lathe, sd, sdf } from '../primitives/index.ts';
import { connectionReport } from './connections.ts';

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

describe('connections: grown appendages', () => {
  it('fails a horn set on the surface (glued), passes one sunk into the body', () => {
    expect(
      codes(
        asset('creature', [
          ['body', ball()],
          ['horn', horn(0)],
        ]),
      ),
    ).toContain('T3D_CONNECT_GLUED:horn');
    expect(
      codes(
        asset('creature', [
          ['body', ball()],
          ['horn', horn(0.04)],
        ]),
      ),
    ).not.toContain('T3D_CONNECT_GLUED:horn');
  });

  it('fails a straight horn root as a crease, passes a flared boss', () => {
    expect(
      codes(
        asset('creature', [
          ['body', ball()],
          ['horn', horn(0.04)],
        ]),
      ),
    ).toContain('T3D_CONNECT_CREASE:horn');
    // The base hugs the ball, then lifts off into the horn: a boss blending into the body.
    const flared = horn(0.02, [
      [0.16, -0.03],
      [0.11, 0],
      [0.08, 0.03],
      [0.065, 0.07],
      [0, 0.3],
    ]);
    expect(
      codes(
        asset('creature', [
          ['body', ball()],
          ['horn', flared],
        ]),
      ),
    ).not.toContain('T3D_CONNECT_CREASE:horn');
  });

  it('fails a peg that pokes out through the far side of its board', () => {
    const leg = box({ size: [0.2, 0.2, 0.5], color: grey });
    const board = box({ size: [1, 1, 0.05], at: [0, 0, 0.5], color: grey });
    const peg = cylinder({
      radius: 0.02,
      length: 0.3,
      segments: 16,
      at: [0.3, 0.3, 0.55],
      color: grey,
    });
    const parts: Piece[] = [
      ['leg', leg],
      ['board', board],
      ['peg', peg, { connect: { as: 'grown', to: 'board' } }],
    ];
    expect(codes(asset('prop', parts))).toContain('T3D_CONNECT_POKE:peg');
  });

  it('only defaults to grown on creature and character kinds', () => {
    expect(
      codes(
        asset('prop', [
          ['body', ball()],
          ['horn', horn(0)],
        ]),
      ),
    ).not.toContain('T3D_CONNECT_GLUED:horn');
  });
});

describe('connections: eyes', () => {
  const head = (): Mesh =>
    sdf({
      field: sd.sphere([0, 0, 0.12], 0.12),
      bounds: [
        [-0.15, -0.15, -0.03],
        [0.15, 0.15, 0.27],
      ],
      resolution: 0.008,
      color: [0.6, 0.45, 0.4],
    });
  /** An eyeball at `at`, its black pupil facing `look`. */
  const eye = (at: Vec3, look: Vec3): Mesh =>
    sdf({
      field: sd.sphere(at, 0.018),
      bounds: [
        [at[0] - 0.025, at[1] - 0.025, at[2] - 0.025],
        [at[0] + 0.025, at[1] + 0.025, at[2] + 0.025],
      ],
      resolution: 0.002,
      color: (_p, n) =>
        n[0] * look[0] + n[1] * look[1] + n[2] * look[2] > 0.92 ? [0, 0, 0] : [0.85, 0.85, 0.8],
    });
  const front = (y: number, depth: number): Vec3 => {
    const r = 0.12 + 0.018 - depth;
    const x = Math.sqrt(Math.max(0, r * r - y * y - 0.0004));
    return [x, y, 0.14];
  };

  it('fails an eyeball sitting on the face, passes one in its socket', () => {
    const out = asset('character', [
      ['head', head()],
      ['eye_l', eye(front(0.04, 0.012), [1, 0, 0])],
    ]);
    expect(codes(out)).toContain('T3D_CONNECT_EYE_EXPOSED:eye_l');
    const sunk = asset('character', [
      ['head', head()],
      ['eye_l', eye(front(0.04, 0.03), [1, 0, 0])],
    ]);
    expect(codes(sunk)).not.toContain('T3D_CONNECT_EYE_EXPOSED:eye_l');
  });

  it('fails a pair that looks different ways, passes a mirrored pair', () => {
    const pair = (l: Vec3, r: Vec3): Asset =>
      asset('character', [
        ['head', head()],
        ['eye_l', eye(front(0.04, 0.03), l)],
        ['eye_r', eye(front(-0.04, 0.03), r)],
      ]);
    expect(codes(pair([1, 0, 0], [1, 0, 0]))).not.toContain('T3D_CONNECT_EYE_GAZE:eye_l');
    expect(codes(pair([0.94, 0.34, 0], [1, 0, 0]))).toContain('T3D_CONNECT_EYE_GAZE:eye_l');
  });
});
