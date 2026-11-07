// A hull's lines plan as functions, no mesh: deck-edge plan (half-breadth), sheer (deck-edge
// height), keel/stem/counter profile and the section shape at any station. Waterline at z = 0,
// bow toward +X, x = 0 amidships. Sections are superellipse quarters (n = 2 round bilge, 4 hard
// bilge), going V toward the ends; the stem is where the keel line rises to meet the sheer.

import { Ts23dError, type Vec3 } from '../core/index.ts';

export interface HullColors {
  /** Above the boot-top. */
  readonly topsides: Vec3;
  /** Below the waterline (antifouling). */
  readonly bottom: Vec3;
  /** The boot-top band at the waterline. Default near-black. */
  readonly boot?: Vec3;
  readonly deck: Vec3;
  /** Inside of the bulwarks and the cap rail. Default = topsides. */
  readonly bulwark?: Vec3;
}

export interface HullOptions {
  /** Length overall at the deck, metres. */
  readonly length: number;
  /** Maximum beam at the deck edge. */
  readonly beam: number;
  /** Keel below the waterline. */
  readonly draft: number;
  /** Deck edge above the waterline amidships (lowest point of the sheer). */
  readonly freeboard: number;
  /** Sheer rise of the deck edge at [bow, stern] above amidships. Default [0.035, 0.012]·L. */
  readonly sheer?: readonly [number, number];
  /** 'round' (cruiser / tug) or 'transom' (flat stern). Default 'round'. */
  readonly stern?: 'round' | 'transom';
  /** Transom half-width as a share of the half-beam. Default 0.75. */
  readonly transomWidth?: number;
  /** Bilge: section superellipse exponent, 1.5 (soft V) … 5 (barge). Default 3. */
  readonly fullness?: number;
  /** Plan entrance exponent at the bow: 1.4 sharp … 3 bluff. Default 2. */
  readonly entrance?: number;
  /** Deck-edge breadth over waterline breadth − 1. Default 0.06. */
  readonly flare?: number;
  /** Bottom deadrise, degrees. Default 5. */
  readonly deadriseDeg?: number;
  /** Bulwark height above the deck, metres; 0 = none. Default 0. */
  readonly bulwark?: number;
  /** Deck camber at the centreline, metres. Default beam / 50. */
  readonly camber?: number;
  /** Height of the boot-top band above the waterline. Default 0.3. */
  readonly bootTop?: number;
  readonly colors: HullColors;
  /** A rubbing strake / fender along each side just below the sheer (LOD0/1). */
  readonly fender?: { readonly color: Vec3; readonly radius?: number };
  /** Waterline amidships. Default [0, 0, 0]. */
  readonly at?: Vec3;
}

export interface HullLines {
  readonly L: number;
  /** Deck-edge half-breadth at x (outer hull). */
  readonly halfBreadth: (x: number) => number;
  /** Deck-edge height at x (sheer line), relative to the waterline. */
  readonly deck: (x: number) => number;
  /** Keel / stem / counter height at x. */
  readonly keel: (x: number) => number;
  /** Section point at x for θ ∈ [0, π/2] (0 = keel, π/2 = deck edge), starboard (y ≥ 0). */
  readonly section: (x: number, theta: number) => [number, number];
}

const bad = (cause: string, fix: string): Ts23dError =>
  new Ts23dError('T3D_RECIPE_INVALID', { cause, fix });

export function validateHull(o: HullOptions): void {
  const dims = [o.length, o.beam, o.draft, o.freeboard];
  if (!dims.every((v) => v > 0 && Number.isFinite(v)))
    throw bad(
      `hull length/beam/draft/freeboard = ${dims.join(' / ')}`,
      'give all four in metres, > 0 (a harbour tug: 30 / 9 / 4 / 1.2)',
    );
  if (o.beam > o.length * 0.8)
    throw bad(
      `hull beam ${o.beam} is over 0.8 × length ${o.length}`,
      'check the numbers: length/beam is 2.5–4 for tugs, 6–9 for ships',
    );
  const n = o.fullness ?? 3;
  if (!(n >= 1.2 && n <= 8)) throw bad(`hull fullness is ${n}`, 'use 1.5 (soft V) … 5 (barge)');
  const tw = o.transomWidth ?? 0.75;
  if (!(tw > 0 && tw <= 1))
    throw bad(`hull transomWidth is ${tw}`, 'use a share 0.3–1 of the half-beam');
}

const smooth = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export function hullLines(o: HullOptions): HullLines {
  validateHull(o);
  const L = o.length;
  const half = L / 2;
  const [sb, ss] = o.sheer ?? [0.035 * L, 0.012 * L];
  const round = (o.stern ?? 'round') === 'round';
  const tw = o.transomWidth ?? 0.75;
  const pe = o.entrance ?? 2;
  const n = o.fullness ?? 3;
  const flare = o.flare ?? 0.06;
  const dead = Math.tan(((o.deadriseDeg ?? 5) * Math.PI) / 180);
  // Parallel middle body and where the keel starts to rise, as shares of L.
  const xf = 0.1 * L;
  const xa = -0.15 * L;
  const kf = 0.22 * L;
  const ka = -0.25 * L;
  const deck = (x: number): number => {
    const u = x / half;
    return o.freeboard + (u > 0 ? sb : ss) * u * u;
  };
  const plan = (x: number): number => {
    if (x > xf) return 1 - ((x - xf) / (half - xf)) ** pe;
    if (x < xa) {
      const v = Math.min(1, (xa - x) / (xa + half));
      return round ? Math.sqrt(Math.max(0, 1 - v * v)) : 1 - (1 - tw) * v * v;
    }
    return 1;
  };
  const halfBreadth = (x: number): number => (o.beam / 2) * Math.max(0, plan(x));
  const counter = round ? 0.35 * o.freeboard : 0.15 * o.freeboard;
  const keel = (x: number): number => {
    if (x > kf) {
      const u = Math.min(1, (x - kf) / (half - kf));
      return -o.draft + (deck(half) + o.draft) * u ** 2;
    }
    if (x < ka) {
      const v = Math.min(1, (ka - x) / (ka + half));
      return -o.draft + (counter + o.draft) * v ** 1.6;
    }
    return -o.draft;
  };
  const section = (x: number, theta: number): [number, number] => {
    const f = plan(x);
    // Fine ends go V-sectioned; the middle body keeps the full bilge.
    const ns = 1.2 + (n - 1.2) * smooth(f / 0.8);
    const s = Math.sin(theta) ** (2 / ns);
    const c = Math.cos(theta) ** (2 / ns);
    const zk = keel(x);
    const zd = deck(x);
    const zf = 1 - c;
    const y = halfBreadth(x) * (1 - flare + flare * zf * zf) * s;
    return [y, zk + (zd - zk) * zf + dead * y * c];
  };
  return { L, halfBreadth, deck, keel, section };
}

/** θ where the section crosses height z (bisection; the section rises monotonically). */
export function thetaAt(lines: HullLines, x: number, z: number): number {
  let lo = 0;
  let hi = Math.PI / 2;
  if (lines.section(x, lo)[1] >= z) return lo;
  if (lines.section(x, hi)[1] <= z) return hi;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (lines.section(x, mid)[1] < z) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
