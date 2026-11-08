// weather(): age a target the way physics would — random (seeded, world-space), where (selectors
// over geometry), how (vertex-colour effects + deformation) and % (exact coverage of the eligible
// area, measured and reported). Mesh form returns { mesh, coverage }; ctx form weathers a set of
// named meshes in one shared space (a door, its frame, its bolts), reads ctx.lod/seed, records the
// coverage on the compiled asset (manifest `weather`, QA `weather`) and returns the meshes.

import {
  type BuildContext,
  type Lod,
  type Mesh,
  merge,
  Ts23dError,
  type WeatherCoverage,
} from '../core/index.ts';
import { deform } from './imperfect.ts';
import { BARE_STEEL, paintEffect } from './weather-paint.ts';
import { sceneOf } from './weather-scene.ts';
import { subdivideTo } from './weather-subdivide.ts';
import {
  COVER_ORDER,
  DEFAULT_AMOUNT,
  DEFAULT_WHERE,
  effectsOf,
  resolutionOf,
  type Spot,
  type WeatheringOptions,
} from './weather-types.ts';

export interface Weathered {
  readonly mesh: Mesh;
  readonly coverage: readonly WeatherCoverage[];
}

const glob = (pattern: string): RegExp =>
  new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);

function check(o: WeatheringOptions): void {
  const age = o.age ?? 0.5;
  if (!(age >= 0 && age <= 1))
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `weather age ${age} is outside 0..1`,
      fix: 'use 0 (new) .. 1 (decades outdoors), e.g. age: 0.6',
    });
  for (const [k, e] of Object.entries(o.effects ?? {})) {
    const amount = (e as { amount?: number }).amount;
    if (amount !== undefined && !(amount >= 0 && amount <= 1))
      throw new Ts23dError('T3D_RECIPE_INVALID', {
        cause: `weather ${k}.amount ${amount} is outside 0..1`,
        fix: `amount is the covered fraction of the eligible surface: ${k}: { amount: 0.15 }`,
      });
  }
}

/** Weather meshes already split into parts: tessellate, deform, paint, measure, split back. */
function run(
  meshes: readonly (readonly [string, Mesh])[],
  o: WeatheringOptions,
  lod: Lod,
  seed: number,
): { meshes: Mesh[]; coverage: WeatherCoverage[] } {
  check(o);
  const name = o.name ?? 'weather';
  const res = resolutionOf(o, lod);
  const fine = meshes.map(([, m]) => subdivideTo(m, res));
  const union = merge(fine);
  const spots = (
    list: readonly (Spot | string)[] | undefined,
  ): { spots: Spot[]; mask: Uint8Array } => {
    const out: Spot[] = [];
    const mask = new Uint8Array(union.positions.length / 3);
    for (const item of list ?? []) {
      if (typeof item !== 'string') {
        out.push(item);
        continue;
      }
      const re = glob(item);
      let base = 0;
      let hit = false;
      fine.forEach((m, i) => {
        const n = m.positions.length / 3;
        if (re.test(meshes[i]?.[0] ?? '')) {
          hit = true;
          mask.fill(1, base, base + n);
          out.push(spotOf(m));
        }
        base += n;
      });
      if (!hit)
        throw new Ts23dError('T3D_PART_UNKNOWN', {
          cause: `weather '${name}': no mesh matches '${item}'`,
          fix: `name the meshes you pass ({ bolt_0: …, handle: … }) or give a spot { at, radius }`,
        });
    }
    return { spots: out, mask };
  };
  const f = spots(o.fasteners);
  const t = spots(o.touched);
  const effects = effectsOf(o);
  const age = o.age ?? 0.5;
  let scene = sceneOf(union, o, { fasteners: f.spots, touched: t.spots, touchedMask: t.mask });
  const coverage: WeatherCoverage[] = [];
  if (effects.dents || effects.sag || effects.warp) {
    const d = deform(scene, {
      name,
      seed,
      lod,
      age,
      ...(effects.dents ? { dents: effects.dents } : {}),
      ...(effects.sag ? { sag: effects.sag } : {}),
      ...(effects.warp ? { warp: effects.warp } : {}),
    });
    coverage.push(...d.coverage);
    if (d.mesh !== union)
      scene = sceneOf(d.mesh, o, { fasteners: f.spots, touched: t.spots, touchedMask: t.mask });
  }
  const colors = new Float32Array(scene.s.mesh.colors);
  for (const k of COVER_ORDER) {
    const e = effects[k];
    if (!e) continue;
    const where = e.where ?? DEFAULT_WHERE[k];
    const amount = e.amount ?? DEFAULT_AMOUNT[k] * age;
    const r = paintEffect(
      scene,
      colors,
      k,
      e,
      where,
      amount,
      (seed * 31 + k.length * 977 + k.charCodeAt(0)) | 0,
      o.under ?? BARE_STEEL,
    );
    coverage.push({
      target: name,
      effect: k,
      where,
      lod,
      amount: round(amount),
      actual: round(r.actual),
      area: round(r.area),
      tolerance: o.tolerance ?? 0.02,
      misplaced: round(r.misplaced),
      ...(r.streaks !== undefined ? { streaks: r.streaks, upward: r.upward ?? 0 } : {}),
    });
  }
  const done: Mesh = { ...scene.s.mesh, colors };
  return { meshes: split(done, fine), coverage };
}

