// The input-image rules a `mesh` request's image must pass before it reaches a model (plan 15,
// D55: a cluttered snow photo gave broken AI wolves). Pixels only, RGBA in, findings out:
//   background — a flood from the four corners over near-corner colours covers ≥ 30 % of the frame;
//   subjects   — exactly one large connected foreground region (≥ 2 % of the frame; specks ignored;
//                a region over 80 % of the frame is the scene, not a subject);
//   fill       — the object spans ≥ 60 % of the frame along its larger side;
//   cropped    — no SUBJECT pixel on the frame border. A studio floor that shades away from the
//                corner colour is left unflooded and is joined to the subject standing on it, so
//                "not background" is not "subject" there: walking the border, a stretch that
//                continues the flooded background smoothly (≤ 6 levels from one border pixel to
//                the next) is backdrop; a subject cut by the frame starts with an edge;
//   resolution — the shorter side is ≥ 512 px;
//   sharpness  — the variance of the Laplacian (luma, 0–255) over the object's interior is ≥ 25,
//                calibrated on the test fixtures (sharp grain ≈ 12 000, its 4 px box blur ≈ 8; a ts23d
//                render of the wolf ≈ 530, the snow photo ≈ 440).
// Single-image mode also wants a ¾ view: the caller states the view; this only reads pixels.

export type InputRule = 'background' | 'subjects' | 'fill' | 'cropped' | 'resolution' | 'sharpness';

export interface InputImageFinding {
  readonly rule: InputRule;
  readonly message: string;
  readonly fix: string;
}

export interface InputImageReport {
  /** Share of the frame the corner flood reached (the background). */
  readonly background: number;
  /** Large foreground regions (≥ 2 % of the frame). */
  readonly subjects: number;
  /** Object bounding box ÷ frame, larger side. */
  readonly fill: number;
  readonly cropped: boolean;
  /** Variance of the Laplacian over the object interior. */
  readonly sharpness: number;
  readonly findings: readonly InputImageFinding[];
}

/** Colour distance (max channel, 0–255) under which a pixel joins the corner background. */
const TOLERANCE = 18;
export const MIN_SIDE = 512;
export const MIN_SHARPNESS = 25;
const SUBJECT_SHARE = 0.02;
const SCENE_SHARE = 0.8;

export interface InputImageOptions {
  /** Shorter side floor (default 512): tests and thumbnails pass a smaller one. */
  readonly minSide?: number;
}

const CLEAN =
  'generate a clean concept: t3d concept <recipe> (plain background, ¾ view, full frame), or strip the background with an image/segment model';

function cornerFlood(
  rgba: Uint8Array,
  width: number,
  height: number,
): { bg: Uint8Array; count: number } {
  const n = width * height;
  const bg = new Uint8Array(n);
  const queue = new Int32Array(n);
  let tail = 0;
  const near = (i: number, ref: number): boolean => {
    for (let c = 0; c < 3; c++)
      if (Math.abs((rgba[i * 4 + c] ?? 0) - (rgba[ref * 4 + c] ?? 0)) > TOLERANCE) return false;
    return true;
  };
  for (const corner of [0, width - 1, n - width, n - 1]) {
    let head = tail;
    if (bg[corner]) continue;
    bg[corner] = 1;
    queue[tail++] = corner;
    while (head < tail) {
      const i = queue[head++] ?? 0;
      const x = i % width;
      const y = Math.floor(i / width);
      for (const j of [
        x > 0 ? i - 1 : -1,
        x < width - 1 ? i + 1 : -1,
        y > 0 ? i - width : -1,
        y < height - 1 ? i + width : -1,
      ])
        if (j >= 0 && !bg[j] && near(j, corner)) {
          bg[j] = 1;
          queue[tail++] = j;
        }
    }
  }
  return { bg, count: tail };
}

/** Largest step (max channel) between neighbouring border pixels of one smooth backdrop. */
const BORDER_STEP = 6;

/**
 * Border pixels that are neither corner-flood background nor a smooth continuation of it along
 * the frame's perimeter (a floor band, a vignette): the subject, cut by the frame.
 */
export function croppedPixels(
  rgba: Uint8Array,
  width: number,
  height: number,
  bg: Uint8Array,
): number {
  return ringBackdrop(rgba, width, height, bg).backdrop.reduce((n, b) => n + (b ? 0 : 1), 0);
}

const smoothStep = (rgba: Uint8Array, a: number, b: number): boolean => {
  for (let c = 0; c < 3; c++)
    if (Math.abs((rgba[a * 4 + c] ?? 0) - (rgba[b * 4 + c] ?? 0)) > BORDER_STEP) return false;
  return true;
};

/** The frame's perimeter pixels and, per pixel, whether it is backdrop (flooded or smooth band). */
function ringBackdrop(
  rgba: Uint8Array,
  width: number,
  height: number,
  bg: Uint8Array,
): { ring: number[]; backdrop: Uint8Array } {
  const ring: number[] = [];
  for (let x = 0; x < width; x++) ring.push(x);
  for (let y = 1; y < height; y++) ring.push(y * width + width - 1);
  for (let x = width - 2; x >= 0 && height > 1; x--) ring.push((height - 1) * width + x);
  for (let y = height - 2; y > 0 && width > 1; y--) ring.push(y * width);
  const n = ring.length;
  const backdrop = Uint8Array.from(ring, (i) => bg[i] ?? 0);
  const smooth = (a: number, b: number): boolean => smoothStep(rgba, a, b);
  // Two sweeps each way round the ring carry the backdrop across the seam at index 0.
  for (const dir of [1, -1])
    for (let k = 0; k < 2 * n; k++) {
      const at = (((dir > 0 ? k : -k) % n) + n) % n;
      const next = (at + dir + n) % n;
      if (backdrop[at] && !backdrop[next] && smooth(ring[at] ?? 0, ring[next] ?? 0))
        backdrop[next] = 1;
    }
  return { ring, backdrop };
}

