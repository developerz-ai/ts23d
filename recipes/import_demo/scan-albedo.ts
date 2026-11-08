// The stand-in scan's texture, in its own lat-long UV space: a near-white pore/micro-mottle detail
// map that multiplies the scan's vertex colour (glTF: base colour = factor × texture × COLOR_0),
// the way a scan's colour arrives split between per-vertex tone and fine texture. RGBA8 sRGB,
// periodic in u (no seam line), deterministic.

/** Smooth value noise on a lattice periodic in u (cells × cells/2). */
function noise(u: number, v: number, cells: number, seed: number): number {
  const h = (i: number, j: number): number => {
    let x = (((i % cells) + cells) % cells) * 73856093 + j * 19349663 + seed * 83492791;
    x = Math.imul(x ^ (x >>> 13), 1274126177);
    return (((x ^ (x >>> 16)) >>> 0) / 4294967295) * 2 - 1;
  };
  const x = u * cells;
  const y = v * (cells / 2);
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = h(i, j) + (h(i + 1, j) - h(i, j)) * sx;
  const b = h(i, j + 1) + (h(i + 1, j + 1) - h(i, j + 1)) * sx;
  return a + (b - a) * sy;
}

export function poreTexture(
  width: number,
  height: number,
): { width: number; height: number; data: Uint8Array } {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      const v = (y + 0.5) / height;
      const mottle = noise(u, v, 18, 1) * 0.5 + noise(u, v, 48, 2) * 0.3;
      const pore = Math.max(0, noise(u, v, 160, 3)) ** 3;
      const k = 243 + 9 * mottle - 40 * pore;
      const o = (y * width + x) * 4;
      data[o] = Math.round(Math.min(255, k + 4));
      data[o + 1] = Math.round(Math.min(255, k));
      data[o + 2] = Math.round(Math.min(255, k - 3));
      data[o + 3] = 255;
    }
  return { width, height, data };
}
