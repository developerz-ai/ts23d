import { describe, expect, it } from 'bun:test';
import { dmath, type Mesh, stripRect } from '@developerz.ai/ts23d';
import { WOOL } from '../bust/cloth-strips.ts';
import {
  eyeZone,
  onFineStrip,
  onSkin,
  SKIN_FINE,
  SKIN_FRECKLED,
  SKIN_ROW,
  SKIN_STRIP,
  SKIN_STUBBLE,
} from './skin-strip.ts';
import { directionJumps, texelSpread } from './texel-spread.ts';

/** A flat wall facing +X: `n` × `n` quads of `step` metres over y (across) and z (up). */
function wall(n: number, step: number): Mesh {
  const p: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) p.push(0, i * step, j * step);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i;
      idx.push(a, a + 1, a + n + 2, a, a + n + 2, a + n + 1);
    }
  const count = p.length / 3;
  return {
    positions: new Float32Array(p),
    normals: new Float32Array(count * 3).map((_, k) => (k % 3 === 0 ? 1 : 0)),
    uvs: new Float32Array(count * 2),
    colors: new Float32Array(count * 3).fill(1),
    indices: new Uint32Array(idx),
  };
}

/** A 10 cm ball of `edge`-metre quads (latitude rings, every other one turned half a step), two
 *  triangles each: every tilt a head's skin takes against the projection planes. */
function ball(edge: number, band = 1): Mesh {
  const R = 0.1;
  const nu = Math.round((2 * Math.PI * R) / edge);
  const nv = Math.round((Math.PI * R) / edge);
  const p: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i <= nu; i++) {
      const th = (j / nv) * Math.PI;
      const ph = ((i + (j % 2) / 2) / nu) * 2 * Math.PI;
      p.push(
        R * dmath.sin(th) * dmath.cos(ph),
        R * dmath.sin(th) * dmath.sin(ph),
        R * dmath.cos(th),
      );
    }
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i;
      if (Math.abs(p[a * 3 + 2] ?? 0) <= band * R)
        idx.push(a, a + nu + 1, a + 1, a + 1, a + nu + 1, a + nu + 2);
    }
  const count = p.length / 3;
  return {
    positions: new Float32Array(p),
    normals: new Float32Array(count * 3),
    uvs: new Float32Array(count * 2),
    colors: new Float32Array(count * 3).fill(1),
    indices: new Uint32Array(idx),
  };
}

