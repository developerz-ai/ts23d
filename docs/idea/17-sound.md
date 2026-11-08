# Sound: what the asset sounds like

An asset is named, pivoted and moving; it should also be heard. A struck bell rings at the pitch
its size and metal give it, a door creaks while it swings, an engine idles at its firing rate.
`/audio` synthesises these from the same facts the recipe already states (material, size,
cylinders, rpm), with no samples, no dependencies and no account: same options, same WAV bytes.

## The API

```ts
import { sound } from '@developerz.ai/ts23d';

const bell = sound.impact({ material: 'steel', shape: 'hollow', size: 0.3 });   // modal synthesis
const idle = sound.engine({ cylinders: 10, rpm: 800, firingOrder: [1, 10, 9, 4, 3, 6, 5, 8, 7, 2] });
const creak = sound.mechanism({ kind: 'creak', material: 'wood_painted', duration: 2 });
const coin = sound.ui({ kind: 'pickup', seed: 3 });                              // sfxr-style

ctx.emitter('engine_idle', { kind: 'sound', clip: idle, when: 'always', parent: 'engine' });
ctx.part('door_leaf', leaf, { motion: { kind: 'sway', … }, sound: { onMotion: creak } });
```

| Generator | Options | Model |
|---|---|---|
| `sound.impact` | `material`, `size` (m), `shape` bar · plate · hollow · block, `thickness?`, `mass?` (striker, kg), `force?` 0..1, `duration?`, `seed?`, `name?` | modal synthesis, below |
| `sound.engine` | `cylinders`, `rpm`, `firingOrder?`, `exhaust?: { length, muffler }`, `roughness?`, `duration?` | combustion pulse train → exhaust pipe resonance → muffler; seamless loop |
| `sound.mechanism` | `kind` creak · squeak · whine · rattle · hiss · clunk, `material`, `speed?` 0..1, `duration?`, `rpm?`/`teeth?` (whine), `loop?` | stick-slip, gear mesh, random strikes, filtered noise, latch + thud |
| `sound.ui` | `kind` blip · pickup · laser · hit · powerup, `seed` | square/saw/triangle oscillators, pitch slides, fast envelopes |

A clip is plain data (`SoundClip`: `name`, 48 kHz, mono, `Float32Array`, `loop`). `encodeWav` writes
16-bit PCM; `peakFrequency`, `magnitudeAt`, `rms`, `seamJump` measure clips in tests, so an agent
that cannot listen can still prove a pitch or a seamless loop.

## Impact: modes from material and size

A struck solid rings in its bending modes. For a thin body of thickness h and length L, the first
mode is f₁ = K · √(E/ρ) · h / L², K from the boundary conditions:

| Shape | K | Mode ratios | Source |
|---|---|---|---|
| bar (free-free beam) | 1.028 | 1, 2.756, 5.404, 8.933, 13.34 | Euler–Bernoulli, (βL)² = 22.37, 61.67, 120.9 … |
| plate (free square, ν = 0.3) | 0.65 | 1, 1.46, 1.80, 2.58, 3.3, 4.53 | Leissa, *Vibration of Plates* (NASA SP-160), λ = 13.47, 19.6, 24.3 … |
| hollow (bell-like shell) | 0.907 | hum 0.5, prime 1, tierce 1.2, quint 1.5, nominal 2, 2.5, 2.67, 3, 4 | Rossing, *The Science of Sound*, ch. 13 |
| block (chunky lump) | 1.028 | 1, 1.58, 2.1, 2.7, 3.4 | dense, quickly damped (chosen) |

With the default thickness a fixed fraction of `size`, f ∝ √(E/ρ) / L: double the size, halve the
pitch (tested). Each mode decays as e^(−π f η t) (τ = 1/(π f η)), with η rising slightly with
frequency so the attack is bright and the tail pure. The striker's `mass` and `force` set the
contact cutoff (Hertz contact: heavier = longer contact = darker), which low-passes the mode
amplitudes and a short contact click.

### Materials

