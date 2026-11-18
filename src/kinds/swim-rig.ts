// What the swim clips share: the swimmer resolved from a plan (body, fins, its length, its tail tip),
// the calibrated body wave and the fin motion. A chain that keeps its length lands under the nominal
// amplitude (about 8 %, doc section 1), so the envelope is scaled until the MEASURED tail meets the
// target; the shape does not depend on frequency, so one gain serves every clip of that envelope.

import { Ts23dError } from '../core/index.ts';
import type { BodyPlan, PlanChain } from './body-plan-types.ts';
import { type ChainClipSpec, type ChainDrive, chainSampler, tipOf } from './chain-bake.ts';
import { ds21Envelope, expEnvelope, serpenoid, TAU, travellingWave } from './chain-drivers.ts';
import { type ChainField, integrate, linkSpans, sumFields } from './chain-field.ts';
import {
  burstBand,
  cruiseBand,
  SWIM_PRESETS,
  type SwimParams,
  type SwimPreset,
} from './swim-presets.ts';

export interface SwimJaw {
  /** Lower jaw chain id. */
  readonly lower: string;
  /** Upper jaw chain id, when it protrudes (sharks). */
  readonly upper?: string;
  /** Head length, metres (a fifth of L). */
  readonly headLength?: number;
}

export interface SwimOptions {
  /** Id of the trunk chain, head first. */
  readonly chain: string;
  readonly preset?: SwimPreset;
  readonly params?: Partial<SwimParams>;
  /** Caudal lobe chains. */
  readonly caudal?: readonly string[];
  readonly pectoral?: readonly string[];
  readonly jaw?: SwimJaw;
}

export interface SwimRig {
  readonly plan: BodyPlan;
  readonly body: PlanChain;
  readonly lobes: readonly PlanChain[];
  readonly pectorals: readonly PlanChain[];
  /** The chains on the longest path from head to tail tip: the mass recoil balances. */
  readonly path: readonly PlanChain[];
  /** Length of that path, metres: the L of every swimming number. */
  readonly L: number;
  readonly tip: string;
  /** Sign turning a +Z rotation into one about the body's bend axis. */
  readonly z: 1 | -1;
  readonly p: SwimParams;
  readonly cruiseHz: number;
  readonly burstHz: number;
  readonly gains: Map<number, number>;
  readonly jaw?: SwimJaw;
}

const invalid = (cause: string, fix: string): never => {
  throw new Ts23dError('T3D_RECIPE_INVALID', { cause, fix });
};

export function chainById(plan: BodyPlan, id: string): PlanChain {
  const c = plan.chains.find((x) => x.id === id);
  if (c) return c;
  return invalid(
    `plan '${plan.name}' has no chain '${id}'`,
    `use one of: ${plan.chains.map((x) => x.id).join(', ')}`,
  );
}

/** Refuses a trunk that is not head-first along -X; the sign of its bend axis against +Z. */
export function checkTrunk(body: PlanChain): 1 | -1 {
  const first = body.links[0];
  const last = body.links.at(-1);
  if (!first || !last) return invalid(`chain '${body.id}' has no links`, 'give it links');
  const [a, b] = [first.bone.head, last.bone.tail];
  const v = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const;
  if (!(v[0] < -0.9 * Math.hypot(v[0], v[1], v[2])))
    invalid(
      `trunk '${body.id}' does not run head to tail along -X`,
      'author the trunk with its head at +X: the root travels along +X',
    );
  const up = first.bend[2];
  if (!(Math.abs(up) > 0.7))
    invalid(
      `trunk '${body.id}' bends about (${first.bend.join(', ')}), not the vertical`,
      'a side-to-side swimmer bends about Z: give the trunk an upright bend axis',
    );
  return up > 0 ? 1 : -1;
}

/** Resolves the swimmer, merging preset and overrides. */
export function swimRig(plan: BodyPlan, o: SwimOptions): SwimRig {
  const body = chainById(plan, o.chain);
  const z = checkTrunk(body);
  const lobes = (o.caudal ?? []).map((id) => chainById(plan, id));
  const pectorals = (o.pectoral ?? []).map((id) => chainById(plan, id));
  const p: SwimParams = { ...SWIM_PRESETS[o.preset ?? 'shark'], ...o.params };
  // A lobe longer than what is left of the trunk behind it extends the path.
  let L = body.length;
  let tip = body.links.at(-1)?.bone.name ?? '';
  let path: PlanChain[] = [body];
  for (const lobe of lobes) {
    const parent = lobe.links[0]?.bone.parent;
    const at = body.links.findIndex((l) => l.bone.name === parent);
    const next = body.links[at + 1]?.s ?? 1;
    const reach = next * body.length + lobe.length;
    if (at >= 0 && reach > L) {
      L = reach;
      tip = lobe.links.at(-1)?.bone.name ?? tip;
      path = [body, lobe];
    }
  }
  const cruiseHz = p.cruiseHz ?? cruiseBand(L);
  const burstHz = p.burstHz ?? burstBand(L);
  const rig: SwimRig = {
    plan,
    body,
    lobes,
    pectorals,
    path,
    L,
    tip,
    z,
    p,
    cruiseHz,
    burstHz,
    gains: new Map(),
    ...(o.jaw ? { jaw: o.jaw } : {}),
  };
  return rig;
}

