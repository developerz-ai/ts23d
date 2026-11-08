// Saltmarch materials and wear, shared by every faction asset. Assets are authored in flat role
// colours (BONE, CLOTH, IRON…); `restrip` moves each role onto a real library strip (ceramic,
// canvas, leather, painted or cast steel, brass, oak, stone) with the vertex colour that strip wants,
// and `wearOf` turns a short preset (unit, vehicle, masonry) into measured `weather()` effects.
// Team parts stay off `weather()`: their wear comes from the painted strip's own chips, so the
// team colour keeps its share of the 64-px strategy view.

import {
  type BuildContext,
  hex,
  type Mesh,
  type PartOptions,
  type StripId,
  spanOf,
  stripAtV,
  stripRect,
  type Vec3,
  type WeatheringOptions,
  weather,
} from '@developerz.ai/ts23d';

/** One authoring colour → a strip (+ the vertex colour it wants; default: keep the colour). */
export interface Rule {
  readonly from: Vec3;
  readonly strip: StripId;
  readonly color?: Vec3;
}

/**
 * The vertex colour that makes a library strip (own albedo `stripHex`) read as `target`:
 * target ÷ strip albedo, per channel, capped at 1 (vertex colour only darkens).
 */
export function tintFor(stripHex: string, target: Vec3): Vec3 {
  const a = hex(stripHex);
  const t = (k: 0 | 1 | 2): number => Math.min(1, target[k] / Math.max(1e-3, a[k]));
  return [t(0), t(1), t(2)];
}

/** Library albedos (docs/architecture/materials.md) for `tintFor`. */
export const ALBEDO = {
  canvas: '#cbbea2',
  leather: '#7c5438',
  oak: '#a27b52',
  pine: '#d2b183',
  wood_weathered: '#9b968c',
  iron_cast: '#6c6966',
  rubber: '#2c2c2c',
  brass: '#f5e5ae',
} as const;

/**
 * A role colour on a strip: library strips that carry their own albedo get the tint that makes
 * them read as the role colour; painted strips (plastic, steel_painted, wood_painted) and the
 * greyscale classics take the role colour as the paint.
 */
export function role(from: Vec3, strip: StripId): Rule {
  const base = String(strip).split('~')[0] ?? '';
  const a = (ALBEDO as Readonly<Record<string, string>>)[base];
  return a ? { from, strip, color: tintFor(a, from) } : { from, strip };
}

const near = (m: Mesh, i: number, c: Vec3): boolean =>
  Math.abs((m.colors[i * 3] ?? 0) - c[0]) < 2e-3 &&
  Math.abs((m.colors[i * 3 + 1] ?? 0) - c[1]) < 2e-3 &&
  Math.abs((m.colors[i * 3 + 2] ?? 0) - c[2]) < 2e-3;

/** Move a vertex from the authoring `plain` row onto `to` (V row shift, U rescaled by span).
 *  Vertices already on a chosen strip (iron_rust links, stone plinth) stay where they are. */
function move(uvs: Float32Array, i: number, to: StripId): void {
  const v = uvs[i * 2 + 1] ?? 0;
  // A V exactly on the row's top edge belongs to it too (stripAtV would say the next row).
  const from = stripAtV(v) === 'plain' || stripAtV(v - 1e-6) === 'plain' ? 'plain' : null;
  if (!from) return;
  const a = stripRect(from);
  const b = stripRect(to);
  uvs[i * 2] = b.u0 + (((uvs[i * 2] ?? 0) - a.u0) * spanOf(from)) / spanOf(to);
  uvs[i * 2 + 1] = b.v0 + (v - a.v0);
}

/**
 * Every vertex whose colour matches a rule goes onto that rule's strip; `rest` (optional) takes
 * every unmatched vertex. Geometry and triangle counts are unchanged.
 */
export function restrip(m: Mesh, rules: readonly Rule[], rest?: StripId): Mesh {
  const uvs = new Float32Array(m.uvs);
  const colors = new Float32Array(m.colors);
  const n = m.positions.length / 3;
  for (let i = 0; i < n; i++) {
    const rule = rules.find((r) => near(m, i, r.from));
    const to = rule?.strip ?? rest;
    if (!to) continue;
    move(uvs, i, to);
    if (rule?.color) colors.set(rule.color, i * 3);
  }
  return { ...m, uvs, colors };
}

/** The whole mesh on one strip, optionally recoloured (`color`) — a one-material part. */
export const onStrip = (m: Mesh, strip: StripId, color?: Vec3): Mesh => {
  const out = restrip(m, [], strip);
  if (!color) return out;
  const colors = new Float32Array(out.colors.length);
  for (let i = 0; i < colors.length; i += 3) colors.set(color, i);
  return { ...out, colors };
};

