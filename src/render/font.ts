// A 3×5 bitmap font for view labels on contact sheets, so an agent reading the PNG knows which
// view is which and what the grid step is. Uppercase, digits and a few marks only. Text is clipped
// to the canvas on both axes: a pixel past the right edge is dropped, never wrapped onto the next
// row's left side.

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
  '%': '101001010100101',
  '(': '010100100100010',
  ')': '010001001001010',
  ',': '000000000010100',
  '<': '001010100010001',
  '>': '100010001010100',
  '!': '010010010000010',
  "'": '010010000000000',
  '#': '101111101111101',
};

/** Pixel width of `text` at `scale` (4 columns per glyph, the last one blank). */
export const textWidth = (text: string, scale: number): number => text.length * 4 * scale - scale;

/** Largest whole scale ≤ `scale` (never below 1) at which `text` is at most `room` pixels wide. */
export function fitScale(text: string, scale: number, room: number): number {
  let s = Math.max(1, Math.floor(scale));
  while (s > 1 && textWidth(text, s) > room) s--;
  return s;
}

export function drawText(
  px: Uint8Array,
  width: number,
  x: number,
  y: number,
  text: string,
  scale: number,
  rgb: readonly [number, number, number],
): void {
  const height = Math.floor(px.length / (width * 4));
  let cx = x;
  for (const ch of text.toUpperCase()) {
    const g = GLYPHS[ch] ?? GLYPHS[' '] ?? '';
    for (let i = 0; i < 15; i++) {
      if (g[i] !== '1') continue;
      const gx = cx + (i % 3) * scale;
      const gy = y + Math.floor(i / 3) * scale;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const X = gx + dx;
          const Y = gy + dy;
          if (X < 0 || X >= width || Y < 0 || Y >= height) continue;
          px.set([...rgb, 255], (Y * width + X) * 4);
        }
      }
    }
    cx += 4 * scale;
  }
}
