// zlib stream encoder (RFC 1950 wrapper around RFC 1951 deflate) in plain TypeScript: LZ77 with a
// hash-chain matcher and one step of lazy matching, then Huffman-coded blocks. The repo owns it
// because `node:zlib` is a different library in every runtime (Chromium's zlib in Node, another
// fork in Bun), so the same pixels gave different PNG bytes. Nothing here depends on the engine:
// the same input gives the same bytes in Bun, Node and the browser, on every version.

import { BitWriter } from './deflate-bits.ts';
import { createTokens, distanceCode, lengthSymbol, writeBlock } from './deflate-block.ts';

const WINDOW = 32768;
const WINDOW_MASK = WINDOW - 1;
const HASH_MASK = 0x7fff;
const MIN_MATCH = 3;
const MAX_MATCH = 258;
/** Tokens per block: each block gets Huffman codes fitted to its own statistics. */
const BLOCK_TOKENS = 16384;
/** Candidates tried per position; a quarter of that once the previous match is `GOOD` long. */
const MAX_CHAIN = 128;
const GOOD = 8;
/** A previous match this long is taken without looking for a better one at the next byte. */
const MAX_LAZY = 16;
/** A match this long ends the search. */
const NICE = 128;
/** A 3-byte match further back than this costs more than three literals. */
const TOO_FAR = 4096;

/** Adler-32 of the uncompressed bytes (RFC 1950 §8.2). */
export function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; ) {
    // 3800 bytes keep both sums below 2^32 before the modulo.
    const end = Math.min(data.length, i + 3800);
    for (; i < end; i++) {
      a += data[i] ?? 0;
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** `data` as a zlib stream any inflater reads; deterministic on every runtime. */
export function deflate(data: Uint8Array): Uint8Array {
  const n = data.length;
  const w = new BitWriter(64 + (n >> 2));
  // CMF 0x78: deflate, 32K window. FLG 0x9c: default level, no dictionary, check bits.
  w.bits(0x78, 8);
  w.bits(0x9c, 8);
  const tokens = createTokens(BLOCK_TOKENS + 1);
  const { lit, dist, litFreq, distFreq } = tokens;
  /** Most recent position with each hash, and the one before it for each window position. */
  const head = new Int32Array(HASH_MASK + 1).fill(-1);
  const prev = new Int32Array(WINDOW);
  let count = 0;
  let blockStart = 0;
  const flush = (end: number, final: boolean): void => {
    writeBlock(w, tokens, count, data.subarray(blockStart, end), final);
    blockStart = end;
    count = 0;
  };
  /** Positions before this have three bytes to hash. */
  const hashEnd = n - 2;
  let i = 0;
  let pending = false;
  let prevLen = 0;
  let prevDist = 0;
  while (i < n) {
    let len = 0;
    let distance = 0;
    if (i < hashEnd) {
      const h =
        (((data[i] ?? 0) << 10) ^ ((data[i + 1] ?? 0) << 5) ^ (data[i + 2] ?? 0)) & HASH_MASK;
      let cand = head[h] ?? -1;
      if (prevLen < MAX_LAZY) {
        const limit = i > WINDOW ? i - WINDOW : 0;
        const maxLen = Math.min(n - i, MAX_MATCH);
        const nice = Math.min(maxLen, NICE);
        let chain = prevLen >= GOOD ? MAX_CHAIN >> 2 : MAX_CHAIN;
        // Only a match longer than the pending one is worth having.
        let best = Math.max(prevLen, MIN_MATCH - 1);
        while (cand >= limit && chain-- > 0) {
          if (data[cand + best] === data[i + best] && data[cand] === data[i]) {
            let l = 1;
            while (l < maxLen && data[cand + l] === data[i + l]) l++;
            if (l > best) {
              best = l;
              distance = i - cand;
              if (l >= nice) break;
            }
          }
          cand = prev[cand & WINDOW_MASK] ?? -1;
        }
        if (distance > 0 && !(best === MIN_MATCH && distance > TOO_FAR)) len = best;
      }
      prev[i & WINDOW_MASK] = head[h] ?? -1;
      head[h] = i;
    }
    if (pending && prevLen >= MIN_MATCH && len <= prevLen) {
      // The match at the previous byte stands: emit it and index the bytes it covers.
      lit[count] = prevLen;
      dist[count++] = prevDist;
      const lenSym = lengthSymbol(prevLen);
      litFreq[lenSym] = (litFreq[lenSym] ?? 0) + 1;
      const code = distanceCode(prevDist);
      distFreq[code] = (distFreq[code] ?? 0) + 1;
      const end = i - 1 + prevLen;
      const indexEnd = Math.min(end, hashEnd);
      for (let k = i + 1; k < indexEnd; k++) {
        const h =
          (((data[k] ?? 0) << 10) ^ ((data[k + 1] ?? 0) << 5) ^ (data[k + 2] ?? 0)) & HASH_MASK;
        prev[k & WINDOW_MASK] = head[h] ?? -1;
        head[h] = k;
      }
      i = end;
      pending = false;
      prevLen = 0;
    } else {
      if (pending) {
        const byte = data[i - 1] ?? 0;
        lit[count] = byte;
        dist[count++] = 0;
        litFreq[byte] = (litFreq[byte] ?? 0) + 1;
      }
      pending = true;
      prevLen = len;
      prevDist = distance;
      i++;
    }
    // Tokens so far decode to every byte before the pending one.
    if (count === BLOCK_TOKENS) flush(pending ? i - 1 : i, false);
  }
  if (pending) {
    const byte = data[n - 1] ?? 0;
    lit[count] = byte;
    dist[count++] = 0;
    litFreq[byte] = (litFreq[byte] ?? 0) + 1;
  }
  flush(n, true);
  w.align();
  const check = adler32(data);
  w.reserve(4);
  w.bytes(Uint8Array.of(check >>> 24, (check >>> 16) & 255, (check >>> 8) & 255, check & 255));
  return w.finish();
}
