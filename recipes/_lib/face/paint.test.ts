import { describe, expect, it } from 'bun:test';
import { createRng, dmath, stripRect, type Vec3 } from '@developerz.ai/ts23d';
import { necklineCurve } from './collar.ts';
import { necklineOf } from './garment.ts';
import { faceHead } from './head.ts';
import { LEFT, MIDLINE } from './landmarks.ts';
import { paintSkin, type SkinWear } from './paint.ts';
import { quadToMesh, stripUv } from './quad.ts';
import { onSkin, SKIN_MATTE, SKIN_STRIP, scalpZone } from './skin-strip.ts';
import { HUMAN, type SkinTone } from './spec.ts';

const tone: SkinTone = {
  base: [0.66, 0.45, 0.33],
  flush: [0.74, 0.38, 0.31],
  lips: [0.6, 0.3, 0.27],
  cool: [0.52, 0.42, 0.42],
  cavity: [0.3, 0.17, 0.13],
};
const head = faceHead(
  { race: HUMAN, age: 0, weight: 0, asym: 0, tone, eyes: { iris: [0.3, 0.4, 0.5] } },
  createRng(1),
);
const s = head.scale;
const P = head.mesh.p;
/** The base vertex nearest a base-head point. */
const vertexAt = (q: Vec3): number => {
  const t = head.map(q);
  let best = 0;
  let bd = Number.POSITIVE_INFINITY;
  for (let v = 0; v < P.length / 3; v++) {
    const d = dmath.hypot(
      (P[v * 3] ?? 0) - t[0],
      (P[v * 3 + 1] ?? 0) - t[1],
      (P[v * 3 + 2] ?? 0) - t[2],
    );
    if (d < bd) {
      bd = d;
      best = v;
    }
  }
  return best;
};
const paint = (t: SkinTone, wear?: SkinWear) =>
  paintSkin(head.mesh, head, {
    tone: t,
    brows: [0.2, 0.12, 0.08],
    rng: createRng(3),
    far: true,
    ...(wear ? { wear } : {}),
  });