/** Phase lag of each caudal lobe behind the tail, cycles. Lobe phase is unpublished (design). */
const LOBE_LAG = [0.06, 0.12];
/** Lobe flex on top of the body wave, radians per lobe length, wavelength in lobes (design). */
const LOBE_FLEX = 0.25;
const LOBE_LAMBDA = 1.5;
/** Pectoral swing in steady swimming: within the ≤ 3° check, since they stay still [WL00]. */
export const PECTORAL_CRUISE = (1.5 * Math.PI) / 180;

function waveField(rig: SwimRig, f: number, alpha: number, gain: number): ChainField {
  const lambda = (rig.p.lambda * rig.L) / rig.body.length;
  const target = (rig.p.tailApp * rig.L) / rig.body.length;
  const envelope =
    alpha > 0
      ? expEnvelope((target / 2) * gain, alpha)
      : ds21Envelope((target / 0.2) * gain, rig.p.headApp);
  return travellingWave({ f, lambda, envelope });
}

/** A lobe on the trunk's last link carries the body wave on past the tail tip. */
function lobeWave(rig: SwimRig, lobe: PlanChain, wave: ChainField): ChainField {
  const last = rig.body.links.at(-1);
  const kn = wave.kn;
  if (!kn || !last || lobe.links[0]?.bone.parent !== last.bone.name) return {};
  const r = lobe.length / rig.body.length;
  const from = linkSpans(rig.body).at(-1)?.mid ?? 1;
  return {
    kn: (s, t) => kn(1 + s * r, t) * r,
    base: (t) => ({ bend: integrate(kn, from, 1, t) }),
  };
}

/** Caudal lobes (the trunk's `wave` plus a lagged flex) and the pectoral swing, beat `f`. */
export function finDrives(
  rig: SwimRig,
  f: number,
  wave: ChainField,
  pectoral = PECTORAL_CRUISE,
): ChainDrive[] {
  const lobes = rig.lobes.map((chain, i) => ({
    chain,
    field: sumFields(
      lobeWave(rig, chain, wave),
      serpenoid({ f, lambda: LOBE_LAMBDA, alpha: LOBE_FLEX, phase: -(LOBE_LAG[i] ?? 0) }),
    ),
  }));
  const fins = rig.pectorals.map((chain) => ({
    chain,
    field: {
      base: (t: number) => ({ pitch: pectoral * Math.sin(TAU * f * t) }),
    },
  }));
  return [...lobes, ...fins];
}

/** Peak-to-peak lateral swing of the tail tip over one beat, recoil removed, metres. */
function tailSwing(rig: SwimRig, field: ChainField): number {
  const spec: ChainClipSpec = {
    name: 'calibrate',
    plan: rig.plan,
    drives: [{ chain: rig.body, field }, ...finDrives(rig, 1, field)],
    seconds: 1,
    loop: true,
    recoil: { chains: rig.path, axes: [1] },
  };
  const sample = chainSampler(spec);
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < 48; i++) {
    const y = tipOf(rig.plan, sample(i / 48), rig.tip)[1];
    lo = Math.min(lo, y);
    hi = Math.max(hi, y);
  }
  return hi - lo;
}

/** The envelope gain that makes the measured tail swing equal tailApp · L. */
function gainFor(rig: SwimRig, alpha: number): number {
  const known = rig.gains.get(alpha);
  if (known !== undefined) return known;
  const target = rig.p.tailApp * rig.L;
  let gain = 1;
  for (let i = 0; i < 8; i++) {
    const swing = tailSwing(rig, waveField(rig, 1, alpha, gain));
    if (!(swing > 0))
      return invalid(
        `the tail of '${rig.body.id}' does not swing at gain ${gain}`,
        'check the wavelength and tail amplitude of the swim parameters',
      );
    gain *= target / swing;
  }
  rig.gains.set(alpha, gain);
  return gain;
}

/** The trunk's calibrated wave at `f`; `alpha` 0 is the quadratic envelope, `scale` shrinks it. */
export function bodyWave(rig: SwimRig, f: number, alpha: number, scale = 1): ChainField {
  return waveField(rig, f, alpha, gainFor(rig, alpha) * scale);
}
