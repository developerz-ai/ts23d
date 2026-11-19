// Huffman codes for the deflate encoder: code lengths capped at a bit limit, and the canonical
// codes for them (RFC 1951 §3.2.2), bit-reversed because deflate sends codes most significant
// bit first into a least-significant-bit-first stream. Integer arithmetic and total orders only,
// so every JavaScript engine picks the same codes.

/**
 * A code length per symbol (0 = unused), none above `limit`, forming a complete prefix code.
 * Fewer than two used symbols get unused ones added from symbol 0 up: inflaters refuse a code
 * with one entry in some tables, and a second code costs nothing.
 */
export function codeLengths(freq: Uint32Array, limit: number): Uint8Array {
  const lengths = new Uint8Array(freq.length);
  const used: number[] = [];
  for (let s = 0; s < freq.length; s++) if ((freq[s] ?? 0) > 0) used.push(s);
  for (let s = 0; used.length < 2 && s < freq.length; s++) if ((freq[s] ?? 0) === 0) used.push(s);
  const weightOf = (s: number): number => freq[s] || 1;
  used.sort((a, b) => weightOf(a) - weightOf(b) || a - b);

  // Huffman's algorithm on two queues: sorted leaves 0..m-1, then merged nodes in creation order
  // (their weights never decrease), so the lighter of the two queue heads is always the minimum.
  const m = used.length;
  const weight = new Float64Array(2 * m - 1);
  const parent = new Int32Array(2 * m - 1);
  for (let k = 0; k < m; k++) weight[k] = weightOf(used[k] ?? 0);
  let leaf = 0;
  let node = m;
  for (let next = m; next < 2 * m - 1; next++) {
    let sum = 0;
    for (let pick = 0; pick < 2; pick++) {
      const takeLeaf = leaf < m && (node >= next || (weight[leaf] ?? 0) <= (weight[node] ?? 0));
      const k = takeLeaf ? leaf++ : node++;
      sum += weight[k] ?? 0;
      parent[k] = next;
    }
    weight[next] = sum;
  }
  const depth = new Int32Array(2 * m - 1);
  for (let k = 2 * m - 3; k >= 0; k--) depth[k] = (depth[parent[k] ?? 0] ?? 0) + 1;

  // How many codes of each length, with anything deeper than the limit folded onto it. That
  // overfills the code space, so move codes down one length at a time until it is exactly full.
  const count = new Int32Array(limit + 1);
  let space = 0;
  for (let k = 0; k < m; k++) {
    const len = Math.min(depth[k] ?? 0, limit);
    count[len] = (count[len] ?? 0) + 1;
    space += 1 << (limit - len);
  }
  for (; space > 1 << limit; space--) {
    count[limit] = (count[limit] ?? 0) - 1;
    for (let len = limit - 1; len > 0; len--) {
      if ((count[len] ?? 0) === 0) continue;
      count[len] = (count[len] ?? 0) - 1;
      count[len + 1] = (count[len + 1] ?? 0) + 2;
      break;
    }
  }
  // Shortest codes to the heaviest symbols: `used` is sorted lightest first, so fill from its end.
  let k = m;
  for (let len = 1; len <= limit; len++)
    for (let c = count[len] ?? 0; c > 0; c--) lengths[used[--k] ?? 0] = len;
  return lengths;
}

/** The canonical code of every symbol, bit-reversed and ready to write low bit first. */
export function canonicalCodes(lengths: Uint8Array): Uint16Array {
  const count = new Int32Array(16);
  for (const len of lengths) count[len] = (count[len] ?? 0) + 1;
  count[0] = 0;
  const next = new Int32Array(16);
  for (let len = 1, code = 0; len < 16; len++) {
    code = (code + (count[len - 1] ?? 0)) << 1;
    next[len] = code;
  }
  const codes = new Uint16Array(lengths.length);
  for (let s = 0; s < lengths.length; s++) {
    const len = lengths[s] ?? 0;
    if (len === 0) continue;
    const code = next[len] ?? 0;
    next[len] = code + 1;
    let reversed = 0;
    for (let b = 0; b < len; b++) reversed |= ((code >> b) & 1) << (len - 1 - b);
    codes[s] = reversed;
  }
  return codes;
}
