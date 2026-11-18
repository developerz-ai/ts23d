// The bluefin against its sources: proportions as percentages of fork length measured on the compiled
// mesh, finlet rows, and the swim numbers read off the baked clips. `bun test recipes/bluefin_tuna`.

import { describe, expect, it } from 'bun:test';
import { compile, type Mesh, swimFindings, triangleCount } from '@developerz.ai/ts23d';
import { bodyChain, measureWave } from '../../src/qa/chain-wave.ts';
import { bluefin_tuna, CLIPS, PLAN } from './bluefin_tuna.ts';
import { finlets, pectoralTip } from './fins.ts';
import { FL, plainPoint, topZ, xOf, Z0 } from './shape.ts';

const lod0 = compile(bluefin_tuna, { lod: 0 });
const mesh = (name: string): Mesh => {
  const m = lod0.parts.find((p) => p.name === name)?.mesh;
  if (!m) throw new Error(`no part ${name}`);
  return m;
};
const span = (m: Mesh, k: 0 | 1 | 2): number => {
  let [lo, hi] = [Infinity, -Infinity];
  for (let i = k; i < m.positions.length; i += 3) {
    const v = m.positions[i] ?? 0;
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  return hi - lo;
};
const maxOf = (m: Mesh, k: 0 | 1 | 2): number => {
  let hi = -Infinity;
  for (let i = k; i < m.positions.length; i += 3) hi = Math.max(hi, m.positions[i] ?? 0);
  return hi;
};
const percent = (v: number): number => (100 * v) / FL;
/** Least dip that counts as the groove (metres of skin) and as its painted line (summed colour). */
const GROOVE_DEPTH = 0.0015;
const LINE_DEPTH = 0.4;

interface FlankSample {
  readonly x: number;
  /** Half-width of the skin here, metres: a groove is a dip in it. */
  readonly y: number;
  /** Summed linear colour: the painted groove line is a dip in it. */
  readonly light: number;
}

/** The compiled skin's +Y flank column at the body axis, snout side first, over the gill region. */
function flankColumn(m: Mesh): FlankSample[] {
  const snout = maxOf(m, 0);
  const out: FlankSample[] = [];
  for (let v = 0; v < m.positions.length / 3; v++) {
    const [x, y, z] = [
      m.positions[v * 3] ?? 0,
      m.positions[v * 3 + 1] ?? 0,
      m.positions[v * 3 + 2] ?? 0,
    ];
    const back = (snout - x) / FL;
    if (y <= 0 || Math.abs(z - Z0) > 0.002 || back < 0.15 || back > 0.34) continue;
    const c = [m.colors[v * 3] ?? 0, m.colors[v * 3 + 1] ?? 0, m.colors[v * 3 + 2] ?? 0];
    out.push({ x, y, light: (c[0] ?? 0) + (c[1] ?? 0) + (c[2] ?? 0) });
  }
  return out.sort((a, b) => b.x - a.x);
}

/** X of the rearmost dip in `value` deeper than `depth` against the samples `reach` metres away. */
function rearmostDip(
  column: readonly FlankSample[],
  value: (s: FlankSample) => number,
  depth: number,
  reach = 0.03,
): number | null {
  const near = (x: number): number => {
    let best = column[0];
    for (const s of column) if (best && Math.abs(s.x - x) < Math.abs(best.x - x)) best = s;
    return best ? value(best) : 0;
  };
  // Only where both comparison points exist: at the window's ends a taper would read as a dip.
  const [front, rear] = [column[0]?.x ?? 0, column.at(-1)?.x ?? 0];
  const dips = column.map((s) => ({
    x: s.x,
    dip:
      s.x + reach > front || s.x - reach < rear
        ? -Infinity
        : (near(s.x + reach) + near(s.x - reach)) / 2 - value(s),
  }));
  let found: number | null = null;
  dips.forEach((d, i) => {
    const [a, b] = [dips[i - 1]?.dip ?? -Infinity, dips[i + 1]?.dip ?? -Infinity];
    if (d.dip >= depth && d.dip >= a && d.dip >= b) found = d.x;
  });
  return found;
}

/** The gill cover's rear edge on the compiled skin: carved groove and painted line must agree. */
function gillCoverX(m: Mesh): number {
  const column = flankColumn(m);
  const carved = rearmostDip(column, (s) => s.y, GROOVE_DEPTH);
  const painted = rearmostDip(column, (s) => s.light, LINE_DEPTH);
  if (carved === null || painted === null)
    throw new Error(`no gill cover on the flank (groove ${carved}, line ${painted})`);
  expect(Math.abs(carved - painted)).toBeLessThan(0.012);
  return carved;
}
const FIN_ROOT = 0.018;
const inside = (v: number, lo: number, hi: number): void => {
  expect(v).toBeGreaterThanOrEqual(lo);
  expect(v).toBeLessThanOrEqual(hi);
};

describe('proportions, % of fork length (FAO synopsis 62)', () => {
  it('body depth 24 to 28', () => inside(percent(span(mesh('body'), 2)), 24, 28));
  it('head 23 to 26, snout to gill cover on the compiled body', () => {
    const body = mesh('body');
    inside(percent(maxOf(body, 0) - gillCoverX(body)), 23, 26);
  });
  // A fin's mesh runs SINK below the skin at its root: what shows is the span without it.
  it('second dorsal 14 to 17', () => {
    inside(percent(span(mesh('fin_dorsal_2'), 2) - FIN_ROOT), 14, 17);
  });
  it('anal 13 to 16', () => inside(percent(span(mesh('fin_anal'), 2) - FIN_ROOT), 13, 16));
  it('first dorsal stands 11', () => {
    const top = span(mesh('fin_dorsal_1'), 2);
    expect(percent(top)).toBeGreaterThan(10);
    expect(percent(top)).toBeLessThan(13.5);
  });
  it('pectoral 16 to 19, short of the second dorsal', () => {
    const root = plainPoint(0.262, 1.62);
    const tip = pectoralTip(1);
    const length = Math.hypot(root[0] - tip[0], root[1] - 0.02 - tip[1], root[2] - tip[2]);
    inside(percent(length), 16, 19);
    expect(tip[0]).toBeGreaterThan(xOf(0.5));
  });
  it('keeps the back above the axis at the first dorsal', () => {
    expect(topZ(0.3)).toBeGreaterThan(plainPoint(0.3, Math.PI / 2)[2]);
  });
});

describe('detail by LOD', () => {
  it('has nine dorsal and eight anal finlets up close, none at LOD2', () => {
    expect(finlets(0).length).toBe(17);
    expect(finlets(2).length).toBe(0);
  });
  it('keeps LOD2 to a few hundred triangles', () => {
    const c = compile(bluefin_tuna, { lod: 2 });
    expect(c.parts.reduce((t, p) => t + (p.mesh ? triangleCount(p.mesh) : 0), 0)).toBeLessThan(560);
  });
});

describe('swimming', () => {
  const sk = { bones: PLAN.bones };
  const body = bodyChain(sk);
  if (!body) throw new Error('no body chain');
  const wave = (name: string) => {
    const c = CLIPS.find((x) => x.name === name);
    const w = c && measureWave(sk, body, c);
    if (!w) throw new Error(`${name} does not travel`);
    return w;
  };

  it('passes the swim gate', () => {
    expect(swimFindings(lod0).map((f) => f.message)).toEqual([]);
  });
  it('holds the head still against the tail', () => {
    const w = wave('cruise');
    expect((w.excursion[0] ?? 1) / (w.excursion.at(-1) ?? 1)).toBeLessThan(0.35);
  });
  it('cruises inside the measured giant-bluefin tail-beat band', () => {
    const w = wave('cruise');
    inside(w.frequency, 0.8, 1.0);
    inside(w.speed / (w.frequency * body.length), 0.6, 0.8);
  });
  it('bursts faster on the same wave', () => {
    const [c, b] = [wave('cruise'), wave('burst')];
    expect(b.frequency / c.frequency).toBeGreaterThan(3);
    expect(b.wavelength / c.wavelength).toBeCloseTo(1, 0);
  });
  it('has no bite: a tuna has no protruding jaw clip here', () => {
    expect(CLIPS.some((c) => c.name === 'bite')).toBe(false);
  });
});
