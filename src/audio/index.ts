// Public API of @developerz.ai/ts23d/audio: deterministic, dependency-free sound for assets.
// `sound.impact` (modal synthesis from material + size), `sound.engine` (seamless piston-engine
// loops), `sound.mechanism` (creak, squeak, whine, rattle, hiss, clunk), `sound.ui` (sfxr-style),
// 16-bit PCM WAV encoding, and clip measurements for tests. Clips attach to assets with
// `ctx.emitter(name, { kind: 'sound', clip })` or a moving part's `sound: { onMotion: clip }`.

import { engine } from './engine.ts';
import { impact } from './impact.ts';
import { mechanism } from './mechanism.ts';
import { ui } from './ui.ts';

export { ACOUSTICS, type Acoustic, type AcousticMaterial, acousticOf } from './acoustics.ts';
export { magnitudeAt, peakFrequency, rms, seamJump } from './analyze.ts';
export { durationOf, SAMPLE_RATE } from './clip.ts';
export { type EngineOptions, firingFrequency } from './engine.ts';
export type { ImpactOptions, ImpactShape } from './impact.ts';
export type { MechanismKind, MechanismOptions } from './mechanism.ts';
export type { UiKind, UiOptions } from './ui.ts';
export { encodeWav, readWavHeader } from './wav.ts';

/** The sound generators: every call is a pure function of its options (same options, same clip). */
export const sound = { impact, engine, mechanism, ui } as const;
