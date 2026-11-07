// A stable content hash for snapshot tests: 64-bit FNV-1a (two 32-bit lanes), pure JS, so the
// same bytes give the same hex string on Bun, Node and the browser — no runtime hash API needed.

export function hashBytes(bytes: Uint8Array): string {
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] ?? 0;
    h1 = Math.imul(h1 ^ b, 0x01000193);
    h2 = Math.imul(h2 ^ b ^ (h1 >>> 24), 0x01000193);
  }
  const hex = (n: number): string => (n >>> 0).toString(16).padStart(8, '0');
  return `${hex(h2)}${hex(h1)}`;
}