describe('fine strip mapping', () => {
  it('fails on repeating columns (D513): band cells one above another read different texels', () => {
    // One band cell holds ~1 cm of skin; a cheek is many cells tall. The same slice of the row
    // in every cell (mirrored) stacked each freckle and mottle patch into a vertical column.
    const m = onFineStrip(wall(40, 0.002), SKIN_STRIP, SKIN_ROW);
    // Each triangle's U offset (U − y over the row's metres) by the band cell its z-range's middle is in.
    const band = SKIN_ROW * 0.6;
    const r = stripRect(SKIN_STRIP);
    const uOf = new Map<number, number>();
    for (let t = 0; t < m.indices.length; t += 3) {
      const vs = [m.indices[t] ?? 0, m.indices[t + 1] ?? 0, m.indices[t + 2] ?? 0];
      const zs = vs.map((v) => m.positions[v * 3 + 2] ?? 0);
      const z = (Math.min(...zs) + Math.max(...zs)) / 2;
      const v0 = vs[0] ?? 0;
      const off =
        ((m.uvs[v0 * 2] ?? 0) - r.u0) / (r.u1 - r.u0) - (m.positions[v0 * 3 + 1] ?? 0) / r.metres;
      uOf.set(Math.floor(z / band), off - Math.floor(off));
    }
    const us = [...uOf.values()];
    expect(us.length).toBeGreaterThan(5);
    // Distinct stretches of the row, far apart compared to a pore (1 mm of a 1 m row = 0.001).
    const apart = us.flatMap((a, i) => us.slice(i + 1).map((b) => Math.abs(a - b)));
    expect(Math.min(...apart)).toBeGreaterThan(0.01);
  });

  it('fails on uneven texel density (D550): every tilt reads the strip near its painted scale', () => {
    // 7 mm triangles (a LOD0/LOD1 skin): three projection planes left a cheek tilted 45° off
    // its plane reading the pores 1.4× stretched, and a triangle a little taller than a band
    // cell squeezed across the row alone.
    const s = texelSpread(onFineStrip(ball(0.007), SKIN_STRIP, SKIN_ROW), [SKIN_STRIP], SKIN_ROW);
    expect(s.p95).toBeLessThan(1.15);
    expect(s.worst).toBeLessThan(1.2);
  });

  it('fails on smeared large triangles (D550): a far LOD keeps pores round, not streaks', () => {
    // 2.6 cm triangles (a far LOD's cell) are taller than the 16 mm row: squeezed across it
    // alone they streaked 3× along U. Now each keeps its own plane, turned to fit, and shrinks
    // evenly only past the row's reach.
    const s = texelSpread(onFineStrip(ball(0.026), SKIN_STRIP, SKIN_ROW), [SKIN_STRIP], SKIN_ROW);
    expect(s.smear).toBeLessThan(1.1);
    expect(s.p95).toBeLessThan(1.75);
  });

  it('fails on a weave broken into patches (D562): a directional strip keeps its direction', () => {
    // A ball's band up to 37° from level, on the wool: per-triangle choices among 13 planes
    // turned its V direction more than 10° across 5 % of the edges (the knit's rib changed
    // direction triangle by triangle); level planes all share V = world up.
    const m = onFineStrip(ball(0.008, 0.6), WOOL, 1);
    expect(directionJumps(m, [WOOL], 10)).toBeLessThan(0.002);
    // The pores still take every plane (D550 above).
  });

  it('sends each zone to its own strip: shaven beard to the stubble strip, lids to the fine one', () => {
    const m = wall(40, 0.002);
    const uv = onSkin(m, {
      stubble: (p) => (p[2] < 0.03 ? 1 : 0),
      fine: eyeZone({ eye: [-0.01, 0.06, 0.07], r: 0.012 }),
    }).uvs;
    const on = (strip: typeof SKIN_STRIP): number => {
      const r = stripRect(strip);
      let n = 0;
      for (let i = 1; i < uv.length; i += 2) if ((uv[i] ?? 0) >= r.v0 && (uv[i] ?? 0) <= r.v1) n++;
      return n;
    };
    expect(on(SKIN_STUBBLE)).toBeGreaterThan(100);
    expect(on(SKIN_FINE)).toBeGreaterThan(20);
    expect(on(SKIN_STRIP)).toBeGreaterThan(100);
  });

  it('fails on a hard zone edge (D520, D523): a soft zone fades as a density of its triangles', () => {
    // A freckle mask ramping 0 → 1 up a 16 cm wall (2 mm quads): row by row, the share of
    // triangles on the freckled strip follows it; a ½ threshold would jump 0 → 1 in one row.
    const n = 80;
    const m = onSkin(wall(n, 0.002), { freckle: (p) => p[2] / (n * 0.002) });
    const r = stripRect(SKIN_FRECKLED);
    const rows = new Map<number, [number, number]>();
    for (let t = 0; t < m.indices.length; t += 3) {
      const a = m.indices[t] ?? 0;
      const row = Math.floor(((m.positions[a * 3 + 2] ?? 0) + 1e-6) / 0.002);
      const v = m.uvs[a * 2 + 1] ?? 0;
      const [on, all] = rows.get(row) ?? [0, 0];
      rows.set(row, [on + (v >= r.v0 && v <= r.v1 ? 1 : 0), all + 1]);
    }
    const share = (row: number): number => {
      const [on, all] = rows.get(row) ?? [0, 1];
      return on / all;
    };
    const mixed = [...rows.keys()].filter((k) => share(k) > 0.15 && share(k) < 0.85).length;
    expect(mixed).toBeGreaterThan(n / 3);
    expect(share(2)).toBeLessThan(0.15);
    expect(share(n - 3)).toBeGreaterThan(0.85);
  });
});
