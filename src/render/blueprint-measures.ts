// What the blueprint dimensions: each `real.measures` entry measured on the model the way the
// `measures` gate reads it (extent of the parts' union, or centre-to-centre of two parts), and
// the per-view dimension list — overall L × W × H plus the measures that read in that view.

import {
  type CompiledAsset,
  type Measure,
  TOLERANCE,
  type Vec3,
  worldMeshes,
} from '../core/index.ts';
import type { Rgb } from './blueprint-draw.ts';
import { type Box3, type DimSpec, INK, type OrthoView } from './blueprint-panel.ts';

export const OK: Rgb = [22, 130, 64];
export const BAD: Rgb = [206, 38, 38];

export interface MeasureResult {
  readonly measure: Measure;
  /** Model value, metres; null when no part matches. */
  readonly value: number | null;
  readonly ok: boolean;
  /** World end points along the measure's axis. */
  readonly a: Vec3;
  readonly b: Vec3;
  /** The measured parts' box. */
  readonly box: Box3;
}

export const fmtM = (v: number): string =>
  v >= 10 ? v.toFixed(1) : v >= 1 ? v.toFixed(2) : v.toFixed(3);
const AXIS = { x: 0, y: 1, z: 2 } as const;

/** A measure's label without its parenthesised provenance: 'driver diameter (5 ft 4 in)' → 'driver diameter'. */
export const shortLabel = (label: string): string =>
  label.replace(/\s*[([].*$/, '').slice(0, 30) || label.slice(0, 30);
const v3 = (xs: readonly number[]): Vec3 => [xs[0] ?? 0, xs[1] ?? 0, xs[2] ?? 0];

function union(bs: readonly (Box3 | null)[]): Box3 | null {
  const ok = bs.filter((b): b is Box3 => b !== null);
  if (!ok.length) return null;
  const k = [0, 1, 2] as const;
  return {
    min: v3(k.map((i) => Math.min(...ok.map((b) => b.min[i])))),
    max: v3(k.map((i) => Math.max(...ok.map((b) => b.max[i])))),
  };
}

export function measureResults(asset: CompiledAsset): MeasureResult[] {
  const meshes = [...worldMeshes(asset.parts)];
  const boxOf = (prefix: string): Box3 | null => {
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (const [n, m] of meshes) {
      if (n !== prefix && !n.startsWith(`${prefix}_`)) continue;
      for (let i = 0; i < m.positions.length; i++) {
        const k = i % 3;
        lo[k] = Math.min(lo[k] ?? 0, m.positions[i] ?? 0);
        hi[k] = Math.max(hi[k] ?? 0, m.positions[i] ?? 0);
      }
    }
    return Number.isFinite(lo[0]) ? { min: v3(lo), max: v3(hi) } : null;
  };
  return (asset.real?.measures ?? []).map((m) => {
    const k = AXIS[m.axis];
    const pair = m.between ? [boxOf(m.between[0]), boxOf(m.between[1])] : null;
    const box = pair ? union(pair) : union((m.parts ?? []).map(boxOf));
    const mid = (b: Box3 | null | undefined): number => (b ? (b.min[k] + b.max[k]) / 2 : 0);
    const [a0, a1] = pair ? [mid(pair[0]), mid(pair[1])] : [box?.min[k] ?? 0, box?.max[k] ?? 0];
    const value = box && (!pair || (pair[0] && pair[1])) ? Math.abs(a1 - a0) : null;
    const base = box?.min ?? [0, 0, 0];
    const end = (v: number): Vec3 => v3(base.map((x, i) => (i === k ? v : x)));
    return {
      measure: m,
      value,
      ok:
        value !== null && Math.abs(value - m.value) / m.value <= (m.tolerance ?? TOLERANCE.measure),
      a: end(Math.min(a0, a1)),
      b: end(Math.max(a0, a1)),
      box: box ?? { min: [0, 0, 0], max: [0, 0, 0] },
    };
  });
}

/** Overall L × W × H dimensions plus the measures that read in `view` (x, z: side · y: front). */
export function dimsFor(view: OrthoView, b: Box3, ms: readonly MeasureResult[]): DimSpec[] {
  const names = ['L', 'W', 'H'];
  const overall = ([0, 1, 2] as const).map(
    (k): DimSpec => ({
      a: b.min,
      b: v3(b.min.map((x, i) => (i === k ? b.max[k] : x))),
      axis: k,
      text: `${names[k]} ${fmtM(b.max[k] - b.min[k])} M`,
      rgb: INK,
      box: b,
    }),
  );
  const home = (m: Measure): string => (m.axis === 'y' ? 'FRONT +X' : 'SIDE -Y');
  const specs = ms
    .filter((r) => r.value !== null && home(r.measure) === view.label)
    .map(
      (r): DimSpec => ({
        a: r.a,
        b: r.b,
        axis: AXIS[r.measure.axis],
        text: `${shortLabel(r.measure.label)} ${fmtM(r.value ?? 0)}/${fmtM(r.measure.value)}`,
        rgb: r.ok ? OK : BAD,
        box: r.box,
      }),
    );
  return [...overall, ...specs];
}
