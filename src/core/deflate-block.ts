// One deflate block (RFC 1951) from a run of LZ77 tokens: counts the exact size as a stored, a
// fixed-Huffman and a dynamic-Huffman block and writes the smallest.

import type { BitWriter } from './deflate-bits.ts';
import { canonicalCodes, codeLengths } from './deflate-huffman.ts';

const LEN_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
  163, 195, 227, 258,
];
const LEN_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
  3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DIST_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];
const ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
const END = 256;
const STORED_MAX = 65535;

/** Match length 3..258 → its length code, counted from 0 (symbol 257 is code 0). */
const LEN_CODE = new Uint8Array(259);
LEN_BASE.forEach((base, code) => {
  LEN_CODE.fill(code, base, Math.min(259, base + (1 << (LEN_EXTRA[code] ?? 0))));
});
/** Distance → its code: [distance - 1] below 256, [256 + ((distance - 1) >> 7)] from there. */
const DIST_CODE = new Uint8Array(512);
DIST_BASE.forEach((base, code) => {
  const end = base - 1 + (1 << (DIST_EXTRA[code] ?? 0));
  for (let d = base - 1; d < end; d++) DIST_CODE[d < 256 ? d : 256 + (d >> 7)] = code;
});

const FIXED_LIT = new Uint8Array(288).fill(8, 0, 144).fill(9, 144, 256).fill(7, 256, 280);
FIXED_LIT.fill(8, 280);
const FIXED_DIST = new Uint8Array(30).fill(5);

/** Tokens of one block. `dist[k] === 0`: `lit[k]` is a literal byte; else a length and distance. */
export interface Tokens {
  readonly lit: Uint16Array;
  readonly dist: Uint16Array;
  /** How often each literal/length symbol (0..285) and distance code (0..29) occurs. */
  readonly litFreq: Uint32Array;
  readonly distFreq: Uint32Array;
}

export const lengthSymbol = (length: number): number => 257 + (LEN_CODE[length] ?? 0);
export const distanceCode = (distance: number): number =>
  DIST_CODE[distance <= 256 ? distance - 1 : 256 + ((distance - 1) >> 7)] ?? 0;

export function createTokens(capacity: number): Tokens {
  return {
    lit: new Uint16Array(capacity),
    dist: new Uint16Array(capacity),
    litFreq: new Uint32Array(286),
    distFreq: new Uint32Array(30),
  };
}

/** Bits the tokens take under these code lengths, end-of-block symbol and extra bits included. */
function bodyBits(t: Tokens, lit: Uint8Array, dist: Uint8Array): number {
  let bits = 0;
  for (let s = 0; s < 286; s++)
    bits += (t.litFreq[s] ?? 0) * ((lit[s] ?? 0) + (s > 256 ? (LEN_EXTRA[s - 257] ?? 0) : 0));
  for (let s = 0; s < 30; s++)
    bits += (t.distFreq[s] ?? 0) * ((dist[s] ?? 0) + (DIST_EXTRA[s] ?? 0));
  return bits;
}

/** The dynamic block's header: both length tables run-length coded with symbols 16, 17, 18. */
function dynamicHeader(lit: Uint8Array, dist: Uint8Array) {
  let litCount = 286;
  while (litCount > 257 && lit[litCount - 1] === 0) litCount--;
  let distCount = 30;
  while (distCount > 1 && dist[distCount - 1] === 0) distCount--;
  const all = [...lit.subarray(0, litCount), ...dist.subarray(0, distCount)];
  const symbols: number[] = [];
  const extras: number[] = [];
  const freq = new Uint32Array(19);
  const put = (symbol: number, extra: number): void => {
    symbols.push(symbol);
    extras.push(extra);
    freq[symbol] = (freq[symbol] ?? 0) + 1;
  };
  for (let i = 0; i < all.length; ) {
    const len = all[i] ?? 0;
    let run = 1;
    while (i + run < all.length && all[i + run] === len) run++;
    i += run;
    if (len !== 0) {
      put(len, 0);
      run--;
    }
    while (run >= 3) {
      const take = Math.min(run, len === 0 ? 138 : 6);
      if (len !== 0) put(16, take - 3);
      else if (take <= 10) put(17, take - 3);
      else put(18, take - 11);
      run -= take;
    }
    for (; run > 0; run--) put(len, 0);
  }
  const lengths = codeLengths(freq, 7);
  let sent = 19;
  while (sent > 4 && lengths[ORDER[sent - 1] ?? 0] === 0) sent--;
  let bits = 17 + 3 * sent;
  for (let s = 0; s < 19; s++) bits += (freq[s] ?? 0) * (lengths[s] ?? 0);
  bits += 2 * (freq[16] ?? 0) + 3 * (freq[17] ?? 0) + 7 * (freq[18] ?? 0);
  return { litCount, distCount, symbols, extras, lengths, sent, bits };
}

