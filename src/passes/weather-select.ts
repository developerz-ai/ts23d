// WHERE: selector expressions over geometry → a per-vertex weight 0..1 (eligible at ≥ 0.5).
// Names read normals, convexity, height above ground, exposure, fasteners, touched spots, panels
// and spans; `&` = min, `|` = max, `!` = 1 − x, parentheses group: 'shaded & wet', '!up-facing'.

import { Ts23dError } from '../core/index.ts';
import { panels, spans } from './weather-regions.ts';
import type { Surface } from './weather-surface.ts';
import type { Spot } from './weather-types.ts';

export interface Scene {
  readonly s: Surface;
  readonly ground: number;
  readonly band: number;
  /** 0..1 extra dampness from the climate. */
  readonly damp: number;
  readonly fasteners: readonly Spot[];
  readonly touched: readonly Spot[];
  /** Vertices of touched parts (ctx form). */
  readonly touchedMask?: Uint8Array;
  readonly exposure: () => Float32Array;
}

export const SELECTORS = [
  'all',
  'up-facing',
  'down-facing',
  'side-facing',
  'convex-edges',
  'cavities',
  'ground-near',
  'shaded',
  'sunlit',
  'wet',
  'fasteners',
  'below-fasteners',
  'touched',
  'long-spans',
  'exposed-panels',
] as const;

type Node =
  | { op: 'name'; name: (typeof SELECTORS)[number] }
  | { op: 'not'; a: Node }
  | { op: 'and' | 'or'; a: Node; b: Node };

const ramp = (lo: number, hi: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};

export function parseWhere(src: string): Node {
  const tokens = src.match(/[a-z][a-z-]*|[&|!()]/g) ?? [];
  const leftover = src.replace(/[a-z][a-z-]*|[&|!()\s]/g, '');
  let i = 0;
  const bad = (why: string): never => {
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `weather where '${src}': ${why}`,
      fix: `combine ${SELECTORS.join(', ')} with & | ! and parentheses, e.g. 'shaded & wet'`,
    });
  };
  if (leftover) bad(`unexpected '${leftover}'`);
  const factor = (): Node => {
    const t = tokens[i++];
    if (t === '!') return { op: 'not', a: factor() };
    if (t === '(') {
      const e = expr();
      if (tokens[i++] !== ')') bad('missing )');
      return e;
    }
    const name = SELECTORS.find((n) => n === t);
    return name ? { op: 'name', name } : bad(t ? `unknown selector '${t}'` : 'ends early');
  };
  const term = (): Node => {
    let a = factor();
    while (tokens[i] === '&') {
      i++;
      a = { op: 'and', a, b: factor() };
    }
    return a;
  };
  const expr = (): Node => {
    let a = term();
    while (tokens[i] === '|') {
      i++;
      a = { op: 'or', a, b: term() };
    }
    return a;
  };
  const tree = expr();
  if (i !== tokens.length) bad(`unexpected '${tokens[i]}'`);
  return tree;
}

const spotWeight = (
  spots: readonly Spot[],
  x: number,
  y: number,
  z: number,
  below: boolean,
): number => {
  let w = 0;
  for (const sp of spots) {
    const r = sp.radius ?? 0.02;
    const dz = sp.at[2] - z;
    if (below) {
      const h = Math.hypot(x - sp.at[0], y - sp.at[1]);
      if (dz > 0 && dz < r + 0.05 && h < r * 1.3) w = 1;
    } else if (Math.hypot(x - sp.at[0], y - sp.at[1], z - sp.at[2]) <= r * 1.15) w = 1;
  }
  return w;
};

