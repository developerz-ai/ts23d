// Photo preparation for reference matching: box-filter resize, and object segmentation — the
// photo's alpha when it has any, else a background flood from the border that spreads while the
// colour step stays small (Lab ΔE) and the colour stays near one of the corner backgrounds, then
// specks (< 5% of the largest object) dropped and holes filled. A GPU segmenter can replace it later (plan 101, 13).

export interface Photo {
  readonly width: number;
  readonly height: number;
  /** RGBA8, row 0 = top. */
  readonly data: Uint8Array;
}

export interface SegmentOptions {
  /** Largest Lab ΔE between neighbouring background pixels. Default 10. */
  readonly stepDeltaE?: number;
  /** Largest Lab ΔE from the nearest corner background colour. Default 28. */
  readonly backgroundDeltaE?: number;
}

const lin = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const labF = (t: number): number =>
  t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 / 116) * t + 4 / 29;

function labOf(p: Photo): Float64Array {
  const out = new Float64Array(p.width * p.height * 3);
  for (let i = 0; i < p.width * p.height; i++) {
    const [R, G, B] = [
      lin(p.data[i * 4] ?? 0),
      lin(p.data[i * 4 + 1] ?? 0),
      lin(p.data[i * 4 + 2] ?? 0),
    ];
    const x = labF((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
    const y = labF(0.2126 * R + 0.7152 * G + 0.0722 * B);
    const z = labF((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
    out.set([116 * y - 16, 500 * (x - y), 200 * (y - z)], i * 3);
  }
  return out;
}

/** Box-filter resize to `width` (height keeps the aspect); never enlarges. */
export function resizePhoto(p: Photo, width: number): Photo {
  if (width >= p.width) return p;
  const s = p.width / width;
  const height = Math.max(1, Math.round(p.height / s));
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const [x0, y0] = [Math.floor(x * s), Math.floor(y * s)];
      const [x1, y1] = [
        Math.min(p.width, Math.max(x0 + 1, Math.floor((x + 1) * s))),
        Math.min(p.height, Math.max(y0 + 1, Math.floor((y + 1) * s))),
      ];
      const acc = [0, 0, 0, 0];
      for (let sy = y0; sy < y1; sy++)
        for (let sx = x0; sx < x1; sx++)
          for (let k = 0; k < 4; k++)
            acc[k] = (acc[k] ?? 0) + (p.data[(sy * p.width + sx) * 4 + k] ?? 0);
      const n = (x1 - x0) * (y1 - y0);
      data.set(
        acc.map((v) => Math.round(v / n)),
        (y * width + x) * 4,
      );
    }
  return { width, height, data };
}

/** 4-connected components of `mask` (1 = object) of ≥ 5% of the largest, holes filled. */
function largestFilled(mask: Uint8Array, w: number, h: number): Uint8Array {
  const label = new Int32Array(w * h).fill(-1);
  const flood = (start: number, id: number, take: (i: number) => boolean): number => {
    const stack = [start];
    label[start] = id;
    let n = 0;
    for (let i = stack.pop(); i !== undefined; i = stack.pop()) {
      n++;
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w])
        if (j >= 0 && j < w * h && label[j] === -1 && take(j)) {
          label[j] = id;
          stack.push(j);
        }
    }
    return n;
  };
  const sizes = new Map<number, number>();
  for (let i = 0; i < w * h; i++)
    if (mask[i] && label[i] === -1)
      sizes.set(
        i,
        flood(i, i, (j) => (mask[j] ?? 0) === 1),
      );
  const keep = 0.05 * Math.max(0, ...sizes.values());
  // Outside = background reachable from the border without crossing a kept object.
  const out = Uint8Array.from(label, (l) => (l >= 0 && (sizes.get(l) ?? 0) >= keep ? 1 : 0));
  const outside = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (i: number): void => {
    if (!outside[i] && !out[i]) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) [push(x), push((h - 1) * w + x)];
  for (let y = 0; y < h; y++) [push(y * w), push(y * w + w - 1)];
  for (let i = stack.pop(); i !== undefined; i = stack.pop()) {
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < w * (h - 1)) push(i + w);
  }
  return Uint8Array.from(outside, (o) => (o ? 0 : 1));
}

/** Object mask (1 = object) of a photo: its alpha, else a background flood from the border. */
export function segmentPhoto(p: Photo, o: SegmentOptions = {}): Uint8Array {
  const { width: w, height: h } = p;
  const n = w * h;
  let alpha = false;
  for (let i = 0; i < n && !alpha; i++) alpha = (p.data[i * 4 + 3] ?? 255) < 128;
  if (alpha)
    return largestFilled(
      Uint8Array.from({ length: n }, (_, i) => ((p.data[i * 4 + 3] ?? 0) >= 128 ? 1 : 0)),
      w,
      h,
    );
  const step = o.stepDeltaE ?? 10;
  const far = o.backgroundDeltaE ?? 28;
  const lab = labOf(p);
  const k = Math.max(1, Math.round(Math.min(w, h) / 20));
  const corners = [
    [0, 0],
    [w - k, 0],
    [0, h - k],
    [w - k, h - k],
  ].map(([cx, cy]) => {
    const m = [0, 0, 0];
    for (let y = cy ?? 0; y < (cy ?? 0) + k; y++)
      for (let x = cx ?? 0; x < (cx ?? 0) + k; x++)
        for (let c = 0; c < 3; c++) m[c] = (m[c] ?? 0) + (lab[(y * w + x) * 3 + c] ?? 0) / (k * k);
    return m;
  });
  const dE = (i: number, ref: readonly number[]): number =>
    Math.hypot(
      (lab[i * 3] ?? 0) - (ref[0] ?? 0),
      (lab[i * 3 + 1] ?? 0) - (ref[1] ?? 0),
      (lab[i * 3 + 2] ?? 0) - (ref[2] ?? 0),
    );
  const nearBg = (i: number): boolean => corners.some((c) => dE(i, c) <= far);
  const bg = new Uint8Array(n);
  const stack: number[] = [];
  const seed = (i: number): void => {
    if (!bg[i] && nearBg(i)) {
      bg[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) [seed(x), seed((h - 1) * w + x)];
  for (let y = 0; y < h; y++) [seed(y * w), seed(y * w + w - 1)];
  for (let i = stack.pop(); i !== undefined; i = stack.pop()) {
    const x = i % w;
    const from = [lab[i * 3] ?? 0, lab[i * 3 + 1] ?? 0, lab[i * 3 + 2] ?? 0];
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w])
      if (j >= 0 && j < n && !bg[j] && dE(j, from) <= step && nearBg(j)) {
        bg[j] = 1;
        stack.push(j);
      }
  }
  return largestFilled(
    Uint8Array.from(bg, (b) => 1 - b),
    w,
    h,
  );
}