describe('face skin paint', () => {
  it('fails on rouge circles (D486): the cheek flush is faint and follows the cheekbone to the nose', () => {
    // The flush's weight per vertex: the paint with a pure red flush against one with none.
    const red = paint({ ...tone, flush: [1, 0, 0] });
    const none = paint({ ...tone, flush: tone.base });
    const w = (q: Vec3): number => {
      const v = vertexAt(q);
      return ((red(v)[0] ?? 0) - (none(v)[0] ?? 0)) / (1 - (none(v)[0] ?? 0) || 1);
    };
    const apple = w(LEFT.cheek);
    const reach = dmath.hypot(LEFT.cheek[1] - LEFT.alare[1], LEFT.cheek[2] - LEFT.alare[2]);
    // Toward the nose's wing and the same distance straight down toward the jaw.
    const along = w([
      (LEFT.cheek[0] + LEFT.alare[0]) / 2,
      LEFT.cheek[1] - (LEFT.cheek[1] - LEFT.alare[1]) * 0.75,
      LEFT.cheek[2] - (LEFT.cheek[2] - LEFT.alare[2]) * 0.75,
    ]);
    const down = w([LEFT.cheek[0] - 0.004, LEFT.cheek[1], LEFT.cheek[2] - reach * 0.75]);
    expect(apple).toBeGreaterThan(0.1);
    // (Measured through the paint's chroma lift; the old blob's 0.85 measured ≈ 1.)
    expect(apple).toBeLessThan(0.7);
    // A round blob is as strong down the cheek as along the flush's path.
    expect(down).toBeLessThan(along * 0.7);
  });

  it('fails on a wormy stubble wash (D514): near, the jaw takes an even shadow; the strip draws the hairs', () => {
    // Vertex dots 2 mm across on a 3 mm mesh read as a grey-violet worm pattern (grime), not as
    // stubble: the cut hairs are the stubble strip's dots (./skin-texture.ts), the vertex colour
    // only the even shadow under them.
    const region = (p: Vec3): number =>
      p[2] < head.map(MIDLINE.subnasale)[2] - 0.01 * s ? -0.01 : 0.01;
    const c = paintSkin(head.mesh, head, {
      tone,
      brows: [0.2, 0.12, 0.08],
      rng: createRng(3),
      wear: {
        sun: 0,
        freckles: 0,
        grime: 0,
        stubble: { region, colour: [0.15, 0.11, 0.08], amount: 0.8 },
      },
    });
    const bare = paintSkin(head.mesh, head, {
      tone,
      brows: [0.2, 0.12, 0.08],
      rng: createRng(3),
      wear: { sun: 0, freckles: 0, grime: 0 },
    });
    const lum = (k: Vec3): number => (k[0] + k[1] + k[2]) / 3;
    // How much the stubble darkens each jaw vertex, relative to its bare colour.
    const ks: number[] = [];
    const jaw = head.map(LEFT.jawline);
    for (let v = 0; v < P.length / 3; v++) {
      const q: Vec3 = [P[v * 3] ?? 0, P[v * 3 + 1] ?? 0, P[v * 3 + 2] ?? 0];
      if (dmath.hypot(q[0] - jaw[0], q[1] - jaw[1], q[2] - jaw[2]) > 0.025 * s) continue;
      ks.push(lum(c(v)) / lum(bare(v)));
    }
    const mean = ks.reduce((a, b) => a + b, 0) / ks.length;
    const sd = Math.sqrt(ks.reduce((a, b) => a + (b - mean) * (b - mean), 0) / ks.length);
    expect(ks.length).toBeGreaterThan(10);
    expect(mean).toBeLessThan(0.85);
    // (The vertex dots measured 0.09; mottle and curvature on an even shadow ≈ 0.03.)
    expect(sd).toBeLessThan(0.045);
  });

  it('fails if a shaven jaw reads clean: stubble darkens the jaw, never the forehead', () => {
    const lum = (c: Vec3): number => (c[0] + c[1] + c[2]) / 3;
    const bare = paint(tone, { sun: 0, freckles: 0, grime: 0 });
    const beard = paint(tone, {
      sun: 0,
      freckles: 0,
      grime: 0,
      stubble: {
        region: (p) => (p[2] < head.map(MIDLINE.subnasale)[2] - 0.01 * s ? -0.01 : 0.01),
        colour: [0.15, 0.12, 0.12],
        amount: 0.8,
      },
    });
    const jaw = vertexAt([LEFT.jawline[0] + 0.02, LEFT.jawline[1], LEFT.jawline[2]]);
    const brow = vertexAt(MIDLINE.forehead);
    expect(lum(beard(jaw))).toBeLessThan(lum(bare(jaw)) * 0.75);
    expect(beard(brow)).toEqual(bare(brow));
  });
});

describe('collar and scalp', () => {
  it('fails on a stair-stepped neckline (D477): the collar follows one smooth closed curve', () => {
    const skin = quadToMesh(head.mesh, () => tone.base, stripUv('plain'));
    const line = necklineOf(head, { cloth: [0.3, 0.2, 0.1], trim: [0.2, 0.2, 0.2] });
    const nape = head.map(MIDLINE.nape);
    const throat = head.map(MIDLINE.throat);
    const { p } = necklineCurve(skin, {
      line,
      centre: -0.003 * s,
      axisX: (nape[0] + throat[0]) / 2,
      segments: 128,
    });
    expect(p.length).toBe(128);
    let worst = 0;
    for (let i = 0; i < p.length; i++) {
      const a = p[(i + p.length - 1) % p.length] ?? [0, 0, 0];
      const b = p[i] ?? a;
      const c = p[(i + 1) % p.length] ?? b;
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
      const lu = dmath.hypot(u[0] ?? 0, u[1] ?? 0, u[2] ?? 0) || 1;
      const lv = dmath.hypot(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0) || 1;
      const cos =
        ((u[0] ?? 0) * (v[0] ?? 0) + (u[1] ?? 0) * (v[1] ?? 0) + (u[2] ?? 0) * (v[2] ?? 0)) /
        (lu * lv);
      worst = Math.max(worst, dmath.acos(Math.min(1, Math.max(-1, cos))));
      // On the neckline's band, a few millimetres either side of its level.
      expect(Math.abs(line(b) + 0.003 * s)).toBeLessThan(0.008 * s);
    }
    // A zigzag between vertices turns by tens of degrees from one sample to the next.
    expect((worst * 180) / Math.PI).toBeLessThan(30);
  });

  it('fails on wet hot spots on a bald dome (D479): the scalp goes onto the matte strip', () => {
    const fh = head.map(MIDLINE.forehead);
    const gl = head.map(MIDLINE.glabella);
    const zone = scalpZone({
      forehead: [(fh[0] + gl[0]) / 2, 0, (fh[2] + gl[2]) / 2],
      tragion: head.map(LEFT.tragion),
    });
    expect(zone(head.map(MIDLINE.crown))).toBe(1);
    expect(zone(head.map(MIDLINE.occiput))).toBe(1);
    expect(zone(head.map(MIDLINE.glabella))).toBe(0);
    expect(zone(head.map(LEFT.cheek))).toBe(0);
    const skin = quadToMesh(head.mesh, () => tone.base, stripUv('plain'));
    const uv = onSkin(skin, { matte: zone }).uvs;
    const on = (strip: typeof SKIN_MATTE): number => {
      const r = stripRect(strip);
      let n = 0;
      for (let i = 1; i < uv.length; i += 2) if ((uv[i] ?? 0) >= r.v0 && (uv[i] ?? 0) <= r.v1) n++;
      return n;
    };
    expect(on(SKIN_MATTE)).toBeGreaterThan(100);
    expect(on(SKIN_STRIP)).toBeGreaterThan(100);
  });
});

