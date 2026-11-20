// floating-parts and connections: an edge that passes through another part's triangle is contact
// however long the edge and however large the triangle (no step can jump the skin), and an edge
// that stops short of it is not.

import { describe, expect, it } from 'bun:test';
import {
  type CompiledAsset,
  compile,
  defineAsset,
  dmath,
  type Mesh,
  type Vec3,
} from '../core/index.ts';
import { beam, planar } from '../primitives/index.ts';
import { connectionReport } from './connections.ts';
import { edgeContact } from './connections-crossing.ts';
import { assetShells } from './connections-shells.ts';
import { floatingParts } from './floating.ts';

const grey: Vec3 = [0.5, 0.5, 0.5];
type Piece = readonly [string, Mesh];

const built = (pieces: readonly Piece[]): CompiledAsset =>
  compile(
    defineAsset({
      name: 'fixture',
      kind: 'prop',
      budget: { triangles: [9999, 9999, 9999] },
      build(ctx) {
        for (const [name, mesh] of pieces) ctx.part(name, mesh);
      },
    }),
  );
const floating = (pieces: readonly Piece[]) => floatingParts(built(pieces));
const issues = (pieces: readonly Piece[]) => connectionReport(built(pieces)).issues;
const codes = (pieces: readonly Piece[]): string[] =>
  issues(pieces).map((i) => `${i.code}:${i.part}`);
/** Where the edges of `a` come nearest `b` (the gate's own search, 5 mm contact, 2 cm reach). */
function contact(pieces: readonly Piece[], a: string, b: string) {
  const shells = assetShells(built(pieces));
  const [sa, sb] = [shells.find((s) => s.part === a), shells.find((s) => s.part === b)];
  return sa && sb ? edgeContact(sa, sb, 0.005, 0.02) : undefined;
}

/** An open, one-sided 8 m sheet of two triangles leaning 45° (the plane z = x + 4 + `dx`), its
 *  lower edge on the ground: its box is 8 m deep, so nothing clips an edge down to the skin. */
const sheet = (name: string, dx = 0): Piece => [
  name,
  planar({
    points: [
      [-4 - dx, -4, 0],
      [-4 - dx, 4, 0],
      [4 - dx, 4, 8],
      [4 - dx, -4, 8],
    ],
    color: grey,
  }),
];
const N = Math.SQRT1_2;
/** A point of the sheet clear of its corners, sides, diagonal and centroids. */
const C: Vec3 = [0.3, 1.5, 4.3];
/** A 2 cm square rod along the sheet's normal from 3.1 m above it to `to` m past it (negative:
 *  it stops that far short, its end face parallel to the sheet). */
const rod = (to: number): Piece => [
  'rod',
  beam({
    from: [C[0] - 3.1 * N, C[1], C[2] + 3.1 * N],
    to: [C[0] + to * N, C[1], C[2] - to * N],
    width: 0.02,
    color: grey,
  }),
];

describe('a rod and an open sheet', () => {
  it('floats a rod that stops 3 cm short of the sheet, with the true gap', () => {
    const [f, ...rest] = floating([sheet('sheet'), rod(-0.03)]);
    expect(rest).toEqual([]);
    expect(f?.part).toBe('rod');
    expect(f?.nearest).toBe('sheet');
    expect(f?.gap ?? 0).toBeCloseTo(0.03, 3);
  });

  it('fails connections on a rod that stops 1 cm short: it hovers, it does not touch', () => {
    const found = issues([sheet('sheet'), rod(-0.01)]);
    expect(found.map((i) => `${i.code}:${i.part}`)).toEqual(['T3D_CONNECT_POINT:rod']);
    expect(found[0]?.message).toContain("hover 1.0 cm off 'sheet'");
    const near = contact([sheet('sheet'), rod(-0.01)], 'rod', 'sheet');
    expect(near?.gap ?? 0).toBeCloseTo(0.01, 4);
  });

  it('holds a rod passing straight through the middle of the sheet (floating-parts)', () => {
    expect(floating([sheet('sheet'), rod(3.7)])).toEqual([]);
  });

  it('finds where the rod goes through the sheet (connections)', () => {
    const pieces = [sheet('sheet'), rod(3.7)];
    const hit = contact(pieces, 'rod', 'sheet');
    expect(hit?.gap).toBe(0);
    expect(dmath.norm((hit?.at ?? [9, 9, 9]).map((v, k) => v - (C[k] ?? 0)))).toBeLessThan(0.03);
    // The sheet's own edges (its four sides and one diagonal) pass nowhere near the rod.
    expect(contact(pieces, 'sheet', 'rod')).toBeNull();
  });

  it('calls a rod through one sheet a point contact, not a hover, and holds it through two', () => {
    const one = issues([sheet('sheet'), rod(3.7)]);
    expect(one.map((i) => `${i.code}:${i.part}`)).toEqual(['T3D_CONNECT_POINT:rod']);
    expect(one[0]?.message).toContain('hang on by a point');
    // Two sheets 4.9 m apart along the 6.8 m rod: the two crossings span it.
    expect(codes([sheet('sheet_a', 3.5), sheet('sheet_b', -3.5), rod(3.7)])).toEqual([]);
  });
});

describe('two long oblique beams crossing mid-span', () => {
  const post = (name: string, from: Vec3, to: Vec3): Piece => [
    name,
    beam({ from, to, width: 0.02, color: grey }),
  ];
  const a = post('brace_a', [-5, -5, 0], [6.5, 6.5, 11.5]);
  const b = post('brace_b', [-2, -14, 0], [8.5, -3.5, 10.5]);
  /** A 2 cm tie 17 m long: crosses `brace_a` at [0, 0, 5] and `brace_b` at [6, −6, 8], `lift`
   *  metres higher. Their boxes overlap over metres, so no clipping brings an edge to the skin. */
  const tie = (lift: number): Piece =>
    post('tie', [-3.25, 3.25, 3.375 + lift], [7.5, -7.5, 8.75 + lift]);

  it('floats a tie that passes 7 cm above both braces', () => {
    expect(floating([a, b, tie(0.07)]).map((f) => f.part)).toEqual(['tie']);
    expect(contact([a, tie(0.07)], 'tie', 'brace_a')).toBeNull();
  });

  it('holds a tie that runs through both braces', () => {
    expect(floating([a, b, tie(0)])).toEqual([]);
    expect(floating([a, tie(0)])).toEqual([]);
    expect(floating([b, tie(0)])).toEqual([]);
    expect(codes([a, b, tie(0)])).toEqual([]);
    // The first edge found within the 5 mm tolerance ends the search: it may graze, not pierce.
    expect(contact([a, tie(0)], 'tie', 'brace_a')?.gap).toBeLessThan(0.005);
    expect(contact([b, tie(0)], 'tie', 'brace_b')?.gap).toBeLessThan(0.005);
  });
});
