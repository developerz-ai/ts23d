// Gate: no unintended slits. Looks at the asset from all six sides (axis depth views) and finds
// narrow openings that drop far behind the surface on both sides — a door short of its header,
// a panel that misses its frame, light through a seam. `floating-parts` passes these (the parts
// touch somewhere); a viewer still sees the dark line. Intended openings are declared on the
// asset (`gaps: [{ parts: [...], why }]`); running clearance around spinning parts is exempt.

import {
  type Bounds,
  type CompiledAsset,
  type Mesh,
  type Vec3,
  worldMeshes,
} from '../core/index.ts';
import { type DepthView, depthViews, VIEW_NAMES, viewName } from './depth-views.ts';
import { glob } from './inspect.ts';
import { findSlits, type SlitOptions } from './slits.ts';
import type { Finding, Gate } from './types.ts';

export interface GapOptions extends Partial<SlitOptions> {
  /** Metres per pixel of the depth views; default 1/1600 of the longest side, ≥ 3 mm. */
  readonly px?: number;
  /** Sides to scan (VIEW_NAMES). Default all but '-Z': nobody sees an asset's underside, and
   *  running gear, sills and floors are all open from below. */
  readonly views?: readonly string[];
  /** Render every side even when not scanned (the overlay shows the underside too). */
  readonly overlayAll?: boolean;
  /** Also report slits between two pieces of ONE part. Off by default: inside a merged part they
   *  are nearly always authored repeats (track links, spare links, crystals, leaf clumps). */
  readonly withinParts?: boolean;
  /** Report declared/exempt slits too (the overlay shows them blue). */
  readonly includeAllowed?: boolean;
}

export interface Gap {
  /** The two parts on the slit's rims (the same part twice: a slit inside one part). */
  readonly parts: readonly [string, string];
  /** What you see at the bottom: a part, or null when you see through the asset. */
  readonly floor: string | null;
  readonly width: number;
  readonly length: number;
  /** How far one rim stands proud of the other (0 = flush). */
  readonly step: number;
  readonly depth: number;
  readonly at: Vec3;
  /** Side it was seen from: '+X', '-Z', … */
  readonly view: string;
  /** Why it is not a defect, when it is not (declared, or spinning clearance). */
  readonly allowed?: string;
  /** The view and pixels, for overlays. */
  readonly viewIndex: number;
  readonly pixels: readonly number[];
}

export interface GapScan {
  readonly gaps: Gap[];
  readonly views: DepthView[];
  readonly names: string[];
}

const boundsOfAll = (meshes: readonly Mesh[]): Bounds => {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const m of meshes)
    for (let i = 0; i < m.positions.length; i += 3)
      for (let k = 0; k < 3; k++) {
        const x = m.positions[i + k] ?? 0;
        if (x < (min[k] ?? 0)) min[k] = x;
        if (x > (max[k] ?? 0)) max[k] = x;
      }
  return { min, max };
};

/** Parts in a spinning subtree (wheels, rotors, turrets): their running clearance is real. */
function spinning(asset: CompiledAsset): Map<string, string> {
  const owner = new Map<string, string>();
  for (const p of asset.parts) {
    const up = p.parent ? owner.get(p.parent) : undefined;
    if (p.motion?.kind === 'spin') owner.set(p.name, p.name);
    else if (up) owner.set(p.name, up);
  }
  return owner;
}

function allowance(asset: CompiledAsset, a: string, b: string): string | undefined {
  for (const g of asset.gaps ?? []) {
    const [s0, s1] = g.parts.map((s) => glob(s));
    if (!s0) continue;
    const hit = s1
      ? (s0.test(a) && s1.test(b)) || (s0.test(b) && s1.test(a))
      : s0.test(a) || s0.test(b);
    if (hit) return `declared: ${g.why}`;
  }
  const cut = asset.parts.find(
    (p) => (p.name === a || p.name === b) && p.surface && p.surface !== 'opaque',
  );
  if (cut) return `'${cut.name}' is ${cut.surface}: its look is not its geometry`;
  const spin = spinning(asset);
  const sa = spin.get(a);
  const sb = spin.get(b);
  if ((sa || sb) && sa !== sb) return `running clearance of '${sa ?? sb}'`;
  return undefined;
}