describe('stubble and lids (D521, D523)', () => {
  const lum = (k: Vec3): number => (k[0] + k[1] + k[2]) / 3;
  const region = (p: Vec3): number => p[2] - (head.map(MIDLINE.subnasale)[2] - 0.01 * s);
  const near = (wear: SkinWear) =>
    paintSkin(head.mesh, head, { tone, brows: [0.2, 0.12, 0.08], rng: createRng(3), wear });

  it('fails on a tan under-wash (D523): a shaven beard is a faint shade, its hairs the strip dots', () => {
    const bare = near({ sun: 0, freckles: 0, grime: 0 });
    const shaven = near({
      sun: 0,
      freckles: 0,
      grime: 0,
      stubble: { region, colour: [0.15, 0.11, 0.08], amount: 0.8, wash: 0.22, feather: 0.02 },
    });
    const jaw = vertexAt([LEFT.jawline[0] + 0.02, LEFT.jawline[1], LEFT.jawline[2]]);
    const k = lum(shaven(jaw)) / lum(bare(jaw));
    expect(k).toBeGreaterThan(0.85);
    expect(k).toBeLessThan(0.98);
  });

  it('fails on brown eye shadow (D521): no brow paint on the upper lid', () => {
    const elf: SkinTone = {
      base: [0.76, 0.58, 0.47],
      flush: [0.8, 0.47, 0.43],
      lips: [0.66, 0.34, 0.35],
      cool: [0.6, 0.52, 0.57],
      cavity: [0.38, 0.25, 0.23],
    };
    const opts = { tone: elf, rng: createRng(3) };
    // The same paint with golden brows and with brows the skin's own colour: the difference is
    // where the brow paint went.
    const gold = paintSkin(head.mesh, head, { ...opts, brows: [0.52, 0.36, 0.15] });
    const none = paintSkin(head.mesh, head, { ...opts, brows: elf.base });
    const eye = head.map(LEFT.eye);
    // The upper lid just above its margin (the lashes are their own colour now).
    const lid = head.map(LEFT.upperLid)[2];
    let under = 0;
    let worst = 0;
    for (let v = 0; v < P.length / 3; v++) {
      const q: Vec3 = [P[v * 3] ?? 0, P[v * 3 + 1] ?? 0, P[v * 3 + 2] ?? 0];
      if (q[0] < eye[0] + 0.01 * s || Math.abs(q[1] - eye[1]) > 0.016 * s) continue;
      if (q[2] < lid + 0.001 * s || q[2] > lid + 0.003 * s) continue;
      under++;
      const a = gold(v);
      const b = none(v);
      worst = Math.max(worst, Math.abs(a[2] - b[2]) / b[2]);
    }
    expect(under).toBeGreaterThan(1);
    expect(worst).toBeLessThan(0.15);
  });
});