function writeTokens(w: BitWriter, t: Tokens, count: number, lit: Uint8Array, dist: Uint8Array) {
  const litCodes = canonicalCodes(lit);
  const distCodes = canonicalCodes(dist);
  for (let k = 0; k < count; k++) {
    const value = t.lit[k] ?? 0;
    const distance = t.dist[k] ?? 0;
    if (distance === 0) {
      w.bits(litCodes[value] ?? 0, lit[value] ?? 0);
      continue;
    }
    const lenCode = LEN_CODE[value] ?? 0;
    w.bits(litCodes[257 + lenCode] ?? 0, lit[257 + lenCode] ?? 0);
    w.bits(value - (LEN_BASE[lenCode] ?? 0), LEN_EXTRA[lenCode] ?? 0);
    const code = distanceCode(distance);
    w.bits(distCodes[code] ?? 0, dist[code] ?? 0);
    w.bits(distance - (DIST_BASE[code] ?? 0), DIST_EXTRA[code] ?? 0);
  }
  w.bits(litCodes[END] ?? 0, lit[END] ?? 0);
}

/**
 * Writes `count` tokens, which decode to exactly `raw`, as the smallest of the three block types
 * (a tie goes to stored, then fixed) and clears the frequencies for the next block.
 */
export function writeBlock(
  w: BitWriter,
  t: Tokens,
  count: number,
  raw: Uint8Array,
  final: boolean,
): void {
  t.litFreq[END] = 1;
  const lit = codeLengths(t.litFreq, 15);
  const dist = codeLengths(t.distFreq, 15);
  const header = dynamicHeader(lit, dist);
  const dynamicBits = header.bits + bodyBits(t, lit, dist);
  const fixedBits = 3 + bodyBits(t, FIXED_LIT, FIXED_DIST);
  const chunks = Math.max(1, Math.ceil(raw.length / STORED_MAX));
  const storedBits = chunks * 40 + raw.length * 8;
  w.reserve((Math.max(storedBits, Math.min(fixedBits, dynamicBits)) >> 3) + 8);
  const last = final ? 1 : 0;
  if (storedBits <= fixedBits && storedBits <= dynamicBits) {
    for (let c = 0; c < chunks; c++) {
      const part = raw.subarray(c * STORED_MAX, (c + 1) * STORED_MAX);
      w.bits(c === chunks - 1 ? last : 0, 3);
      w.align();
      w.bits(part.length, 16);
      w.bits(part.length ^ 0xffff, 16);
      w.bytes(part);
    }
  } else if (fixedBits <= dynamicBits) {
    w.bits(last | 2, 3);
    writeTokens(w, t, count, FIXED_LIT, FIXED_DIST);
  } else {
    w.bits(last | 4, 3);
    w.bits(header.litCount - 257, 5);
    w.bits(header.distCount - 1, 5);
    w.bits(header.sent - 4, 4);
    for (let k = 0; k < header.sent; k++) w.bits(header.lengths[ORDER[k] ?? 0] ?? 0, 3);
    const codes = canonicalCodes(header.lengths);
    header.symbols.forEach((symbol, k) => {
      w.bits(codes[symbol] ?? 0, header.lengths[symbol] ?? 0);
      if (symbol >= 16) w.bits(header.extras[k] ?? 0, symbol === 16 ? 2 : symbol === 17 ? 3 : 7);
    });
    writeTokens(w, t, count, lit, dist);
  }
  t.litFreq.fill(0);
  t.distFreq.fill(0);
}
