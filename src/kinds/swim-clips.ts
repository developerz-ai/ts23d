// The swim clip set of one body plan, from published kinematics (doc section 1): `cruise`, `burst`
// (faster beat, same tail swing and wavelength; an eel's envelope also steepens), full-circle `turn_l` / `turn_r`, `cstart_l` / `cstart_r`, `idle`, and `bite` when
// jaw chains are named. Root travel is along +X, the trunk's head leading.

import type { Clip } from '../core/index.ts';
import type { BodyPlan } from './body-plan-types.ts';
import { bakeChainClip, type ChainDrive, loopLength, type RootKey } from './chain-bake.ts';
import { TAU } from './chain-drivers.ts';
import { sumFields } from './chain-field.ts';
import { biteClip, cstartClip } from './swim-fast.ts';
import { bodyWave, finDrives, type SwimOptions, type SwimRig, swimRig } from './swim-rig.ts';

export type { SwimOptions } from './swim-rig.ts';

/** Loop lengths to aim for, seconds (design). */
const CRUISE_TARGET = 2;
const BURST_TARGET = 1;
const BURST_MIN_BEATS = 4;
/** Turning radius of the turn clips, body lengths (design). */
const TURN_RADIUS = 1.25;
/** Ram swimmers idle at this share of cruise frequency (design; [doc] says "a slow cruise"). */
const RAM_IDLE = 0.7;
/** Hovering: tail-beat rate, body-wave scale and fin sculling (design). */
const HOVER_RATE = 0.5;
const HOVER_WAVE = 0.25;
const HOVER_FINS = (8 * Math.PI) / 180;

const straight =
  (U: number) =>
  (t: number): RootKey => ({ pos: [U * t, 0, 0], yaw: 0 });

function swimLoop(
  rig: SwimRig,
  name: string,
  f: number,
  alpha: number,
  seconds: { seconds: number; cycles: number },
): Clip {
  const wave = bodyWave(rig, f, alpha);
  const drives: ChainDrive[] = [{ chain: rig.body, field: wave }, ...finDrives(rig, f, wave)];
  return bakeChainClip({
    name,
    plan: rig.plan,
    drives,
    ...seconds,
    loop: true,
    root: straight(rig.p.stride * f * rig.L),
    recoil: { chains: rig.path, axes: [1] },
  });
}

/** A steady turn: a full circle of the head, the body bent to the path it is following. */
function turnClip(rig: SwimRig, name: string, side: 1 | -1): Clip {
  const f = rig.cruiseHz;
  const cycles = Math.max(1, Math.round((TAU * TURN_RADIUS) / rig.p.stride));
  const seconds = cycles / f;
  const U = rig.p.stride * f * rig.L;
  const w = TAU / seconds;
  const R = U / w;
  // A chain following a circle has heading falling with arc: dθ/ds = −ω/U per metre.
  const bias = -side * rig.z * (w / U) * rig.body.length;
  const wave = bodyWave(rig, f, rig.p.alpha?.cruise ?? 0);
  return bakeChainClip({
    name,
    plan: rig.plan,
    seconds,
    cycles,
    loop: true,
    drives: [
      { chain: rig.body, field: sumFields(wave, { kn: () => bias }) },
      ...finDrives(rig, f, wave),
    ],
    root: (t) => ({
      pos: [R * Math.sin(w * t), side * R * (1 - Math.cos(w * t)), 0],
      yaw: side * w * t,
    }),
    recoil: { chains: rig.path, axes: [1] },
  });
}

function idleClip(rig: SwimRig): Clip {
  const alpha = rig.p.alpha?.cruise ?? 0;
  if (rig.p.idle === 'ram') {
    const f = rig.cruiseHz * RAM_IDLE;
    return swimLoop(rig, 'idle', f, alpha, loopLength(f, CRUISE_TARGET));
  }
  const f = rig.cruiseHz * HOVER_RATE;
  const wave = bodyWave(rig, f, alpha, HOVER_WAVE);
  return bakeChainClip({
    name: 'idle',
    plan: rig.plan,
    drives: [{ chain: rig.body, field: wave }, ...finDrives(rig, f, wave, HOVER_FINS)],
    ...loopLength(f, CRUISE_TARGET),
    loop: true,
    recoil: { chains: rig.path, axes: [1] },
  });
}

/** Every swim clip of the plan. Burst raises the frequency and holds tail swing and wavelength;
 *  presets with `alpha` (the eel) also move to the fast envelope rate [T04]. */
export function swimClips(plan: BodyPlan, options: SwimOptions): Clip[] {
  const rig = swimRig(plan, options);
  const { cruiseHz: f, burstHz: fast } = rig;
  const alpha = rig.p.alpha;
  const bite = biteClip(rig);
  return [
    swimLoop(rig, 'cruise', f, alpha?.cruise ?? 0, loopLength(f, CRUISE_TARGET)),
    swimLoop(
      rig,
      'burst',
      fast,
      alpha?.burst ?? 0,
      loopLength(fast, Math.max(BURST_TARGET, BURST_MIN_BEATS / fast)),
    ),
    turnClip(rig, 'turn_l', 1),
    turnClip(rig, 'turn_r', -1),
    cstartClip(rig, 'cstart_l', 1),
    cstartClip(rig, 'cstart_r', -1),
    idleClip(rig),
    ...(bite ? [bite] : []),
  ];
}