/** Every slit in the asset from every side, worst first (widest × longest). */
export function scanGaps(asset: CompiledAsset, o: GapOptions = {}): GapScan {
  const world = worldMeshes(asset.parts);
  const names = [...world.keys()];
  const meshes = names.map((n) => world.get(n)).filter((m): m is Mesh => m !== undefined);
  if (meshes.length === 0) return { gaps: [], views: [], names };
  const bounds = boundsOfAll(meshes);
  const span = Math.max(...[0, 1, 2].map((k) => (bounds.max[k] ?? 0) - (bounds.min[k] ?? 0)));
  const px = o.px ?? Math.max(0.003, span / 1600);
  const opts: SlitOptions = {
    maxWidth: o.maxWidth ?? Math.max(0.05, 3 * px),
    minWidth: o.minWidth ?? Math.max(0.006, 2 * px),
    minDepth: o.minDepth ?? Math.max(0.1, 20 * px),
    minLength: o.minLength ?? Math.max(0.1, 20 * px),
    rimSpan: o.rimSpan ?? Math.max(0.08, 8 * px),
    maxStep: o.maxStep ?? Math.max(0.08, 8 * px),
  };
  const sides = o.views ?? VIEW_NAMES.filter((n) => n !== '-Z');
  const views = depthViews(meshes, bounds, px, o.overlayAll ? VIEW_NAMES : sides);
  const all: Gap[] = [];
  views.forEach((view, vi) => {
    if (!sides.includes(viewName(view))) return;
    for (const s of findSlits(view, opts)) {
      const a = names[s.rims[0]] ?? '?';
      const b = names[s.rims[1]] ?? '?';
      if (a === b && !o.withinParts) continue;
      const allowed = allowance(asset, a, b);
      if (allowed && !o.includeAllowed) continue;
      const gap: Gap = {
        parts: [a, b],
        floor: s.floor >= 0 ? (names[s.floor] ?? null) : null,
        width: s.width,
        length: s.length,
        step: s.step,
        depth: s.depth,
        at: [s.at[0], s.at[1], s.at[2]],
        view: viewName(view),
        ...(allowed ? { allowed } : {}),
        viewIndex: vi,
        pixels: s.pixels,
      };
      all.push(gap);
    }
  });
  const gaps = all.sort(
    (x, y) => y.length * y.width - x.length * x.width || (x.parts.join() < y.parts.join() ? -1 : 1),
  );
  return { gaps, views, names };
}

const cm = (m: number): string => `${(m * 100).toFixed(1)} cm`;
const xyz = (p: Vec3): string => `(${p.map((v) => v.toFixed(2)).join(', ')}) m`;

export const describeGap = (g: Gap): string => {
  const pair =
    g.parts[0] === g.parts[1] ? `inside '${g.parts[0]}'` : `'${g.parts[0]}' ↔ '${g.parts[1]}'`;
  const into = g.floor === null ? 'see-through' : `${cm(g.depth)} deep onto '${g.floor}'`;
  const proud = g.step >= 0.01 ? `, one rim ${cm(g.step)} proud of the other` : '';
  return `${cm(g.width)} slit ${pair}, ${cm(g.length)} long, ${into}${proud}, at ${xyz(g.at)} seen from ${g.view}`;
};

export const gapFinding = (g: Gap): Finding => ({
  gate: 'gaps',
  code: 'T3D_QA_GAPS',
  part: g.parts[0],
  message: describeGap(g),
  fix: `close it: extend/move '${g.parts[0]}' or '${g.parts[1]}' until they meet (or overlap ≥ 2 mm) — a door reaches its header, a panel its frame. If the opening is real (vent, running clearance, door seam), declare it: gaps: [{ parts: ['${g.parts[0]}', '${g.parts[1]}'], why: '…' }]. See it: t3d gaps <recipe>`,
});

/** Worst slit per rim pair (the same slot seen from two sides is one problem). */
export function worstPerPair(list: readonly Gap[]): Gap[] {
  const seen = new Set<string>();
  return list.filter((g) => {
    const k = g.parts.join('|');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** The gate: every undeclared slit is a finding (worst per pair of parts). LOD0 only, like
 *  `proportions`: a 1 cm slit is invisible at LOD1/2 distances, and the scan is not free. */
export const gaps: Gate = (asset) =>
  asset.lod === 0 ? worstPerPair(scanGaps(asset).gaps).map(gapFinding) : [];