`E` and `ρ` from engineeringtoolbox.com ([Young's modulus](https://www.engineeringtoolbox.com/young-modulus-d_417.html),
[densities](https://www.engineeringtoolbox.com/density-solids-d_1265.html)); loss factors η from
Cremer, Heckl & Petersson, *Structure-Borne Sound* (table of material loss factors), **raised** to
include radiation and mounting losses so a prop rings for game length rather than lab length.

| Material | E (GPa) | ρ (kg/m³) | η (effective) | Contact (Hz) |
|---|---|---|---|---|
| steel | 200 | 7850 | 0.0012 | 9000 |
| cast_iron | 110 | 7200 | 0.004 | 8000 |
| brass | 100 | 8500 | 0.001 | 8000 |
| aluminium | 69 | 2700 | 0.0018 | 8000 |
| oak | 12 | 750 | 0.012 | 3000 |
| pine | 9 | 500 | 0.016 | 2500 |
| glass | 70 | 2500 | 0.0015 | 10000 |
| ceramic | 70 | 2400 | 0.004 | 9000 |
| stone | 50 | 2650 | 0.01 | 6000 |
| concrete | 30 | 2400 | 0.02 | 4500 |
| rubber | 0.05 | 1100 | 0.2 | 400 |
| plastic | 2.5 | 1050 | 0.03 | 2500 |

Trim-sheet strip ids resolve to these (`iron_cast` → cast_iron, `steel_painted` → steel,
`wood_painted` → pine, `brick` → ceramic, `ice` → glass …); anything else is `T3D_AUDIO_MATERIAL`.

## Engine

A four-stroke fires each cylinder once per two revolutions: firing frequency = rpm/60 × cylinders/2
(800 rpm V10 → 66.7 Hz; tested by spectrum peak, ±1 %). Each pulse is a raised cosine ≈ 40° of
crank wide; the firing order assigns each pulse a bank (odd/even cylinder), and banks differ in
strength, which with per-cycle jitter (`roughness`) gives the burble at the half-order. The exhaust
is a quarter-wave pipe, f = c / 4L with c ≈ 500 m/s in hot gas, plus its third harmonic; `muffler`
low-passes. The loop is a whole number of engine cycles, rendered twice from a periodic event list
and the second copy kept, so every filter is in steady state and the last sample flows into the
first (`seamJump` < 1).

## Mechanisms

- **creak** — stick-slip (Akay, "Acoustics of friction", JASA 111, 2002): a slip train whose rate
  follows the swing (swell up, slow down), each slip ringing a 0.4 m plate of the material.
- **squeak** — fast tonal stick-slip: a saw at 650–1750 Hz with wobble, band-passed.
- **whine** — gear mesh: teeth × shaft rate with its second harmonic and shaft-rate sidebands.
- **rattle** — small random strikes (chain links, loose plates), Poisson-spaced at 10–60 /s.
- **hiss** — band-passed noise (hydraulic / pneumatic) with a pipe ring.
- **clunk** — the latch tongue clicks, then the leaf lands ~40 ms later.

Looping kinds (whine, rattle, hiss) are crossfaded into seamless loops (equal power, 120 ms).

## In the GLB: KHR_audio_emitter

[KHR_audio_emitter](https://github.com/KhronosGroup/glTF/pull/2137) is a **Khronos draft**
(schema: [OMI mirror](https://omigroup.github.io/gltf-extensions/KHR_audio_emitter)). ts23d lists it
in `extensionsUsed` only, never required: viewers without it ignore it.

- Every clip is an `audio` entry `{ uri: '<clip>.wav', mimeType: 'audio/wav' }`; `t3d build` / `shot`
  write the WAVs beside the GLB (external is friendlier: an engine imports them as its own sound
  assets, and the GLB stays small). Embedded buffers are not written (yet).
- Each source becomes a `positional` emitter on its node (`refDistance`, `maxDistance`, `gain`);
  `when: 'always'` sets `autoPlay`, a looping clip sets `loop`.
- What starts a sound rides `emitter.extras.trigger`: `always`, `moving`, `event` (game code) or
  `motion` (plays with the part's baked motion clip — a door creak on its sway).
- Only the LOD0 tree carries emitters, so an `MSFT_lod` swap never doubles a sound.
- The manifest lists `sounds` (node, clip, trigger, loop, seconds) and `files.sounds`.
- `--no-sounds` (CLI) / `toGlb(…, { sounds: false })` leave audio out.

Errors: `T3D_AUDIO_INVALID` (a number out of range, a bad name or firing order, a `sound` on a part
without `motion`, a sound with no node of its own), `T3D_AUDIO_MATERIAL`, `T3D_AUDIO_CONFLICT` (two
different clips under one name). Demo: `recipes/sound_demo`.

## Planned

OGG/Opus encoding (smaller files), stereo/ambisonic beds, embedded-buffer option, impact sounds from
part geometry automatically (size and strip read from the mesh), the optional `kubeezAudio` adapter.
