// Engine coordinate helpers: the crank axis (along X at y = 0), the two banks 45° either side of
// vertical (90° V), cylinder stations along each bank (right bank staggered back by the con-rod
// offset), and "bank space" → car space so heads, covers, ports and coils are authored once per
// bank: (x, h = distance up the bore axis from the crank, w = across the bank, + = outboard).

import type { Mesh, Vec3 } from '@developerz.ai/ts23d';
import { BANK, BORE_PITCH, X_CRANK_FRONT, Z_CRANK } from '../dims.ts';
import { add, inFrame, mul } from '../lib/geo.ts';

export interface Bank {
  /** +1 left (+Y), −1 right. */
  readonly s: 1 | -1;
  /** Up the bores. */
  readonly up: Vec3;
  /** Across the bank, outboard (and down). */
  readonly out: Vec3;
}

export const bank = (s: 1 | -1): Bank => ({
  s,
  up: [0, s * Math.sin(BANK), Math.cos(BANK)],
  out: [0, s * Math.cos(BANK), -Math.sin(BANK)],
});

export const BANKS: readonly Bank[] = [bank(1), bank(-1)];

/** Stagger of the right bank behind the left (shared crank pins). */
export const STAGGER = 0.024;
export const CYL0 = X_CRANK_FRONT - 0.085;

/** x of cylinder i (0 = front) on a bank. */
export const cylX = (b: Bank, i: number): number => CYL0 - i * BORE_PITCH - (b.s < 0 ? STAGGER : 0);

/** Bank space → car space. */
export const bp = (b: Bank, x: number, h: number, w: number): Vec3 =>
  add(add([x, 0, Z_CRANK], mul(b.up, h)), mul(b.out, w));

/** Place a mesh authored in bank space (X along the crank, Y = across (outboard), Z = up the bore). */
export const inBank = (b: Bank, m: Mesh, at: Vec3 = [0, 0, 0]): Mesh =>
  inFrame(m, [1, 0, 0], b.out, b.up, add([0, 0, Z_CRANK], at));

/** Head deck height above the crank along the bore axis, head and cover heights. */
export const H_DECK = 0.235;
export const H_HEAD = 0.13;
export const H_COVER = 0.055;
export const BLOCK_REAR = CYL0 - 4 * BORE_PITCH - STAGGER - 0.085;