/** Per-vertex weights of a selector name. */
function base(sc: Scene, name: (typeof SELECTORS)[number]): Float32Array {
  const s = sc.s;
  const m = s.mesh;
  const out = new Float32Array(s.vertices);
  const nz = (v: number): number => m.normals[v * 3 + 2] ?? 0;
  const zOf = (v: number): number => s.gp[(s.group[v] ?? 0) * 3 + 2] ?? 0;
  const conv = (v: number): number => s.convex[s.group[v] ?? 0] ?? 0;
  const near = (v: number, band: number): number => 1 - ramp(band * 0.6, band, zOf(v) - sc.ground);
  if (name === 'shaded' || name === 'sunlit') {
    const e = sc.exposure();
    for (let v = 0; v < out.length; v++)
      out[v] = name === 'shaded' ? 1 - ramp(0.28, 0.4, e[v] ?? 0) : ramp(0.5, 0.65, e[v] ?? 0);
    return out;
  }
  if (name === 'convex-edges') {
    // Edge wear reaches one vertex ring in from the edge itself.
    const gw = Float32Array.from(s.convex, (c) => ramp(0.06, 0.2, -c));
    const grown = Float32Array.from(gw);
    for (let g = 0; g < s.groups; g++)
      for (let i = s.nbrStart[g] ?? 0; i < (s.nbrStart[g + 1] ?? 0); i++)
        grown[g] = Math.max(grown[g] ?? 0, 0.75 * (gw[s.nbr[i] ?? 0] ?? 0));
    for (let v = 0; v < out.length; v++) out[v] = grown[s.group[v] ?? 0] ?? 0;
    return out;
  }
  if (name === 'long-spans') {
    const long = new Set(spans(s, 0.6).map((sp) => sp.piece));
    for (let v = 0; v < out.length; v++) out[v] = long.has(s.piece[s.group[v] ?? 0] ?? 0) ? 1 : 0;
    return out;
  }
  if (name === 'exposed-panels') {
    const { of } = panels(s, 0.04);
    for (let v = 0; v < out.length; v++) out[v] = (of[v] ?? -1) >= 0 && nz(v) > -0.3 ? 1 : 0;
    return out;
  }
  const at = (v: number): [number, number, number] => [
    m.positions[v * 3] ?? 0,
    m.positions[v * 3 + 1] ?? 0,
    m.positions[v * 3 + 2] ?? 0,
  ];
  const point: Record<string, (v: number) => number> = {
    all: () => 1,
    'up-facing': (v) => ramp(0.3, 0.6, nz(v)),
    'down-facing': (v) => ramp(0.3, 0.6, -nz(v)),
    'side-facing': (v) => 1 - ramp(0.35, 0.65, Math.abs(nz(v))),
    cavities: (v) => ramp(0.06, 0.2, conv(v)),
    'ground-near': (v) => near(v, sc.band),
    // Damp where water lies or collects: low, in creases, on tops; more in wet climates.
    wet: (v) =>
      Math.max(
        near(v, sc.band * (1.5 + sc.damp)),
        ramp(0.06, 0.2, conv(v)),
        ramp(0.3, 0.6, nz(v)),
        sc.damp,
      ),
    fasteners: (v) => spotWeight(sc.fasteners, ...at(v), false),
    'below-fasteners': (v) =>
      spotWeight(sc.fasteners, ...at(v), true) * (1 - ramp(0.5, 0.8, Math.abs(nz(v)))),
    touched: (v) => Math.max(spotWeight(sc.touched, ...at(v), false), sc.touchedMask?.[v] ?? 0),
  };
  const f = point[name] ?? (() => 0);
  for (let v = 0; v < out.length; v++) out[v] = f(v);
  return out;
}

/** Evaluate a selector expression: weights per vertex, 0..1. */
export function select(sc: Scene, where: string): Float32Array {
  const memo = new Map<string, Float32Array>();
  const ev = (n: Node): Float32Array => {
    if (n.op === 'name') {
      const hit = memo.get(n.name);
      if (hit) return hit;
      const w = base(sc, n.name);
      memo.set(n.name, w);
      return w;
    }
    const a = ev(n.a);
    const out = new Float32Array(a.length);
    if (n.op === 'not') {
      for (let i = 0; i < a.length; i++) out[i] = 1 - (a[i] ?? 0);
      return out;
    }
    const b = ev(n.b);
    for (let i = 0; i < a.length; i++)
      out[i] = n.op === 'and' ? Math.min(a[i] ?? 0, b[i] ?? 0) : Math.max(a[i] ?? 0, b[i] ?? 0);
    return out;
  };
  return ev(parseWhere(where));
}
