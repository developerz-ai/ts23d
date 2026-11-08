// zlib inflate (RFC 1950/1951: stored, fixed and dynamic Huffman blocks) in plain TypeScript, so
// textures inside imported GLBs decode identically in Bun and in the browser (the gallery has no
// node:zlib). Small and unoptimised by design; a bad stream throws T3D_IMPORT_UNSUPPORTED.

import { Ts23dError } from '../core/index.ts';

const fail = (cause: string): never => {
  throw new Ts23dError('T3D_IMPORT_UNSUPPORTED', {
    cause: `PNG data stream: ${cause}`,
    fix: 're-save the texture as a standard 8-bit RGBA PNG',
  });
};

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

interface Huff {
  readonly count: Uint16Array;
  readonly symbol: Uint16Array;
}

function huff(lengths: ArrayLike<number>): Huff {
  const count = new Uint16Array(16);
  for (let i = 0; i < lengths.length; i++)
    count[lengths[i] ?? 0] = (count[lengths[i] ?? 0] ?? 0) + 1;
  count[0] = 0;
  const offs = new Uint16Array(16);
  for (let i = 1; i < 16; i++) offs[i] = (offs[i - 1] ?? 0) + (count[i - 1] ?? 0);
  const symbol = new Uint16Array(lengths.length);
  for (let i = 0; i < lengths.length; i++) {
    const l = lengths[i] ?? 0;
    if (l) {
      symbol[offs[l] ?? 0] = i;
      offs[l] = (offs[l] ?? 0) + 1;
    }
  }
  return { count, symbol };
}

export function inflate(z: Uint8Array): Uint8Array {
  if (z.length < 2 || ((z[0] ?? 0) & 15) !== 8) fail('not a zlib deflate stream');
  let pos = 2;
  let bit = 0;
  let out = new Uint8Array(Math.max(1024, z.length * 4));
  let n = 0;
  const put = (b: number): void => {
    if (n === out.length) {
      const g = new Uint8Array(out.length * 2);
      g.set(out);
      out = g;
    }
    out[n++] = b;
  };
  const bits = (k: number): number => {
    let v = 0;
    for (let i = 0; i < k; i++) {
      if (pos >= z.length) fail('ends early');
      v |= (((z[pos] ?? 0) >> bit) & 1) << i;
      if (++bit === 8) {
        bit = 0;
        pos++;
      }
    }
    return v;
  };
  const decode = (h: Huff): number => {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let len = 1; len < 16; len++) {
      code |= bits(1);
      const c = h.count[len] ?? 0;
      if (code - c < first) return h.symbol[index + (code - first)] ?? 0;
      index += c;
      first = (first + c) << 1;
      code <<= 1;
    }
    return fail('bad Huffman code');
  };
  const fixedLit = huff(
    Array.from({ length: 288 }, (_, i) => (i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8)),
  );
  const fixedDist = huff(new Array(30).fill(5));
  for (let last = 0; !last; ) {
    last = bits(1);
    const type = bits(2);
    if (type === 0) {
      if (bit) {
        bit = 0;
        pos++;
      }
      const len = (z[pos] ?? 0) | ((z[pos + 1] ?? 0) << 8);
      pos += 4;
      if (pos + len > z.length) fail('stored block runs past the end');
      for (let i = 0; i < len; i++) put(z[pos + i] ?? 0);
      pos += len;
      continue;
    }
    if (type === 3) fail('reserved block type');
    let lit = fixedLit;
    let dist = fixedDist;
    if (type === 2) {
      const hlit = bits(5) + 257;
      const hdist = bits(5) + 1;
      const hclen = bits(4) + 4;
      const cl = new Uint8Array(19);
      for (let i = 0; i < hclen; i++) cl[ORDER[i] ?? 0] = bits(3);
      const clh = huff(cl);
      const lens = new Uint8Array(hlit + hdist);
      for (let i = 0; i < hlit + hdist; ) {
        const s = decode(clh);
        if (s < 16) lens[i++] = s;
        else {
          const [rep, val] =
            s === 16
              ? [3 + bits(2), lens[i - 1] ?? 0]
              : s === 17
                ? [3 + bits(3), 0]
                : [11 + bits(7), 0];
          for (let k = 0; k < rep; k++) lens[i++] = val;
        }
      }
      lit = huff(lens.subarray(0, hlit));
      dist = huff(lens.subarray(hlit));
    }
    for (;;) {
      const s = decode(lit);
      if (s < 256) put(s);
      else if (s === 256) break;
      else {
        const li = s - 257;
        const len = (LEN_BASE[li] ?? 0) + bits(LEN_EXTRA[li] ?? 0);
        const di = decode(dist);
        const d = (DIST_BASE[di] ?? 0) + bits(DIST_EXTRA[di] ?? 0);
        if (d > n) fail('distance before the start');
        for (let k = 0; k < len; k++) put(out[n - d] ?? 0);
      }
    }
  }
  return out.subarray(0, n);
}