const round = (x: number): number => Math.round(x * 1e4) / 1e4;

function spotOf(m: Mesh): Spot {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.positions.length; i++) {
    const k = i % 3;
    lo[k] = Math.min(lo[k] ?? 0, m.positions[i] ?? 0);
    hi[k] = Math.max(hi[k] ?? 0, m.positions[i] ?? 0);
  }
  const c = (k: number): number => ((lo[k] ?? 0) + (hi[k] ?? 0)) / 2;
  const r = Math.max(...[0, 1, 2].map((k) => ((hi[k] ?? 0) - (lo[k] ?? 0)) / 2));
  return { at: [c(0), c(1), c(2)], radius: r };
}

/** Cut the processed union back into the input meshes (same vertex/index ranges). */
function split(done: Mesh, parts: readonly Mesh[]): Mesh[] {
  let v = 0;
  let ix = 0;
  return parts.map((m) => {
    const n = m.positions.length / 3;
    const out: Mesh = {
      positions: done.positions.slice(v * 3, (v + n) * 3),
      normals: done.normals.slice(v * 3, (v + n) * 3),
      uvs: done.uvs.slice(v * 2, (v + n) * 2),
      colors: done.colors.slice(v * 3, (v + n) * 3),
      indices: Uint32Array.from(done.indices.subarray(ix, ix + m.indices.length), (i) => i - v),
    };
    v += n;
    ix += m.indices.length;
    return out;
  });
}

const isMesh = (x: unknown): x is Mesh =>
  typeof x === 'object' &&
  x !== null &&
  (x as { positions?: unknown }).positions instanceof Float32Array;

/** Weather one mesh: `weather(mesh, { seed, age, effects })` → `{ mesh, coverage }`. */
export function weather(mesh: Mesh, o: WeatheringOptions): Weathered;
/** Weather named meshes in one space at ctx.lod; coverage goes to the compiled asset. */
export function weather<K extends string>(
  ctx: BuildContext,
  meshes: Readonly<Record<K, Mesh>>,
  o: WeatheringOptions,
): Record<K, Mesh>;
export function weather(
  a: Mesh | BuildContext,
  b: WeatheringOptions | Readonly<Record<string, Mesh>>,
  c?: WeatheringOptions,
): Weathered | Record<string, Mesh> {
  if (isMesh(a)) {
    const o = b as WeatheringOptions;
    const r = run([['mesh', a]], o, o.lod ?? 0, o.seed ?? 1);
    return { mesh: r.meshes[0] ?? a, coverage: r.coverage };
  }
  const o = c ?? {};
  const entries = Object.entries(b as Readonly<Record<string, Mesh>>);
  const r = run(entries, o, a.lod, o.seed ?? a.seed);
  a.weathered(r.coverage);
  return Object.fromEntries(entries.map(([k], i) => [k, r.meshes[i] ?? (entries[i]?.[1] as Mesh)]));
}
