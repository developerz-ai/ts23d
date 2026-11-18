// QA `swim`: does a water asset swim like a fish? Every looping clip whose root travels is measured
// off the skeleton (chain-wave.ts) against published kinematics (docs/research/
// swim-and-tentacle-animation.md section 1, sources there). `turn*` clips bend the body on purpose
// and a travelling clip with a still tail is a glide, so both are left alone unless it is `cruise`
// or `burst`, which must beat. Tail-beat frequency is never gated against size: the sources conflict
// (a 2 m mako cruises at half the published slow bound). A radial plan (octopus, hydra) has no body
// wave to read and is skipped.

import type { CompiledAsset } from '../core/index.ts';
import { type BodyChain, bodyChain, type ClipWave, measureWave } from './chain-wave.ts';
import type { Finding, Gate } from './types.ts';

type Band = readonly [number, number];

/** f·App/U, cruising swimmers [TNT03]; 44 species median 0.29 [DS21]. `cruise` only. */
export const STROUHAL: Band = [0.2, 0.4];
/** U/(f·L), body lengths per beat [SR23, W75, T04]. */
export const STRIDE: Band = [0.4, 0.8];
/** U/V, body speed over wave speed; below 1 or there is no thrust [T04, CB94]. */
export const SLIP: Band = [0.5, 0.9];
/** Tail App/L. The floor is the eel's 2 × 0.07 L = 0.14 [T04] less a margin, not the 0.15 of the
 *  research table: that is the [DS21] quartile, and it would fail the eel the same table cites. */
export const TAIL_EXCURSION: Band = [0.13, 0.24];
/** Head ÷ tail excursion: exp(−α) from [T04] to the [DS21] quartile ratios. */
export const HEAD_TO_TAIL: Band = [0.02, 0.35];
/** The largest excursion sits at or behind this arc position [DS21]. */
export const PEAK_AT = 0.9;
/** Peak-to-peak lateral swing of the centre of mass, share of L (design; 2.8 % without recoil). */
export const RECOIL_LIMIT = 0.005;
/** `burst` keeps `cruise`'s excursion and wavelength within this share (design) [DS21, VW91]. */
export const BURST_TOLERANCE = 0.15;

const fmt = (v: number): string => (Number.isFinite(v) ? v.toFixed(3) : String(v));
/** Written so a NaN fails. */
const inside = (v: number, [lo, hi]: Band): boolean => v >= lo && v <= hi;

const finding = (code: string, message: string, fix: string): Finding => ({
  gate: 'swim',
  code,
  message: `${code} ${message}`,
  fix,
});

const tailOf = (w: ClipWave): number => w.excursion.at(-1) ?? 0;