/**
 * The backdrop the corner flood did not reach: a floor band or vignette, grown inward from the
 * perimeter pixels `croppedPixels` accepts, through pixels that continue it smoothly. The
 * subject's bounds leave it out (a small figure on a floor band does not fill the frame).
 */
export function backdropBand(
  rgba: Uint8Array,
  width: number,
  height: number,
  bg: Uint8Array,
): Uint8Array {
  const band = new Uint8Array(bg.length);
  const { ring, backdrop } = ringBackdrop(rgba, width, height, bg);
  const queue = new Int32Array(bg.length);
  let tail = 0;
  ring.forEach((i, k) => {
    if (backdrop[k] && !bg[i] && !band[i]) {
      band[i] = 1;
      queue[tail++] = i;
    }
  });
  for (let head = 0; head < tail; head++) {
    const i = queue[head] ?? 0;
    const x = i % width;
    for (const j of [i - width, i + width, x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1]) {
      if (j < 0 || j >= bg.length || bg[j] || band[j] || !smoothStep(rgba, i, j)) continue;
      band[j] = 1;
      queue[tail++] = j;
    }
  }
  return band;
}

/** Sizes of the 8-connected foreground regions, largest first. */
function regions(bg: Uint8Array, width: number, height: number): number[] {
  const seen = new Uint8Array(bg.length);
  const queue = new Int32Array(bg.length);
  const sizes: number[] = [];
  for (let s = 0; s < bg.length; s++) {
    if (bg[s] || seen[s]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = s;
    seen[s] = 1;
    while (head < tail) {
      const i = queue[head++] ?? 0;
      const x = i % width;
      const y = Math.floor(i / width);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
          const j = yy * width + xx;
          if (!bg[j] && !seen[j]) {
            seen[j] = 1;
            queue[tail++] = j;
          }
        }
    }
    sizes.push(tail);
  }
  return sizes.sort((a, b) => b - a);
}

/** Variance of the 4-neighbour Laplacian of luma over object pixels whose neighbours are object. */
export function laplacianVariance(
  rgba: Uint8Array,
  width: number,
  height: number,
  bg?: Uint8Array,
): number {
  const luma = (i: number): number =>
    0.299 * (rgba[i * 4] ?? 0) + 0.587 * (rgba[i * 4 + 1] ?? 0) + 0.114 * (rgba[i * 4 + 2] ?? 0);
  let n = 0;
  let sum = 0;
  let sq = 0;
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (bg && (bg[i] || bg[i - 1] || bg[i + 1] || bg[i - width] || bg[i + width])) continue;
      const l = luma(i - 1) + luma(i + 1) + luma(i - width) + luma(i + width) - 4 * luma(i);
      n++;
      sum += l;
      sq += l * l;
    }
  return n > 0 ? sq / n - (sum / n) ** 2 : 0;
}

export function checkInputImage(
  rgba: Uint8Array,
  width: number,
  height: number,
  o: InputImageOptions = {},
): InputImageReport {
  const n = width * height;
  const { bg, count } = cornerFlood(rgba, width, height);
  let [x0, y0, x1, y1] = [width, height, -1, -1];
  const cropped = croppedPixels(rgba, width, height, bg) > 0;
  const band = backdropBand(rgba, width, height, bg);
  for (let i = 0; i < n; i++) {
    if (bg[i] || band[i]) continue;
    const x = i % width;
    const y = Math.floor(i / width);
    [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
  }
  const background = count / n;
  const subjects = regions(bg, width, height).filter(
    (s) => s >= n * SUBJECT_SHARE && s <= n * SCENE_SHARE,
  ).length;
  const fill = x1 < 0 ? 0 : Math.max((x1 - x0 + 1) / width, (y1 - y0 + 1) / height);
  const sharpness = laplacianVariance(rgba, width, height, bg);
  const minSide = o.minSide ?? MIN_SIDE;
  const findings: InputImageFinding[] = [];
  const add = (rule: InputRule, message: string, fix: string): void =>
    void findings.push({ rule, message, fix });
  if (background < 0.3)
    add(
      'background',
      `the corner flood covers ${(background * 100).toFixed(0)} % of the frame (< 30 %): no plain background`,
      CLEAN,
    );
  if (subjects !== 1)
    add(
      'subjects',
      `${subjects} subject region(s) (want exactly 1): clutter, a whole scene, or several objects`,
      CLEAN,
    );
  if (fill < 0.6)
    add(
      'fill',
      `the object fills ${(fill * 100).toFixed(0)} % of the frame (< 60 %)`,
      'frame the object tighter (crop or zoom) so it fills ≥ 60 % of the larger side',
    );
  if (cropped)
    add(
      'cropped',
      'the subject touches the frame edge: it is cropped, the model would guess the rest',
      'leave a margin round the whole object',
    );
  if (Math.min(width, height) < minSide)
    add(
      'resolution',
      `${width}×${height}: the shorter side is under ${minSide} px`,
      `render or generate at ≥ ${minSide} px on the shorter side`,
    );
  if (sharpness < MIN_SHARPNESS)
    add(
      'sharpness',
      `Laplacian variance ${sharpness.toFixed(1)} on the object (< ${MIN_SHARPNESS}): blurred`,
      'use a sharp, in-focus image (no upscaled thumbnail, no motion blur)',
    );
  return { background, subjects, fill, cropped, sharpness, findings };
}