/** Dust of the salt flats: pale, a touch warm. Mud: grey-brown brine silt. Soot: near black. */
export const DUST: Vec3 = hex('#b9ae95');
export const MUD: Vec3 = hex('#4a3f31');
export const GRIME: Vec3 = hex('#3a3630');
export const MOSS: Vec3 = hex('#4c5a2a');

/** Soot from an exhaust or a fire, streaking down from the `fasteners` spots it starts at. */
export const SOOT_STAIN = {
  where: 'fasteners | below-fasteners',
  amount: 0.5,
  color: hex('#1d1b19'),
  strength: 0.8,
  streaks: true,
  streakLength: 0.6,
} as const;

/** Measured wear presets (weather(): exact % of the eligible area, gated by QA `weather`). */
export function wearOf(
  kind: 'unit' | 'cloth' | 'vehicle' | 'masonry',
  name: string,
  seed: number,
  /** Mud from the ground (off for parts riding high in their own space: a turret, a gun). */
  mud = true,
): WeatheringOptions {
  // Cloth, straps and handles do not chip: dust settles, mud climbs.
  if (kind === 'cloth')
    return {
      name,
      seed,
      age: 0.5,
      resolution: [0.16, 0, 0],
      groundBand: 0.45,
      effects: {
        dust: { where: 'up-facing', amount: 0.3, color: DUST, strength: 0.5 },
        mud: { where: 'ground-near', amount: 0.55, color: MUD, strength: 0.55 },
      },
    };
  if (kind === 'unit')
    return {
      name,
      seed,
      age: 0.5,
      resolution: [0.16, 0, 0],
      groundBand: 0.3,
      under: hex('#6b6458'),
      effects: {
        chips: { where: 'convex-edges', amount: 0.14, strength: 0.8 },
        dust: { where: 'up-facing', amount: 0.3, color: DUST, strength: 0.6 },
        mud: { where: 'ground-near', amount: 0.5, color: MUD, strength: 0.7 },
      },
    };
  if (kind === 'vehicle')
    return {
      name,
      seed,
      age: 0.6,
      resolution: [0.22, 0.6, 0],
      groundBand: 0.9,
      effects: {
        chips: { where: 'convex-edges', amount: 0.13, strength: 0.75 },
        dust: { where: 'up-facing', amount: 0.3, color: DUST, strength: 0.5 },
        ...(mud ? { mud: { where: 'ground-near', amount: 0.5, color: MUD, strength: 0.7 } } : {}),
      },
    };
  return {
    name,
    seed,
    age: 0.7,
    resolution: [0.5, 1.2, 0],
    groundBand: 1.1,
    under: hex('#8f8672'),
    effects: {
      chips: { where: 'convex-edges', amount: 0.1, strength: 0.5 },
      moss: { where: 'ground-near & !down-facing', amount: 0.35, color: MOSS, strength: 0.8 },
      dust: { where: 'up-facing', amount: 0.25, color: DUST, strength: 0.4 },
    },
  };
}

/** A part waiting to be registered: weathered together with its neighbours first. */
interface Pending {
  readonly name: string;
  readonly mesh: Mesh | null;
  readonly opts: PartOptions | undefined;
}

/**
 * Collects parts so wear can see them all at once (convexity, exposure and the ground are judged
 * over the whole set), then registers them in the order they were added.
 */
export class Kit {
  private readonly list: Pending[] = [];
  add(name: string, mesh: Mesh | null, opts?: PartOptions): void {
    this.list.push({ name, mesh, opts });
  }
  /**
   * Weather each group's parts in one `weather()` call (`pick` chooses them; parts in one group
   * must share a space), then `ctx.part` everything. Team-painted parts are never weathered.
   */
  commit(
    ctx: BuildContext,
    groups: readonly {
      readonly wear: WeatheringOptions;
      readonly pick: (name: string, opts: PartOptions | undefined) => boolean;
    }[],
  ): void {
    const done = new Map<string, Mesh>();
    for (const g of groups) {
      const set: Record<string, Mesh> = {};
      for (const p of this.list)
        if (p.mesh && !done.has(p.name) && p.opts?.paint === undefined && g.pick(p.name, p.opts))
          set[p.name] = p.mesh;
      if (Object.keys(set).length === 0) continue;
      const out = weather(ctx, set, g.wear);
      for (const [k, m] of Object.entries(out)) done.set(k, m);
    }
    for (const p of this.list) ctx.part(p.name, done.get(p.name) ?? p.mesh, p.opts);
  }
}
