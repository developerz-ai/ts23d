// The studio rig every beauty render shares: a warm key sun placed relative to the camera, a cool
// sky hemisphere fill with a warm ground bounce, sky directions for ambient occlusion, PCF tap
// patterns, and the filmic tone curve. Constants live here so every shot is lit the same way.

export type V3 = [number, number, number];

export interface Rig {
  /** Unit vector toward the sun. */
  readonly sun: V3;
  readonly sunColor: V3;
  readonly sky: V3;
  readonly bounce: V3;
  /** Unit vectors toward the sky, upper hemisphere, for the AO maps. */
  readonly skyDirs: readonly V3[];
  readonly exposure: number;
}

const unit = (az: number, el: number): V3 => {
  const a = (az * Math.PI) / 180;
  const e = (el * Math.PI) / 180;
  return [Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e)];
};

/** Rings of sky directions: elevations and how many azimuths each ring holds (12 total). */
const RINGS: readonly (readonly [number, number])[] = [
  [14, 5],
  [38, 4],
  [64, 2],
  [88, 1],
];

export function studioRig(cameraAzDeg: number): Rig {
  const skyDirs: V3[] = [];
  RINGS.forEach(([el, n], ring) => {
    for (let i = 0; i < n; i++) skyDirs.push(unit((360 * (i + ring * 0.37)) / n, el));
  });
  return {
    // Key light from camera-left and above: the near flank is lit, the front falls to fill, and
    // the shadow lands behind and to the right where it grounds the model without hiding it.
    sun: unit(cameraAzDeg - 50, 55),
    // Calibrated so an open, sun-facing surface receives ≈ 1.0 irradiance: the output pixel is
    // the albedo itself (vertex colour × sheet), not a lifted version of it.
    sunColor: [0.95, 0.91, 0.84],
    sky: [0.3, 0.33, 0.4],
    bounce: [0.16, 0.15, 0.13],
    skyDirs,
    exposure: 1,
  };
}

const HORIZON: V3 = [0.82, 0.8, 0.76];
const ZENITH: V3 = [0.3, 0.34, 0.44];
const FLOOR: V3 = [0.3, 0.28, 0.26];
const BAND = 0.12;

/**
 * The studio environment a reflection sees, channel `k`, along a reflection vector with up
 * component `rz`: a bright cyclorama horizon fading to a cooler zenith, a dark band where the
 * floor meets the wall, the lit floor below. Roughness pre-blurs it toward its mean, so polished
 * metal shows the horizon line and rough metal a soft gradient — what makes metal read as metal.
 */
export function envRadiance(rz: number, rough: number, k: number): number {
  const h = HORIZON[k] ?? 0;
  const sharp =
    rz >= 0
      ? h + ((ZENITH[k] ?? 0) - h) * Math.sqrt(rz)
      : rz > -0.3
        ? h * BAND + ((FLOOR[k] ?? 0) - h * BAND) * Math.min(1, -rz / 0.3) ** 0.5
        : (FLOOR[k] ?? 0);
  const blurred = 0.5 * h + 0.25 * (ZENITH[k] ?? 0) + 0.25 * (FLOOR[k] ?? 0);
  // Above the horizon the blur keeps a little of the up/down split so rough metal still shades.
  const tilt = 1 + 0.25 * Math.max(-1, Math.min(1, rz * 2));
  const t = Math.min(1, rough * 1.6);
  return sharp + (blurred * tilt - sharp) * t;
}

/** Poisson-ish disc of 12 taps (texel offsets), radius ~1.6, rotated four ways for dithering. */
const DISC: readonly (readonly [number, number])[] = [
  [-0.94, -0.4],
  [0.95, -0.77],
  [-0.09, -0.93],
  [0.34, 0.29],
  [-0.92, 0.46],
  [-0.38, -0.06],
  [0.79, 0.19],
  [-0.24, 0.78],
  [0.44, -0.3],
  [0.55, 0.85],
  [-0.66, -0.87],
  [0.06, 0.37],
];

export function pcfTaps(radius: number): Float32Array[] {
  return [0, 1, 2, 3].map((k) => {
    const a = (k * Math.PI) / 8;
    const c = Math.cos(a) * radius;
    const s = Math.sin(a) * radius;
    const out = new Float32Array(DISC.length * 2);
    DISC.forEach(([x, y], i) => {
      out[i * 2] = x * c - y * s;
      out[i * 2 + 1] = x * s + y * c;
    });
    return out;
  });
}

/**
 * Tone curve, linear in → linear display out: identity up to 0.6 (mid-tones and the palette stay
 * true), then a smooth exponential shoulder that rolls highlights into 1 without clipping.
 */
export function tone(x: number): number {
  if (x <= 0) return 0;
  if (x <= 0.6) return x;
  return 0.6 + 0.4 * (1 - Math.exp(-(x - 0.6) / 0.4));
}

export const toSrgb8 = (v: number): number =>
  Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.min(1, v) ** (1 / 2.4) - 0.055));

export const fromSrgb = (v: number): number =>
  v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