function waveFindings(w: ClipWave, body: BodyChain): Finding[] {
  const out: Finding[] = [];
  const L = body.length;
  const tail = tailOf(w);
  const clip = `clip '${w.clip}'`;
  const band = (code: string, what: string, v: number, range: Band, fix: string): void => {
    if (!inside(v, range))
      out.push(
        finding(code, `${clip}: ${what} ${fmt(v)} is outside ${range[0]}..${range[1]}`, fix),
      );
  };
  if (w.clip === 'cruise')
    band(
      'T3D_QA_SWIM_STROUHAL',
      'Strouhal f·App/U',
      (w.frequency * tail) / w.speed,
      STROUHAL,
      'the tail beats too fast or too slow for the speed: aim for 0.29 by changing root speed or tail-beat frequency',
    );
  band(
    'T3D_QA_SWIM_STRIDE',
    'stride U/(f·L)',
    w.speed / (w.frequency * L),
    STRIDE,
    'set root speed to about 0.7 × frequency × body length; change speed through frequency alone',
  );
  band(
    'T3D_QA_SWIM_TAIL',
    'tail excursion App/L',
    tail / L,
    TAIL_EXCURSION,
    'scale the amplitude envelope until the measured tail swing is about 0.18 L peak to peak',
  );
  band(
    'T3D_QA_SWIM_HEAD',
    'head ÷ tail excursion',
    (w.excursion[0] ?? 0) / tail,
    HEAD_TO_TAIL,
    'use a tail-weighted envelope, A(s) = ½(0.05 − 0.13 s + 0.28 s²) L, and keep the recoil on the root',
  );
  const peak = w.excursion.indexOf(Math.max(...w.excursion));
  if (!((body.s[peak] ?? 0) >= PEAK_AT))
    out.push(
      finding(
        'T3D_QA_SWIM_ENVELOPE',
        `${clip}: the body swings most at s = ${fmt(body.s[peak] ?? 0)}, ahead of s = ${PEAK_AT}`,
        'grow the amplitude toward the tail so its maximum is at the tail tip',
      ),
    );
  if (w.heading !== 'tailward')
    out.push(
      finding(
        'T3D_QA_SWIM_WAVE',
        `${clip}: the body wave is ${w.heading === 'standing' ? 'standing (the stations move together)' : 'running tail to head'}`,
        'make phase fall along the body, y = A(s) sin(2π(s/λ − f t)), with s = 0 at the head',
      ),
    );
  else
    band(
      'T3D_QA_SWIM_SLIP',
      'slip U/V',
      w.speed / (w.frequency * w.wavelength),
      SLIP,
      'the wave must outrun the body: V = f·λ; about one wavelength per body (0.6 L for an eel)',
    );
  if (!(w.recoil <= RECOIL_LIMIT * L))
    out.push(
      finding(
        'T3D_QA_SWIM_RECOIL',
        `${clip}: the centre of mass swings ${fmt((100 * w.recoil) / L)} % of L sideways (limit ${RECOIL_LIMIT * 100} %)`,
        "subtract the chain's mean lateral offset from the root at every key",
      ),
    );
  return out;
}

function burstFindings(cruise: ClipWave, burst: ClipWave): Finding[] {
  const within = (a: number, b: number): boolean => Math.abs(a / b - 1) <= BURST_TOLERANCE;
  const out: Finding[] = [];
  const fix = 'raise only the tail-beat frequency for `burst`; hold amplitude and wavelength';
  if (!within(tailOf(burst), tailOf(cruise)))
    out.push(
      finding(
        'T3D_QA_SWIM_BURST',
        `tail excursion in 'burst' is ${fmt(tailOf(burst) / tailOf(cruise))} × 'cruise' (within ±${BURST_TOLERANCE * 100} %)`,
        fix,
      ),
    );
  if (!within(burst.wavelength, cruise.wavelength))
    out.push(
      finding(
        'T3D_QA_SWIM_BURST',
        `wavelength in 'burst' is ${fmt(burst.wavelength / cruise.wavelength)} × 'cruise' (within ±${BURST_TOLERANCE * 100} %)`,
        fix,
      ),
    );
  return out;
}

export function swimFindings(asset: CompiledAsset): Finding[] {
  const sk = asset.skeleton;
  if (asset.medium !== 'water' || !sk) return [];
  const body = bodyChain(sk);
  if (!body) return [];
  const out: Finding[] = [];
  const read = new Map<string, ClipWave>();
  for (const clip of asset.clips ?? []) {
    if (!clip.loop || clip.name.startsWith('turn')) continue;
    const w = measureWave(sk, body, clip);
    if (!w) continue;
    const named = clip.name === 'cruise' || clip.name === 'burst';
    if (w.frequency > 0) {
      read.set(clip.name, w);
      out.push(...waveFindings(w, body));
    } else if (named)
      out.push(
        finding(
          'T3D_QA_SWIM_BEAT',
          `clip '${clip.name}' travels but the tail does not beat`,
          'drive the spine with a travelling wave; speed comes from the tail, the root only follows',
        ),
      );
  }
  const cruise = read.get('cruise');
  const burst = read.get('burst');
  return cruise && burst ? [...out, ...burstFindings(cruise, burst)] : out;
}

export const swim: Gate = (asset) => swimFindings(asset);
