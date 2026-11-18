// The shark against its sources: sourced dimensions on the compiled mesh, the published swim numbers
// measured off the baked clips, and the jaw order of the bite. `bun test recipes/great_white`.

import { describe, expect, it } from 'bun:test';
import {
  compile,
  createRng,
  type Mesh,
  merge,
  swimFindings,
  triangleCount,
} from '@developerz.ai/ts23d';
import { bodyChain, measureWave } from '../../src/qa/chain-wave.ts';
import { clipPose, jointWorlds } from '../../src/qa/clip-pose.ts';
import {
  arcX,
  GILLS,
  gillField,
  L,
  MOUTH,
  T_DORSAL,
  T_PECTORAL,
  topZ,
  undersideZ,
  X_MOUTH,
  xOf,
} from './anatomy.ts';
import { DORSAL, PECTORAL, pectoralRoot, pectoralTip } from './fins.ts';
import { CLIPS, CRUISE_HZ, great_white, PLAN } from './great_white.ts';
import { REST_GAPE } from './jaws.ts';
import { PORE_COUNT, SCAR_COUNT, scars } from './skin-detail.ts';
import { faceDetail } from './trunk.ts';

const lod0 = compile(great_white, { lod: 0 });
const mesh = (name: string): Mesh => {
  const m = lod0.parts.find((p) => p.name === name)?.mesh;
  if (!m) throw new Error(`no part ${name}`);
  return m;
};
const span = (m: Mesh, k: 0 | 1 | 2): [number, number] => {
  let [lo, hi] = [Infinity, -Infinity];
  for (let i = k; i < m.positions.length; i += 3) {
    const v = m.positions[i] ?? 0;
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  return [lo, hi];
};
const near = (v: number, want: number, tol: number): void => {
  expect(Math.abs(v / want - 1)).toBeLessThan(tol);
};
const clip = (name: string) => {
  const c = CLIPS.find((x) => x.name === name);
  if (!c) throw new Error(`no clip ${name}`);
  return c;
};
const sk = { bones: PLAN.bones };

describe('sourced dimensions', () => {
  it('is 4.5 m from snout to upper caudal tip', () => {
    const all = lod0.parts.flatMap((p) => (p.mesh ? [span(p.mesh, 0)] : []));
    near(Math.max(...all.map((s) => s[1])) - Math.min(...all.map((s) => s[0])), L, 0.01);
  });

  it('has the drone-measured body width', () => {
    const [lo, hi] = span(mesh('body'), 1);
    near(hi - lo, (0.197 * 450 - 4.84) / 100, 0.02);
  });

  it('stands the first dorsal its height above the back, over the pectoral rear', () => {
    near(span(mesh('dorsal_fin'), 2)[1] - topZ(T_DORSAL + 0.3 / L), DORSAL.height, 0.02);
    // Compagno: the origin sits over the pectoral's inner margin, root rear to free tip.
    expect(xOf(T_DORSAL)).toBeLessThan(pectoralRoot(1, T_PECTORAL + 0.09)[0]);
    expect(xOf(T_DORSAL)).toBeGreaterThan(pectoralTip(1)[0]);
  });

  it('gives the pectoral its leading-edge length', () => {
    const [a, b] = [pectoralRoot(1, T_PECTORAL), pectoralTip(1)];
    near(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), PECTORAL.margin, 0.05);
  });

  it('cuts exactly five gill slits into the flank', () => {
    let count = 0;
    let inside = false;
    for (let t = 0.1; t < 0.33; t += 0.0005) {
      const on = gillField(t, Math.PI / 2).slit > 0.5;
      if (on && !inside) count++;
      inside = on;
    }
    expect(count).toBe(GILLS.length);
    expect(count).toBe(5);
  });

  it('keeps LOD2 to a few hundred triangles', () => {
    const c = compile(great_white, { lod: 2 });
    const n = c.parts.reduce((t, p) => t + (p.mesh ? triangleCount(p.mesh) : 0), 0);
    expect(n).toBeLessThan(700);
  });
});

