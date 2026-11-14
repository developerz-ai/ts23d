// `sound.mechanism`: the sounds parts make while they move. creak = wood/metal stick-slip (a slip
// train whose rate follows the motion, each slip ringing the body's modes); squeak = fast tonal
// stick-slip; whine = gear mesh at teeth × shaft rate with shaft sidebands; rattle = random small
// strikes (chain, loose plates); hiss = band-passed noise (hydraulic / pneumatic); clunk = latch
// click then a heavy thud. Looping kinds (whine, rattle, hiss) crossfade into seamless loops.

import { createRng, type SoundClip, Ts23dError } from '../core/index.ts';
import { acousticOf } from './acoustics.ts';
import { checkRange, makeClip, normalize, SAMPLE_RATE, variant } from './clip.ts';
import { adsrAt, biquad, loopify, noise, oscillator, shape } from './dsp.ts';
import { renderStrike, strike } from './impact.ts';

export type MechanismKind = 'creak' | 'squeak' | 'whine' | 'rattle' | 'hiss' | 'clunk';

export interface MechanismOptions {
  readonly kind: MechanismKind;
  /** Acoustic material or strip id: what rings (door wood, hinge steel, chain iron). */
  readonly material: string;
  /** How fast it is driven, 0..1 (default 0.5): slip rate, pitch, pressure. */
  readonly speed?: number;
  /** Seconds (default per kind: creak 1.4, squeak 0.6, whine 2, rattle 1.5, hiss 1.5, clunk 0.5). */
  readonly duration?: number;
  /** whine: shaft rpm (default 800 + 3200 × speed) and gear teeth (default 24). */
  readonly rpm?: number;
  readonly teeth?: number;
  /** Render as a seamless loop (default true for whine, rattle, hiss). */
  readonly loop?: boolean;
  readonly seed?: number;
  readonly name?: string;
}

const LENGTH: Readonly<Record<MechanismKind, number>> = {
  creak: 1.4,
  squeak: 0.6,
  whine: 2,
  rattle: 1.5,
  hiss: 1.5,
  clunk: 0.5,
};
const LOOPS: ReadonlySet<MechanismKind> = new Set(['whine', 'rattle', 'hiss']);
const FADE = 0.12;

