// A 3×5 bitmap font for view labels on contact sheets, so an agent reading the PNG knows which
// view is which and what the grid step is. Uppercase, digits and a few marks only.

const GLYPHS: Readonly<Record<string, string>> = {
  A: '010101111101101',
  B: '110101110101110',
  C: '011100100100011',
  D: '110101101101110',
  E: '111100110100111',
  F: '111100110100100',
  G: '011100101101011',
  H: '101101111101101',
  I: '111010010010111',
  J: '001001001101010',
  K: '101101110101101',
  L: '100100100100111',
  M: '101111111101101',
  N: '110101101101101',
  O: '010101101101010',
  P: '110101110100100',
  Q: '010101101110011',
  R: '110101110101101',
  S: '011100010001110',
  T: '111010010010010',
  U: '101101101101111',
  V: '101101101101010',
  W: '101101111111101',
  X: '101101010101101',
  Y: '101101010010010',
  Z: '111001010100111',
  '0': '111101101101111',
  '1': '010110010010111',
  '2': '110001010100111',
  '3': '110001010001110',
  '4': '101101111001001',
  '5': '111100110001110',
  '6': '011100111101111',
  '7': '111001010010010',
  '8': '111101111101111',
  '9': '111101111001110',
  '.': '000000000000010',
  '/': '001001010100100',
  '-': '000000111000000',
  ':': '000010000010000',
  ' ': '000000000000000',
  '+': '000010111010000',
  _: '000000000000111',
  '=': '000111000111000',
};

export function drawText(
  px: Uint8Array,
  width: number,
  x: number,
  y: number,
  text: string,
  scale: number,
  rgb: readonly [number, number, number],
): void {
  let cx = x;
  for (const ch of text.toUpperCase()) {
    const g = GLYPHS[ch] ?? GLYPHS[' '] ?? '';
    for (let i = 0; i < 15; i++) {
      if (g[i] !== '1') continue;
      const gx = cx + (i % 3) * scale;
      const gy = y + Math.floor(i / 3) * scale;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const o = ((gy + dy) * width + gx + dx) * 4;
          if (o >= 0 && o + 3 < px.length) px.set([...rgb, 255], o);
        }
      }
    }
    cx += 4 * scale;
  }
}