describe('close-up detail', () => {
  const rng = (): ReturnType<typeof createRng> => createRng(7);

  it('puts the ampullae, nostrils and scars at LOD0 only', () => {
    expect(faceDetail(0, rng()).length).toBeGreaterThan(PORE_COUNT);
    expect(faceDetail(2, rng()).length).toBe(0);
    expect(scars(rng()).length).toBeGreaterThanOrEqual(SCAR_COUNT);
    const far = compile(great_white, { lod: 2 }).parts.find((p) => p.name === 'body')?.mesh;
    expect(far ? triangleCount(far) : Infinity).toBeLessThan(triangleCount(mesh('body')) / 50);
  });

  it('places the same scars and pores every build', () => {
    const a = merge(scars(rng()));
    const b = merge(scars(rng()));
    expect([...a.positions]).toEqual([...b.positions]);
  });

  it('shows the upper teeth below the lip with the mouth at rest', () => {
    expect(span(mesh('jaw_upper'), 2)[0]).toBeLessThan(undersideZ(arcX(0), 0) - 0.01);
  });

  it('rests the lower jaw a little open', () => {
    expect(REST_GAPE).toBeGreaterThan(0);
    expect(span(mesh('jaw_lower'), 2)[0]).toBeLessThan(undersideZ(X_MOUTH - 0.12, 0) - 0.02);
  });
});

describe('swimming', () => {
  const body = bodyChain(sk);
  if (!body) throw new Error('no body chain');
  const wave = (name: string) => {
    const w = measureWave(sk, body, clip(name));
    if (!w) throw new Error(`${name} does not travel`);
    return w;
  };

  it('passes the swim gate', () => {
    expect(swimFindings(lod0).map((f) => f.message)).toEqual([]);
  });

  it('cruises at the white shark tail-beat frequency with a thrust-producing wave', () => {
    const w = wave('cruise');
    near(w.frequency, CRUISE_HZ, 0.03);
    const tail = w.excursion.at(-1) ?? 0;
    const st = (w.frequency * tail) / w.speed;
    expect(st).toBeGreaterThan(0.24);
    expect(st).toBeLessThan(0.35);
    expect(w.heading).toBe('tailward');
    expect(w.speed / (w.frequency * w.wavelength)).toBeLessThan(0.9);
  });

  it('bursts by frequency alone', () => {
    const [c, b] = [wave('cruise'), wave('burst')];
    expect(b.frequency / c.frequency).toBeGreaterThan(3);
    near((b.excursion.at(-1) ?? 0) / (c.excursion.at(-1) ?? 1), 1, 0.15);
  });

  it('ships every swim clip and turns both ways', () => {
    expect(CLIPS.map((c) => c.name).sort()).toEqual(
      ['bite', 'burst', 'cruise', 'cstart_l', 'cstart_r', 'idle', 'turn_l', 'turn_r'].sort(),
    );
  });
});

describe('bite', () => {
  const c = clip('bite');
  const sample = (n: number) => Array.from({ length: n + 1 }, (_, i) => (i / n) * c.seconds);
  const jawDrop = (t: number): number => {
    const w = jointWorlds(sk, clipPose(c, t));
    const [jaw, head] = [w.get('jaw_lower_0'), w.get('spine_0')];
    if (!jaw || !head) throw new Error('missing joints');
    const q = jaw.rot;
    return 2 * Math.atan2(Math.hypot(q[0], q[1], q[2]), Math.abs(q[3]));
  };
  const slide = (t: number): number => clipPose(c, t).translation.get('jaw_upper_0')?.[0] ?? 0;

  it('throws the upper jaw forward while the mouth is closing', () => {
    const ts = sample(240);
    const gape = ts.map(jawDrop);
    const out = ts.map(slide);
    const tGape = ts[gape.indexOf(Math.max(...gape))] ?? 0;
    const tOut = ts[out.indexOf(Math.max(...out))] ?? 0;
    expect(Math.max(...out)).toBeGreaterThan(0.1);
    expect(tOut).toBeGreaterThan(tGape);
  });

  it('keeps the protrusion inside the published bound', () => {
    expect(Math.max(...sample(240).map(slide))).toBeLessThan(0.3 * 0.24 * L);
  });

  it('seats the jaw inside the mouth arc at rest', () => {
    const [lo, hi] = span(mesh('jaw_lower'), 1);
    expect(hi - lo).toBeLessThan(2 * MOUTH.half + 0.01);
  });
});