export function mechanism(o: MechanismOptions): SoundClip {
  if (!(o.kind in LENGTH))
    throw new Ts23dError('T3D_AUDIO_INVALID', {
      cause: `sound.mechanism kind '${o.kind}' is unknown`,
      fix: `use one of ${Object.keys(LENGTH).join(', ')}`,
    });
  const a = acousticOf(o.material);
  const speed = checkRange('mechanism speed', o.speed ?? 0.5, 0, 1, 'speed: 0.5');
  const seconds = checkRange(
    'mechanism duration (s)',
    o.duration ?? LENGTH[o.kind],
    0.05,
    30,
    'duration: 1',
  );
  const loop = o.loop ?? LOOPS.has(o.kind);
  const seed = o.seed ?? 1;
  const rng = createRng(seed);
  const n = Math.round((seconds + (loop ? FADE : 0)) * SAMPLE_RATE);
  const t = (i: number): number => i / SAMPLE_RATE;
  // A swell over the clip for one-shots (a door opening speeds up, then slows to a stop).
  const swell = (u: number): number =>
    loop ? 1 : Math.sin(Math.PI * Math.min(1, u / seconds)) ** 0.6;
  let out: Float32Array = new Float32Array(n);
  if (o.kind === 'creak') {
    // Each slip rings a panel of the material: a 0.4 m plate (door, crate lid, floorboard).
    let at = 0;
    while (at < n) {
      const s = swell(t(at));
      const st = strike(a, 'plate', 0.4, 0.022, 0.2, 0.4 + 0.6 * s, rng);
      renderStrike(out, st, at, s * rng.range(0.5, 1), seed + at);
      const rate = (25 + 70 * speed) * (0.5 + s) * rng.range(0.8, 1.2);
      at += Math.max(1, Math.round(SAMPLE_RATE / rate));
    }
  } else if (o.kind === 'squeak') {
    const f = 650 + 1100 * speed;
    const wobble = rng.range(4, 8);
    out = oscillator(
      n,
      'saw',
      (i) => f * (1 + 0.04 * Math.sin(2 * Math.PI * wobble * t(i))) * (0.85 + 0.3 * swell(t(i))),
    );
    out = biquad(biquad(out, 'bandpass', f * 2, 1.2), 'peak', f * 3.1, 3, 6);
    shape(out, swell);
  } else if (o.kind === 'whine') {
    const rps = checkRange('whine rpm', o.rpm ?? 800 + 3200 * speed, 30, 30000, 'rpm: 1500') / 60;
    const teeth = checkRange('whine teeth', o.teeth ?? 24, 4, 400, 'teeth: 24');
    const mesh = rps * teeth;
    const carrier = oscillator(n, 'sine', () => mesh);
    const second = oscillator(n, 'sine', () => mesh * 2);
    const shaft = oscillator(n, 'sine', () => rps);
    const hum = biquad(noise(n, seed), 'bandpass', mesh, 8);
    for (let i = 0; i < n; i++)
      out[i] =
        ((carrier[i] ?? 0) + 0.35 * (second[i] ?? 0)) * (1 + 0.3 * (shaft[i] ?? 0)) +
        2 * (hum[i] ?? 0);
  } else if (o.kind === 'rattle') {
    // Links / loose plates: small strikes at a Poisson-ish rate, each its own size.
    let at = 0;
    const rate = 10 + 50 * speed;
    while (at < n) {
      const st = strike(
        a,
        'block',
        rng.range(0.015, 0.05),
        rng.range(0.004, 0.01),
        0.05,
        rng.range(0.3, 1),
        rng,
      );
      renderStrike(out, st, at, rng.range(0.3, 1), seed + at);
      at += Math.max(1, Math.round((-Math.log(1 - rng.next()) / rate) * SAMPLE_RATE));
    }
  } else if (o.kind === 'hiss') {
    const centre = 1800 + 5000 * speed;
    const ring = strike(a, 'bar', 0.3, 0.02, 0.5, 0.5, rng).modes[0]?.freq ?? 900;
    out = biquad(biquad(noise(n, seed), 'bandpass', centre, 0.7), 'highpass', 400, 0.7);
    out = biquad(out, 'peak', ring, 6, 5);
    if (!loop)
      shape(out, (u) =>
        adsrAt({ attack: 0.04, decay: 0.1, sustain: 0.8, release: 0.25 }, u, seconds - 0.25),
      );
  } else {
    // clunk: the latch tongue clicks home, then the leaf / lid lands ~40 ms later.
    const click = strike(a, 'block', 0.02, 0.006, 0.05, 0.9, rng);
    const thud = strike(a, 'plate', 0.35, 0.02, 4, 0.5 + 0.5 * speed, rng);
    renderStrike(out, click, 0, 0.5, seed);
    renderStrike(out, thud, Math.round(rng.range(0.03, 0.05) * SAMPLE_RATE), 1, seed + 3);
    shape(out, (u) => Math.max(0, 1 - u / seconds) ** 0.5);
  }
  if (loop) out = loopify(out, Math.round(FADE * SAMPLE_RATE));
  normalize(out, 0.8);
  // rpm's default follows speed; whine reads rpm / teeth, other kinds ignore them.
  const whine = o.kind === 'whine';
  const name =
    `${o.kind}_${a.id}` +
    variant([
      ['speed', speed, 0.5],
      ['dur', seconds, LENGTH[o.kind]],
      ['rpm', whine ? (o.rpm ?? 0) : 0, 0],
      ['teeth', whine ? (o.teeth ?? 24) : 24, 24],
      ['loop', Number(loop), Number(LOOPS.has(o.kind))],
      ['seed', seed, 1],
    ]);
  return makeClip(o.name ?? name, out, loop);
}
